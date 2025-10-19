/**
 * Filename: src/core/app/services/auth/resendVerificationEmail.ts
 * Purpose: Allow users to request a fresh verification email without revealing account existence.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-10-31
 * License: MIT
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  Logger,
  MailerPort,
  UserEmailVerificationTokenRepository,
  UserRepository,
} from '@core/app';
import { renderVerificationEmail } from './templates/verificationEmail';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const hashEmail = (email: string) => createHash('sha256').update(email).digest('hex');

const DEFAULT_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export type ResendVerificationEmailInput = {
  email: string;
  locale?: string | null;
};

export type ResendVerificationEmailResult =
  | { ok: true }
  | { ok: false; reason: 'verification-disabled' };

export class ResendVerificationEmailService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly verificationTokens: UserEmailVerificationTokenRepository,
    private readonly mailer: MailerPort,
    private readonly logger: Logger,
    private readonly options: {
      baseUrl: string;
      appName: string;
      defaultLocale: string;
      verificationTokenTtlMs?: number;
      requireEmailVerification: boolean;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resend(input: ResendVerificationEmailInput): Promise<ResendVerificationEmailResult> {
    if (!this.options.requireEmailVerification) {
      this.logger.info('Skipped verification resend because feature flag is disabled.', {
        event: 'auth.verification.resend_skipped',
        outcome: 'skipped',
      });
      return { ok: false, reason: 'verification-disabled' };
    }

    const trimmedEmail = input.email.trim().toLowerCase();
    const emailHash = hashEmail(trimmedEmail);

    const user = await this.userRepository.findByEmail(trimmedEmail);

    if (!user) {
      this.logger.info('Verification resend requested for unknown email.', {
        event: 'auth.verification.resend_unknown_user',
        outcome: 'skipped',
        emailHash,
      });
      return { ok: true };
    }

    if (user.emailVerifiedAt) {
      this.logger.info('Verification resend skipped because account is already verified.', {
        event: 'auth.verification.resend_already_verified',
        outcome: 'skipped',
        emailHash,
        userAnonId: user.id,
      });
      return { ok: true };
    }

    await this.verificationTokens.deleteAllForUser(user.id);

    const token = randomBytes(32).toString('base64url');
    const ttl = this.options.verificationTokenTtlMs ?? DEFAULT_VERIFICATION_TOKEN_TTL_MS;
    const expiresAt = new Date(this.clock().getTime() + ttl);

    await this.verificationTokens.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    const verificationUrl = new URL('/auth/verify-email', this.options.baseUrl);
    verificationUrl.searchParams.set('token', token);

    const { subject, text, html } = renderVerificationEmail({
      recipientName: user.name,
      verificationUrl: verificationUrl.toString(),
      expiresAt,
      appName: this.options.appName,
      locale: input.locale ?? this.options.defaultLocale,
    });

    await this.mailer.send({
      to: { email: user.email, name: user.name },
      subject,
      text,
      html,
    });

    this.logger.info('Verification email resent successfully.', {
      event: 'auth.verification.resend_sent',
      outcome: 'pending',
      emailHash,
      userAnonId: user.id,
    });

    return { ok: true };
  }
}

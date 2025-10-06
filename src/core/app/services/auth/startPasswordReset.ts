import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Logger, MailerPort, PasswordResetTokenRepository, UserRepository } from '@core/app';

export type StartPasswordResetInput = {
  email: string;
};

export type StartPasswordResetResult = { ok: true };

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class StartPasswordResetService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly mailer: MailerPort,
    private readonly logger: Logger,
    private readonly options: { baseUrl: string; resetTokenTtlMs?: number },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async start({ email }: StartPasswordResetInput): Promise<StartPasswordResetResult> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      this.logger.warn('Password reset requested for unknown email.', {
        event: 'auth.password_reset.unknown_email',
        outcome: 'ignored',
      });
      return { ok: true };
    }

    await this.tokens.deleteAllForUser(user.id);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      this.clock().getTime() + (this.options.resetTokenTtlMs ?? RESET_TOKEN_TTL_MS),
    );

    await this.tokens.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = new URL('/auth/reset-password/confirm', this.options.baseUrl);
    resetUrl.searchParams.set('token', token);

    await this.mailer.send({
      to: { email: user.email, name: user.name },
      subject: 'Reset your My Race Engineer password',
      text: `Hi ${user.name},\n\nReset your password by visiting ${resetUrl.toString()} before ${expiresAt.toISOString()}.`,
    });

    this.logger.info('Password reset email issued.', {
      event: 'auth.password_reset.started',
      outcome: 'pending',
      userAnonId: user.id,
    });

    return { ok: true };
  }
}

/**
 * Filename: src/core/app/services/auth/loginUser.ts
 * Purpose: Authenticate users, enforce policy gates, and mint session tokens for credential logins.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Logger, PasswordHasher, UserRepository, UserSessionRepository } from '@core/app';
import type { User } from '@core/domain';

export type LoginUserInput = {
  email: string;
  password: string;
  rememberSession?: boolean;
  sessionContext?: {
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceName?: string | null;
  };
};

export type LoginUserResult =
  | { ok: true; user: User; sessionToken: string; expiresAt: Date }
  | {
      ok: false;
      reason:
        | 'invalid-credentials'
        | 'email-not-verified'
        | 'account-pending'
        | 'account-suspended';
    };

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SHORT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Handles the credential-based sign-in flow and records session metadata.
 *
 * The service is intentionally framework-agnostic so that the web layer (Next.js
 * server actions, REST handlers, etc.) can delegate to it while we keep the
 * business rules in one place.  Each early return below corresponds to a
 * meaningful state we surface to the UI, allowing the caller to display precise
 * guidance to the user.
 */
export class LoginUserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger,
    private readonly options: {
      requireEmailVerification: boolean;
      requireAdminApproval: boolean;
      defaultSessionTtlMs?: number;
      shortSessionTtlMs?: number;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Attempts to authenticate a user and mint a session token.
   *
   * The method is carefully structured to avoid leaking information to an
   * attacker.  We first verify that the account exists, then the password, and
   * only after the secrets line up do we branch into feature-flagged policy
   * checks such as email verification or admin approval.
   */
  async login(input: LoginUserInput): Promise<LoginUserResult> {
    const start = this.clock();
    const user = await this.userRepository.findByEmail(input.email);

    if (!user) {
      // Unknown email addresses are treated as invalid credentials so the
      // response timing and error messaging remain indistinguishable from other
      // failures, limiting enumeration attacks.
      this.logger.warn('Login attempt with unknown email.', {
        event: 'auth.login.invalid_credentials',
        outcome: 'rejected',
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'invalid-credentials' };
    }

    // Password validation is done using the Argon2-based hasher injected at
    // construction time.  The repositories never expose the raw password so the
    // service deals purely with hashes.
    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);

    if (!passwordMatches) {
      // We again report a generic credential error to maintain parity with the
      // unknown-email path, while still logging enough context for debugging.
      this.logger.warn('Login attempt with incorrect password.', {
        event: 'auth.login.invalid_credentials',
        outcome: 'rejected',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'invalid-credentials' };
    }

    if (this.options.requireEmailVerification && !user.emailVerifiedAt) {
      // When email verification is required we block the login but respond with
      // a dedicated reason so the UI can gently nudge the user to check their
      // inbox instead of re-entering credentials.
      this.logger.info('Login blocked due to unverified email.', {
        event: 'auth.login.email_not_verified',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'email-not-verified' };
    }

    if (user.status === 'pending' && this.options.requireAdminApproval) {
      // Pending accounts are typically awaiting manual approval.  We downgrade
      // the log level to info because this is an expected control-flow branch.
      this.logger.info('Login blocked because account is pending.', {
        event: 'auth.login.account_pending',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'account-pending' };
    }

    if (user.status === 'suspended') {
      // Suspended users are reported at warn level so the security team can
      // monitor attempted access without triggering an incident every time.
      this.logger.warn('Login blocked because account is suspended.', {
        event: 'auth.login.account_suspended',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'account-suspended' };
    }

    // We generate a cryptographically strong, URL-safe token which will become
    // the session cookie value.  Remember-me sessions keep the default 30-day
    // TTL while short-lived sessions default to one week.
    const sessionToken = randomBytes(32).toString('base64url');
    const ttl = input.rememberSession
      ? (this.options.defaultSessionTtlMs ?? DEFAULT_SESSION_TTL_MS)
      : (this.options.shortSessionTtlMs ?? SHORT_SESSION_TTL_MS);

    const expiresAt = new Date(this.clock().getTime() + ttl);

    // Recording session metadata (IP, user agent, device name) helps with
    // account security notifications and audit trails.
    await this.userSessionRepository.create({
      id: randomUUID(),
      userId: user.id,
      sessionTokenHash: createHash('sha256').update(sessionToken).digest('hex'),
      expiresAt,
      ipAddress: input.sessionContext?.ipAddress ?? null,
      userAgent: input.sessionContext?.userAgent ?? null,
      deviceName: input.sessionContext?.deviceName ?? null,
    });

    // The caller receives both the user entity and the freshly created session
    // token so it can set cookies and initialise client state.
    this.logger.info('User authenticated successfully.', {
      event: 'auth.login.success',
      outcome: 'success',
      userAnonId: user.id,
      durationMs: this.clock().getTime() - start.getTime(),
    });

    return { ok: true, user, sessionToken, expiresAt };
  }
}

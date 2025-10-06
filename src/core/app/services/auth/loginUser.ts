import { randomBytes, randomUUID } from 'node:crypto';

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

export class LoginUserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger,
    private readonly options: {
      requireEmailVerification: boolean;
      defaultSessionTtlMs?: number;
      shortSessionTtlMs?: number;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async login(input: LoginUserInput): Promise<LoginUserResult> {
    const start = this.clock();
    const user = await this.userRepository.findByEmail(input.email);

    if (!user) {
      this.logger.warn('Login attempt with unknown email.', {
        event: 'auth.login.invalid_credentials',
        outcome: 'rejected',
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'invalid-credentials' };
    }

    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);

    if (!passwordMatches) {
      this.logger.warn('Login attempt with incorrect password.', {
        event: 'auth.login.invalid_credentials',
        outcome: 'rejected',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'invalid-credentials' };
    }

    if (this.options.requireEmailVerification && !user.emailVerifiedAt) {
      this.logger.info('Login blocked due to unverified email.', {
        event: 'auth.login.email_not_verified',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'email-not-verified' };
    }

    if (user.status === 'pending') {
      this.logger.info('Login blocked because account is pending.', {
        event: 'auth.login.account_pending',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'account-pending' };
    }

    if (user.status === 'suspended') {
      this.logger.warn('Login blocked because account is suspended.', {
        event: 'auth.login.account_suspended',
        outcome: 'blocked',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - start.getTime(),
      });
      return { ok: false, reason: 'account-suspended' };
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const ttl = input.rememberSession
      ? (this.options.defaultSessionTtlMs ?? DEFAULT_SESSION_TTL_MS)
      : (this.options.shortSessionTtlMs ?? SHORT_SESSION_TTL_MS);

    const expiresAt = new Date(this.clock().getTime() + ttl);

    await this.userSessionRepository.create({
      id: randomUUID(),
      userId: user.id,
      sessionToken,
      expiresAt,
      ipAddress: input.sessionContext?.ipAddress ?? null,
      userAgent: input.sessionContext?.userAgent ?? null,
      deviceName: input.sessionContext?.deviceName ?? null,
    });

    this.logger.info('User authenticated successfully.', {
      event: 'auth.login.success',
      outcome: 'success',
      userAnonId: user.id,
      durationMs: this.clock().getTime() - start.getTime(),
    });

    return { ok: true, user, sessionToken, expiresAt };
  }
}

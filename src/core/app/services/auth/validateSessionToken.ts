import { createHash } from 'node:crypto';

import type { Logger, UserRepository, UserSessionRepository } from '@core/app';
import type { User, UserSession } from '@core/domain';

export type ValidateSessionTokenInput = {
  token: string;
};

export type ValidateSessionTokenFailureReason =
  | 'session-not-found'
  | 'session-revoked'
  | 'session-expired'
  | 'user-not-found'
  | 'user-pending'
  | 'user-suspended';

export type ValidateSessionTokenResult =
  | { ok: true; user: User; session: UserSession }
  | { ok: false; reason: ValidateSessionTokenFailureReason };

const fingerprintTokenHash = (tokenHash: string): string => tokenHash.slice(0, 12);

export class ValidateSessionTokenService {
  constructor(
    private readonly sessions: UserSessionRepository,
    private readonly users: UserRepository,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async validate(input: ValidateSessionTokenInput): Promise<ValidateSessionTokenResult> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const tokenFingerprint = fingerprintTokenHash(tokenHash);
    const session = await this.sessions.findByTokenHash(tokenHash);

    if (!session) {
      this.logger.warn('Session token validation failed: session not found.', {
        event: 'auth.session.validate',
        outcome: 'session-not-found',
        tokenHashPrefix: tokenFingerprint,
      });
      return { ok: false, reason: 'session-not-found' };
    }

    if (session.revokedAt) {
      this.logger.warn('Session token validation failed: session revoked.', {
        event: 'auth.session.validate',
        outcome: 'session-revoked',
        tokenHashPrefix: tokenFingerprint,
        sessionId: session.id,
        userAnonId: session.userId,
      });
      return { ok: false, reason: 'session-revoked' };
    }

    const now = this.clock();
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn('Session token validation failed: session expired.', {
        event: 'auth.session.validate',
        outcome: 'session-expired',
        tokenHashPrefix: tokenFingerprint,
        sessionId: session.id,
        userAnonId: session.userId,
        expiredAt: session.expiresAt.toISOString(),
      });
      return { ok: false, reason: 'session-expired' };
    }

    const user = await this.users.findById(session.userId);

    if (!user) {
      this.logger.error('Session token validation failed: user missing.', {
        event: 'auth.session.validate',
        outcome: 'user-not-found',
        tokenHashPrefix: tokenFingerprint,
        sessionId: session.id,
        userAnonId: session.userId,
      });
      return { ok: false, reason: 'user-not-found' };
    }

    if (user.status === 'pending') {
      this.logger.info('Session token blocked: user pending activation.', {
        event: 'auth.session.validate',
        outcome: 'user-pending',
        tokenHashPrefix: tokenFingerprint,
        sessionId: session.id,
        userAnonId: user.id,
      });
      return { ok: false, reason: 'user-pending' };
    }

    if (user.status === 'suspended') {
      this.logger.warn('Session token blocked: user suspended.', {
        event: 'auth.session.validate',
        outcome: 'user-suspended',
        tokenHashPrefix: tokenFingerprint,
        sessionId: session.id,
        userAnonId: user.id,
      });
      return { ok: false, reason: 'user-suspended' };
    }

    this.logger.info('Session token validated successfully.', {
      event: 'auth.session.validate',
      outcome: 'success',
      tokenHashPrefix: tokenFingerprint,
      sessionId: session.id,
      userAnonId: user.id,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });

    return { ok: true, user, session };
  }
}

import { createHash } from 'node:crypto';

import type { Logger, UserEmailVerificationTokenRepository, UserRepository } from '@core/app';
import type { User } from '@core/domain';

export type VerifyEmailInput = {
  token: string;
};

export type VerifyEmailResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid-token' | 'user-not-found' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class VerifyEmailService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokens: UserEmailVerificationTokenRepository,
    private readonly logger: Logger,
    private readonly options: { requireAdminApproval: boolean },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async verify({ token }: VerifyEmailInput): Promise<VerifyEmailResult> {
    const hashed = hashToken(token);
    const tokenRecord = await this.tokens.findActiveByTokenHash(hashed);

    if (!tokenRecord) {
      this.logger.warn('Email verification attempted with invalid token.', {
        event: 'auth.verify_email.invalid_token',
        outcome: 'rejected',
      });
      return { ok: false, reason: 'invalid-token' };
    }

    const user = await this.userRepository.findById(tokenRecord.userId);
    if (!user) {
      this.logger.error('Email verification token references missing user.', {
        event: 'auth.verify_email.user_missing',
        outcome: 'error',
        userAnonId: tokenRecord.userId,
      });
      return { ok: false, reason: 'user-not-found' };
    }

    const verifiedAt = this.clock();
    await this.tokens.markConsumed(tokenRecord.id, verifiedAt);
    const updatedUser = await this.userRepository.updateEmailVerification(user.id, verifiedAt);

    if (updatedUser.status === 'pending' && !this.options.requireAdminApproval) {
      const activatedUser = await this.userRepository.updateStatus(user.id, 'active');
      this.logger.info('Email verified and account activated.', {
        event: 'auth.verify_email.success',
        outcome: 'success',
        userAnonId: user.id,
      });
      return {
        ok: true,
        user: activatedUser,
      };
    }

    this.logger.info('Email verification completed.', {
      event: 'auth.verify_email.success',
      outcome: 'success',
      userAnonId: user.id,
    });

    return { ok: true, user: updatedUser };
  }
}

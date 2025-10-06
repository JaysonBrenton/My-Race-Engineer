import { createHash } from 'node:crypto';

import type {
  Logger,
  PasswordHasher,
  PasswordResetTokenRepository,
  UserRepository,
  UserSessionRepository,
} from '@core/app';

export type ConfirmPasswordResetInput = {
  token: string;
  newPassword: string;
};

export type ConfirmPasswordResetResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-token' | 'weak-password' | 'user-not-found' };

const PASSWORD_MIN_LENGTH = 12;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const isPasswordStrong = (password: string) =>
  password.length >= PASSWORD_MIN_LENGTH &&
  /[0-9]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

export class ConfirmPasswordResetService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly sessions: UserSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async confirm(input: ConfirmPasswordResetInput): Promise<ConfirmPasswordResetResult> {
    if (!isPasswordStrong(input.newPassword)) {
      this.logger.warn('Password reset rejected due to weak password.', {
        event: 'auth.password_reset.weak_password',
        outcome: 'rejected',
      });
      return { ok: false, reason: 'weak-password' };
    }

    const hashed = hashToken(input.token);
    const token = await this.tokens.findActiveByTokenHash(hashed);

    if (!token) {
      this.logger.warn('Password reset attempted with invalid token.', {
        event: 'auth.password_reset.invalid_token',
        outcome: 'rejected',
      });
      return { ok: false, reason: 'invalid-token' };
    }

    const user = await this.userRepository.findById(token.userId);

    if (!user) {
      this.logger.error('Password reset token references missing user.', {
        event: 'auth.password_reset.user_missing',
        outcome: 'error',
        userAnonId: token.userId,
      });
      return { ok: false, reason: 'user-not-found' };
    }

    const consumedAt = this.clock();
    await this.tokens.markConsumed(token.id, consumedAt);
    const newPasswordHash = await this.passwordHasher.hash(input.newPassword);
    await this.userRepository.updatePasswordHash(user.id, newPasswordHash);
    await this.sessions.revokeAllForUser(user.id);

    this.logger.info('Password reset confirmed and sessions revoked.', {
      event: 'auth.password_reset.confirmed',
      outcome: 'success',
      userAnonId: user.id,
    });

    return { ok: true };
  }
}

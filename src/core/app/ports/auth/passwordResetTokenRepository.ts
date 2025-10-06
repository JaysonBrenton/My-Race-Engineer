import type { CreatePasswordResetTokenInput, PasswordResetToken } from '@core/domain';

export interface PasswordResetTokenRepository {
  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken>;
  findActiveByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markConsumed(id: string, consumedAt: Date): Promise<PasswordResetToken>;
  deleteAllForUser(userId: string): Promise<void>;
}

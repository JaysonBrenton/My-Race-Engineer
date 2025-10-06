import type {
  CreateUserEmailVerificationTokenInput,
  UserEmailVerificationToken,
} from '@core/domain';

export interface UserEmailVerificationTokenRepository {
  create(input: CreateUserEmailVerificationTokenInput): Promise<UserEmailVerificationToken>;
  findActiveByTokenHash(tokenHash: string): Promise<UserEmailVerificationToken | null>;
  markConsumed(id: string, consumedAt: Date): Promise<UserEmailVerificationToken>;
  deleteAllForUser(userId: string): Promise<void>;
}

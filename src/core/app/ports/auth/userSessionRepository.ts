import type { CreateUserSessionInput, UserSession } from '@core/domain';

export interface UserSessionRepository {
  create(session: CreateUserSessionInput): Promise<UserSession>;
  findByTokenHash(tokenHash: string): Promise<UserSession | null>;
  revokeAllForUser(userId: string): Promise<void>;
}

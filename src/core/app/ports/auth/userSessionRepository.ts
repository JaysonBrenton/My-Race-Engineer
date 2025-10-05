import type { CreateUserSessionInput, UserSession } from '@core/domain';

export interface UserSessionRepository {
  create(session: CreateUserSessionInput): Promise<UserSession>;
}

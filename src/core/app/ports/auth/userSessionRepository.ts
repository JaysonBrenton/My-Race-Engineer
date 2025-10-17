/**
 * Filename: src/core/app/ports/auth/userSessionRepository.ts
 * Purpose: Define the contract for persisting and revoking authenticated user sessions.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-01-15
 * License: MIT
 */

import type { CreateUserSessionInput, UserSession } from '@core/domain';

export interface UserSessionRepository {
  create(session: CreateUserSessionInput): Promise<UserSession>;
  findByTokenHash(tokenHash: string): Promise<UserSession | null>;
  revokeAllForUser(userId: string): Promise<void>;
  revokeById(sessionId: string): Promise<void>;
}

/**
 * Filename: src/core/app/services/auth/logoutUserSession.ts
 * Purpose: Provide a focused use case for revoking individual user sessions during logout flows.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-01-15
 * License: MIT
 */

import type { Logger, UserSessionRepository } from '@core/app';

export type LogoutUserSessionInput = {
  sessionId: string;
  userId: string;
};

/**
 * Revokes a specific authenticated session and records an audit log entry.
 */
export class LogoutUserSessionService {
  constructor(
    private readonly userSessionRepository: UserSessionRepository,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async logout(input: LogoutUserSessionInput): Promise<void> {
    const timestamp = this.clock();

    await this.userSessionRepository.revokeById(input.sessionId);

    this.logger.info('User session revoked.', {
      event: 'auth.logout.session_revoked',
      outcome: 'success',
      userAnonId: input.userId,
      sessionId: input.sessionId,
      revokedAt: timestamp.toISOString(),
    });
  }
}

/**
 * File: src/core/app/services/auth/deleteUserAccount.service.ts
 * Author: Jayson Brenton
 * Date: 2025-10-19
 * License: MIT
 * Purpose: Application service to delete the current user account.
 *          Order of operations: revoke all sessions → delete user → log.
 *          Idempotent: deleteById() is expected to swallow P2025 (not found).
 */

import { UserRepository } from '@/core/app/ports/auth/userRepository';
import { UserSessionRepository } from '@/core/app/ports/auth/userSessionRepository';

// Narrow logger contract to avoid coupling to a concrete logger type
export type LoggerLike = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export class DeleteUserAccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: UserSessionRepository,
    private readonly log: LoggerLike,
  ) {}

  /**
   * Deletes the account for the provided userId. Safe to re-run.
   */
  async execute(userId: string): Promise<void> {
    // Revoke all active sessions first to force immediate logout on other devices
    await this.sessions.revokeAllForUser(userId);

    // Delete the user row (idempotent if already gone)
    await this.users.deleteById(userId);

    this.log.info({ event: 'account.deleted', userId }, 'Account deleted');
  }
}

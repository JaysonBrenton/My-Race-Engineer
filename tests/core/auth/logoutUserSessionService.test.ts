/**
 * Filename: tests/core/auth/logoutUserSessionService.test.ts
 * Purpose: Verify that the logout service revokes sessions and emits audit logs.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-01-15
 * License: MIT
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LogoutUserSessionService } from '../../../src/core/app/services/auth/logoutUserSession';
import type { UserSession } from '../../../src/core/domain';
import {
  InMemoryLogger,
  RecordingUserSessionRepository,
  createFixedClock,
} from './__fixtures__/inMemoryAuthAdapters';

const buildSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  id: 'session-123',
  userId: 'user-456',
  sessionTokenHash: 'hashed-token',
  expiresAt: new Date('2025-02-01T00:00:00.000Z'),
  ipAddress: null,
  userAgent: null,
  deviceName: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  ...overrides,
});

test('logout revokes the active session and logs the event', async () => {
  const now = new Date('2025-01-15T12:00:00.000Z');
  const clock = createFixedClock(now);
  const repository = new RecordingUserSessionRepository(clock);
  const logger = new InMemoryLogger();
  const service = new LogoutUserSessionService(repository, logger, clock);

  const session = buildSession();
  repository.seed(session);

  await service.logout({ sessionId: session.id, userId: session.userId });

  const revoked = await repository.findByTokenHash(session.sessionTokenHash);
  assert.ok(revoked);
  assert.ok(revoked.revokedAt, 'Expected the session to be marked revoked');
  assert.equal(revoked.revokedAt?.toISOString(), now.toISOString());

  const infoEntry = logger.entries.find((entry) => entry.level === 'info');
  assert.ok(infoEntry, 'Expected an info log entry to be recorded');
  assert.equal(infoEntry?.message, 'User session revoked.');
});

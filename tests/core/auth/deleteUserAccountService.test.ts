/**
 * Filename: tests/core/auth/deleteUserAccountService.test.ts
 * Purpose: Ensure the account deletion flow revokes sessions, removes the user, and logs the audit event.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-10-19
 * License: MIT
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DeleteUserAccountService } from '../../../src/core/app/services/auth/deleteUserAccount.service';
import type { User, UserSession } from '../../../src/core/domain';
import {
  InMemoryUserRepository,
  RecordingUserSessionRepository,
  createFixedClock,
} from './__fixtures__/inMemoryAuthAdapters';

class RecordingDeleteAccountLogger {
  public readonly infoCalls: Array<{ obj: Record<string, unknown>; msg?: string }> = [];
  public readonly errorCalls: Array<{ obj: Record<string, unknown>; msg?: string }> = [];

  info(obj: Record<string, unknown>, msg?: string): void {
    this.infoCalls.push({ obj, msg });
  }

  error(obj: Record<string, unknown>, msg?: string): void {
    this.errorCalls.push({ obj, msg });
  }
}

class OrderTrackingUserRepository extends InMemoryUserRepository {
  constructor(private readonly order: string[], clock = () => new Date()) {
    super(clock);
  }

  override async deleteById(userId: string): Promise<void> {
    this.order.push(`delete:${userId}`);
    await super.deleteById(userId);
  }
}

class OrderTrackingUserSessionRepository extends RecordingUserSessionRepository {
  constructor(private readonly order: string[], clock = () => new Date()) {
    super(clock);
  }

  override async revokeAllForUser(userId: string): Promise<void> {
    this.order.push(`revoke:${userId}`);
    await super.revokeAllForUser(userId);
  }
}

const buildUser = (): User => ({
  id: 'user-123',
  name: 'Jordan Race',
  driverName: 'JRace',
  email: 'jordan@example.com',
  passwordHash: 'hashed-secret',
  status: 'active',
  emailVerifiedAt: new Date('2025-01-05T00:00:00.000Z'),
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
});

const buildSession = (userId: string): UserSession => ({
  id: 'session-789',
  userId,
  sessionTokenHash: 'token-hash',
  expiresAt: new Date('2025-02-01T00:00:00.000Z'),
  ipAddress: '203.0.113.42',
  userAgent: 'unit-test',
  deviceName: 'Spec Runner',
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date('2025-01-10T00:00:00.000Z'),
  updatedAt: new Date('2025-01-10T00:00:00.000Z'),
});

test('account deletion revokes sessions, removes the user, and records an audit log', async () => {
  const now = new Date('2025-01-20T12:00:00.000Z');
  const clock = createFixedClock(now);
  const callOrder: string[] = [];
  const userRepository = new OrderTrackingUserRepository(callOrder, clock);
  const sessionRepository = new OrderTrackingUserSessionRepository(callOrder, clock);
  const logger = new RecordingDeleteAccountLogger();
  const service = new DeleteUserAccountService(userRepository, sessionRepository, logger);

  const user = buildUser();
  userRepository.seed(user);

  const session = buildSession(user.id);
  sessionRepository.seed(session);

  await service.execute(user.id);

  const revokedSession = await sessionRepository.findByTokenHash(session.sessionTokenHash);
  assert.ok(revokedSession, 'Expected the session to still be retrievable');
  assert.ok(revokedSession?.revokedAt, 'Expected the session to be revoked');
  assert.equal(revokedSession?.revokedAt?.toISOString(), now.toISOString());

  const deletedUser = await userRepository.findById(user.id);
  assert.equal(deletedUser, null);

  assert.deepEqual(callOrder, [`revoke:${user.id}`, `delete:${user.id}`]);

  assert.equal(logger.infoCalls.length, 1);
  assert.deepEqual(logger.infoCalls[0], {
    obj: { event: 'account.deleted', userId: user.id },
    msg: 'Account deleted',
  });
  assert.equal(logger.errorCalls.length, 0);
});

test('account deletion is idempotent when rerun for the same user', async () => {
  const clock = createFixedClock(new Date('2025-01-20T12:00:00.000Z'));
  const userRepository = new OrderTrackingUserRepository([], clock);
  const sessionRepository = new OrderTrackingUserSessionRepository([], clock);
  const logger = new RecordingDeleteAccountLogger();
  const service = new DeleteUserAccountService(userRepository, sessionRepository, logger);

  const user = buildUser();
  userRepository.seed(user);

  await service.execute(user.id);

  await assert.doesNotReject(() => service.execute(user.id));

  assert.equal(logger.infoCalls.length, 2);
});

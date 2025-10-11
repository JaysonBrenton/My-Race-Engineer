import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { ValidateSessionTokenService } from '../../../src/core/app/services/auth/validateSessionToken';
import type { User, UserSession } from '../../../src/core/domain';
import {
  InMemoryLogger,
  InMemoryUserRepository,
  RecordingUserSessionRepository,
  createFixedClock,
} from './__fixtures__/inMemoryAuthAdapters';

const now = new Date('2025-01-01T00:00:00.000Z');
const clock = createFixedClock(now);

const buildUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.com',
  passwordHash: 'hash',
  status: 'active',
  emailVerifiedAt: new Date(now.getTime() - 60_000),
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  id: 'session-1',
  userId: overrides.userId ?? 'user-1',
  sessionTokenHash:
    overrides.sessionTokenHash ?? createHash('sha256').update('valid-token').digest('hex'),
  expiresAt: overrides.expiresAt ?? new Date(now.getTime() + 60_000),
  ipAddress: overrides.ipAddress ?? null,
  userAgent: overrides.userAgent ?? null,
  deviceName: overrides.deviceName ?? null,
  lastUsedAt: overrides.lastUsedAt ?? null,
  revokedAt: overrides.revokedAt ?? null,
  createdAt: overrides.createdAt ?? now,
  updatedAt: overrides.updatedAt ?? now,
});

const createService = () => {
  const userRepository = new InMemoryUserRepository(clock);
  const sessionRepository = new RecordingUserSessionRepository(clock);
  const logger = new InMemoryLogger();
  const service = new ValidateSessionTokenService(
    sessionRepository,
    userRepository,
    logger,
    clock,
  );

  return { service, userRepository, sessionRepository };
};

test('validate returns authenticated result for an active session', async () => {
  const { service, userRepository, sessionRepository } = createService();
  const rawToken = 'valid-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
  });
  sessionRepository.seed(session);
  userRepository.seed(buildUser({ id: session.userId }));

  const result = await service.validate({ token: rawToken });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.id, session.userId);
    assert.equal(result.session.id, session.id);
  }
});

test('validate reports session-not-found when the token is unknown', async () => {
  const { service } = createService();

  const result = await service.validate({ token: 'missing-token' });

  assert.deepEqual(result, { ok: false, reason: 'session-not-found' });
});

test('validate reports session-expired when the token is stale', async () => {
  const { service, userRepository, sessionRepository } = createService();
  const rawToken = 'expired-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(now.getTime() - 1),
  });
  sessionRepository.seed(session);
  userRepository.seed(buildUser({ id: session.userId }));

  const result = await service.validate({ token: rawToken });

  assert.deepEqual(result, { ok: false, reason: 'session-expired' });
});

test('validate reports session-revoked when the session has been revoked', async () => {
  const { service, userRepository, sessionRepository } = createService();
  const rawToken = 'revoked-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
    revokedAt: now,
  });
  sessionRepository.seed(session);
  userRepository.seed(buildUser({ id: session.userId }));

  const result = await service.validate({ token: rawToken });

  assert.deepEqual(result, { ok: false, reason: 'session-revoked' });
});

test('validate reports user-not-found when the session owner is missing', async () => {
  const { service, sessionRepository } = createService();
  const rawToken = 'orphan-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
  });
  sessionRepository.seed(session);

  const result = await service.validate({ token: rawToken });

  assert.deepEqual(result, { ok: false, reason: 'user-not-found' });
});

test('validate reports user-pending when the account is not activated', async () => {
  const { service, userRepository, sessionRepository } = createService();
  const rawToken = 'pending-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
  });
  sessionRepository.seed(session);
  userRepository.seed(buildUser({ id: session.userId, status: 'pending' }));

  const result = await service.validate({ token: rawToken });

  assert.deepEqual(result, { ok: false, reason: 'user-pending' });
});

test('validate reports user-suspended when the account is suspended', async () => {
  const { service, userRepository, sessionRepository } = createService();
  const rawToken = 'suspended-token';
  const session = buildSession({
    sessionTokenHash: createHash('sha256').update(rawToken).digest('hex'),
  });
  sessionRepository.seed(session);
  userRepository.seed(buildUser({ id: session.userId, status: 'suspended' }));

  const result = await service.validate({ token: rawToken });

  assert.deepEqual(result, { ok: false, reason: 'user-suspended' });
});

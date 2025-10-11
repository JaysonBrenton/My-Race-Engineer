/**
 * Filename: tests/core/auth/registerUserService.test.ts
 * Purpose: Validate registration domain service behaviour across feature flag combinations.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { RegisterUserService } from '../../../src/core/app/services/auth/registerUser';
import { DuplicateUserEmailError } from '../../../src/core/app/errors/duplicateUserEmailError';
import type { User } from '../../../src/core/domain';
import {
  DeterministicPasswordHasher,
  InMemoryLogger,
  InMemoryUserRepository,
  InMemoryVerificationTokenRepository,
  InMemoryRegistrationUnitOfWork,
  RecordingMailer,
  RecordingUserSessionRepository,
  createFixedClock,
  type RegisterServiceOptions,
} from './__fixtures__/inMemoryAuthAdapters';

const fixedNow = new Date('2025-01-01T00:00:00.000Z');
const clock = createFixedClock(fixedNow);

const buildService = (overrides?: {
  repository?: InMemoryUserRepository;
  sessionRepository?: RecordingUserSessionRepository;
  passwordHasher?: DeterministicPasswordHasher;
  tokenRepository?: InMemoryVerificationTokenRepository;
  mailer?: RecordingMailer;
  options?: Partial<RegisterServiceOptions>;
}) => {
  const repository = overrides?.repository ?? new InMemoryUserRepository(clock);
  const sessionRepository =
    overrides?.sessionRepository ?? new RecordingUserSessionRepository(clock);
  const passwordHasher = overrides?.passwordHasher ?? new DeterministicPasswordHasher();
  const tokenRepository =
    overrides?.tokenRepository ?? new InMemoryVerificationTokenRepository(clock);
  const mailer = overrides?.mailer ?? new RecordingMailer();
  const logger = new InMemoryLogger();
  const options = {
    requireEmailVerification: false,
    requireAdminApproval: false,
    baseUrl: 'https://app.local',
    ...overrides?.options,
  };

  const service = new RegisterUserService(
    repository,
    passwordHasher,
    mailer,
    logger,
    new InMemoryRegistrationUnitOfWork({
      userRepository: repository,
      userSessionRepository: sessionRepository,
      emailVerificationTokens: tokenRepository,
    }),
    options,
    clock,
  );

  return { service, repository, sessionRepository, passwordHasher, tokenRepository, mailer, logger };
};

test('rejects weak passwords without touching persistence', async () => {
  const { service, repository, passwordHasher } = buildService();

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'short',
  });

  assert.deepEqual(result, { ok: false, reason: 'weak-password' });
  assert.equal(repository.created, null);
  assert.equal(passwordHasher.hashed.length, 0);
});

test('returns email-taken when repository already contains the address', async () => {
  const { service, repository } = buildService();
  const existingUser: User = {
    id: 'user-1',
    name: 'Existing User',
    email: 'user@example.com',
    passwordHash: 'hashed:password',
    status: 'active',
    emailVerifiedAt: new Date('2024-12-31T00:00:00Z'),
    createdAt: new Date('2024-12-01T00:00:00Z'),
    updatedAt: new Date('2024-12-01T00:00:00Z'),
  };
  repository.seed(existingUser);

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.deepEqual(result, { ok: false, reason: 'email-taken' });
});

test('issues verification email and token when verification is required', async () => {
  const { service, tokenRepository, mailer } = buildService({
    options: { requireEmailVerification: true },
  });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'verify-email');
    assert.equal(result.session, undefined);
    assert.equal(result.user.status, 'pending');
  }

  assert.equal(tokenRepository.deletedForUser.length, 1);
  assert.equal(tokenRepository.tokens.length, 1);
  const tokenRecord = tokenRepository.tokens[0];
  const message = mailer.sent[0];
  assert.ok(message, 'mailer should send a verification email');
  const urlMatch = message.text.match(/https?:\/\/[\S]+/);
  assert.ok(urlMatch, 'verification URL should be present in email body');
  const urlText = urlMatch[0].replace(/\.$/, '');
  const verificationUrl = new URL(urlText);
  assert.equal(verificationUrl.origin + verificationUrl.pathname, 'https://app.local/auth/verify-email');
  const token = verificationUrl.searchParams.get('token');
  assert.ok(token, 'token should be present in the verification URL');
  const hashed = createHash('sha256').update(token).digest('hex');
  assert.equal(tokenRecord.tokenHash, hashed);
  const expectedExpiry = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000);
  assert.equal(tokenRecord.expiresAt.getTime(), expectedExpiry.getTime());
});

test('returns await-approval when admin approval is required', async () => {
  const { service, tokenRepository, mailer, sessionRepository } = buildService({
    options: { requireAdminApproval: true },
  });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'await-approval');
    assert.equal(result.session, undefined);
    assert.equal(result.user.status, 'pending');
  }

  assert.equal(tokenRepository.tokens.length, 0);
  assert.equal(mailer.sent.length, 0);
  assert.equal(sessionRepository.createdSessions.length, 0);
});

test('creates a session when verification is not required', async () => {
  const { service, sessionRepository, passwordHasher } = buildService();

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
    rememberSession: true,
    sessionContext: { ipAddress: '203.0.113.10', userAgent: 'jest' },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'session-created');
    assert.ok(result.session);
    assert.equal(sessionRepository.createdSessions.length, 1);
    const created = sessionRepository.createdSessions[0];
    assert.equal(created.userId, result.user.id);
    assert.equal(created.ipAddress, '203.0.113.10');
    const expectedExpiry = new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.equal(created.expiresAt.getTime(), expectedExpiry.getTime());
    assert.equal(result.session?.expiresAt.getTime(), expectedExpiry.getTime());
    assert.ok(result.session?.token);
    if (result.session) {
      const hashedToken = createHash('sha256').update(result.session.token).digest('hex');
      assert.equal(created.sessionTokenHash, hashedToken);
    }
  }

  assert.deepEqual(passwordHasher.hashed, ['P@ssword12345']);
});

test('returns verify-email-await-approval when both verification and admin approval are required', async () => {
  const { service, tokenRepository, mailer, sessionRepository } = buildService({
    options: { requireEmailVerification: true, requireAdminApproval: true },
  });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'verify-email-await-approval');
    assert.equal(result.session, undefined);
    assert.equal(result.user.status, 'pending');
  }

  assert.equal(tokenRepository.tokens.length, 1);
  assert.equal(mailer.sent.length, 1);
  assert.equal(sessionRepository.createdSessions.length, 0);
});

test('maps unique constraint violations during creation to email-taken', async () => {
  class ThrowingUserRepository extends InMemoryUserRepository {
    async create(): Promise<User> {
      throw new DuplicateUserEmailError('user@example.com');
    }
  }

  const repository = new ThrowingUserRepository(clock);
  const { service, tokenRepository, sessionRepository } = buildService({ repository });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.deepEqual(result, { ok: false, reason: 'email-taken' });
  assert.equal(tokenRepository.tokens.length, 0);
  assert.equal(sessionRepository.createdSessions.length, 0);
});

test('rolls back user creation when verification email dispatch fails', async () => {
  class FailingMailer extends RecordingMailer {
    async send(): Promise<void> {
      throw new Error('smtp-offline');
    }
  }

  const mailer = new FailingMailer();
  const { service, repository, tokenRepository } = buildService({
    mailer,
    options: { requireEmailVerification: true },
  });

  await assert.rejects(
    () =>
      service.register({
        name: 'Example User',
        email: 'user@example.com',
        password: 'P@ssword12345',
      }),
    /smtp-offline/,
  );

  assert.equal(repository.usersById.size, 0);
  assert.equal(tokenRepository.tokens.length, 0);
});

/**
 * Filename: tests/core/auth/resendVerificationEmailService.test.ts
 * Purpose: Exercise resend verification email domain logic and ensure security safeguards.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-10-31
 * License: MIT
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { ResendVerificationEmailService } from '../../../src/core/app/services/auth/resendVerificationEmail';
import type { User } from '../../../src/core/domain';
import {
  InMemoryLogger,
  InMemoryUserRepository,
  InMemoryVerificationTokenRepository,
  RecordingMailer,
  createFixedClock,
} from './__fixtures__/inMemoryAuthAdapters';

const fixedNow = new Date('2025-01-01T00:00:00.000Z');
const clock = createFixedClock(fixedNow);

const buildService = (overrides?: {
  requireEmailVerification?: boolean;
}) => {
  const userRepository = new InMemoryUserRepository(clock);
  const verificationTokens = new InMemoryVerificationTokenRepository(clock);
  const mailer = new RecordingMailer();
  const logger = new InMemoryLogger();

  const service = new ResendVerificationEmailService(
    userRepository,
    verificationTokens,
    mailer,
    logger,
    {
      baseUrl: 'https://app.local',
      appName: 'My Race Engineer',
      defaultLocale: 'en',
      requireEmailVerification: overrides?.requireEmailVerification ?? true,
    },
    clock,
  );

  return { service, userRepository, verificationTokens, mailer, logger };
};

test('returns verification-disabled when feature flag is off', async () => {
  const { service } = buildService({ requireEmailVerification: false });

  const result = await service.resend({ email: 'user@example.com' });

  assert.deepEqual(result, { ok: false, reason: 'verification-disabled' });
});

test('silently succeeds when user does not exist', async () => {
  const { service, mailer, verificationTokens } = buildService();

  const result = await service.resend({ email: 'missing@example.com' });

  assert.deepEqual(result, { ok: true });
  assert.equal(mailer.sent.length, 0);
  assert.equal(verificationTokens.tokens.length, 0);
});

test('does not send email when account already verified', async () => {
  const { service, userRepository, mailer, verificationTokens } = buildService();

  const user: User = {
    id: 'user-1',
    name: 'Verified Driver',
    driverName: 'VerifiedDriver',
    email: 'verified@example.com',
    passwordHash: 'hash',
    status: 'active',
    emailVerifiedAt: new Date('2024-12-31T12:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  userRepository.seed(user);

  const result = await service.resend({ email: 'verified@example.com' });

  assert.deepEqual(result, { ok: true });
  assert.equal(mailer.sent.length, 0);
  assert.equal(verificationTokens.tokens.length, 0);
});

test('queues new verification token and email for pending users', async () => {
  const { service, userRepository, verificationTokens, mailer } = buildService();

  const user: User = {
    id: 'user-2',
    name: 'Pending Driver',
    driverName: 'PendingDriver',
    email: 'pending@example.com',
    passwordHash: 'hash',
    status: 'pending',
    emailVerifiedAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
  userRepository.seed(user);

  const result = await service.resend({ email: 'pending@example.com' });

  assert.deepEqual(result, { ok: true });
  assert.equal(verificationTokens.deletedForUser.length, 1);
  assert.equal(verificationTokens.deletedForUser[0], 'user-2');
  assert.equal(verificationTokens.tokens.length, 1);
  const tokenRecord = verificationTokens.tokens[0];
  const message = mailer.sent[0];

  assert.ok(message, 'verification email should be sent');
  assert.equal(message.subject, 'Verify your My Race Engineer account');
  const urlMatch = message.text.match(/https?:\/\/[\S]+/);
  assert.ok(urlMatch, 'plain text payload should include verification URL');
  const url = new URL(urlMatch[0]);
  const token = url.searchParams.get('token');
  assert.ok(token, 'verification URL should include token');
  assert.equal(tokenRecord.tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.ok(message.html?.includes(token));
});

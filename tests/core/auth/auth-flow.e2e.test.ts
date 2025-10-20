/**
 * Filename: tests/core/auth/auth-flow.e2e.test.ts
 * Purpose: Exercise end-to-end auth flows across registration and login domain services.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createAuthTestEnvironment,
  createFixedClock,
} from './__fixtures__/inMemoryAuthAdapters';

const fixedNow = new Date('2025-01-01T00:00:00.000Z');

const buildClock = () => createFixedClock(fixedNow);

test('registration requires verification before login succeeds when enabled', async () => {
  const env = createAuthTestEnvironment({
    clock: buildClock(),
    register: { requireEmailVerification: true },
  });

  const registerResult = await env.registerService.register({
    name: 'Flow User',
    driverName: 'Flow Driver',
    email: 'flow-user@example.com',
    password: 'Str0ngPassword!23',
  });

  assert.equal(registerResult.ok, true);
  if (!registerResult.ok) {
    return;
  }

  assert.equal(registerResult.nextStep, 'verify-email');
  assert.equal(registerResult.user.status, 'pending');
  assert.equal(env.registerMailer.sent.length, 1);
  assert.equal(env.verificationTokens.tokens.length, 1);

  const loginBeforeVerification = await env.loginService.login({
    identifier: { kind: 'email', value: 'flow-user@example.com' },
    password: 'Str0ngPassword!23',
  });

  assert.deepEqual(loginBeforeVerification, { ok: false, reason: 'email-not-verified' });

  const verifiedAt = new Date(fixedNow.getTime() + 5 * 60 * 1000);
  await env.userRepository.updateEmailVerification(registerResult.user.id, verifiedAt);
  await env.userRepository.updateStatus(registerResult.user.id, 'active');

  const loginAfterVerification = await env.loginService.login({
    identifier: { kind: 'email', value: 'flow-user@example.com' },
    password: 'Str0ngPassword!23',
    rememberSession: true,
    sessionContext: { ipAddress: '203.0.113.42', userAgent: 'node:test' },
  });

  assert.equal(loginAfterVerification.ok, true);
  if (loginAfterVerification.ok) {
    assert.equal(loginAfterVerification.user.id, registerResult.user.id);
    assert.equal(env.sessionRepository.createdSessions.length, 1);
    const session = env.sessionRepository.createdSessions[0];
    assert.equal(session.userId, registerResult.user.id);
    assert.equal(session.ipAddress, '203.0.113.42');
    const expectedHash = createHash('sha256')
      .update(loginAfterVerification.sessionToken)
      .digest('hex');
    assert.equal(session.sessionTokenHash, expectedHash);
    assert.equal(session.expiresAt.getTime(), loginAfterVerification.expiresAt.getTime());
  }
});

test('admin approval blocks login until status becomes active', async () => {
  const env = createAuthTestEnvironment({
    clock: buildClock(),
    register: { requireAdminApproval: true },
    login: { requireEmailVerification: false },
  });

  const registerResult = await env.registerService.register({
    name: 'Pending User',
    driverName: 'Pending Driver',
    email: 'pending-user@example.com',
    password: 'An0therStrongPass!9',
  });

  assert.equal(registerResult.ok, true);
  if (!registerResult.ok) {
    return;
  }

  assert.equal(registerResult.nextStep, 'await-approval');
  assert.equal(registerResult.user.status, 'pending');
  assert.equal(env.sessionRepository.createdSessions.length, 0);

  const loginWhilePending = await env.loginService.login({
    identifier: { kind: 'email', value: 'pending-user@example.com' },
    password: 'An0therStrongPass!9',
  });

  assert.deepEqual(loginWhilePending, { ok: false, reason: 'account-pending' });

  await env.userRepository.updateStatus(registerResult.user.id, 'active');

  const loginAfterApproval = await env.loginService.login({
    identifier: { kind: 'email', value: 'pending-user@example.com' },
    password: 'An0therStrongPass!9',
    sessionContext: { ipAddress: '198.51.100.24' },
  });

  assert.equal(loginAfterApproval.ok, true);
  if (loginAfterApproval.ok) {
    assert.equal(env.sessionRepository.createdSessions.length, 1);
    const [session] = env.sessionRepository.createdSessions;
    assert.equal(session.userId, registerResult.user.id);
    assert.equal(session.ipAddress, '198.51.100.24');
  }
});

test('driver name identifiers authenticate successfully', async () => {
  const env = createAuthTestEnvironment({ clock: buildClock() });

  const registerResult = await env.registerService.register({
    name: 'Driver Name User',
    driverName: 'Unique Driver',
    email: 'driver-name@example.com',
    password: 'Sup3rStr0ngPass!',
  });

  assert.equal(registerResult.ok, true);
  if (!registerResult.ok) {
    return;
  }

  const loginResult = await env.loginService.login({
    identifier: { kind: 'driver-name', value: 'Unique Driver' },
    password: 'Sup3rStr0ngPass!',
  });

  assert.equal(loginResult.ok, true);
  if (loginResult.ok) {
    assert.equal(loginResult.user.id, registerResult.user.id);
  }
});

test('driver name login treats casing as equivalent', async () => {
  const env = createAuthTestEnvironment({ clock: buildClock() });

  const registerResult = await env.registerService.register({
    name: 'Case Shift',
    driverName: 'MixedCaseDriver',
    email: 'case-shift@example.com',
    password: 'Sup3rStr0ngPass!',
  });

  assert.equal(registerResult.ok, true);
  if (!registerResult.ok) {
    return;
  }

  const loginResult = await env.loginService.login({
    identifier: { kind: 'driver-name', value: 'mixedcasedriver' },
    password: 'Sup3rStr0ngPass!',
  });

  assert.equal(loginResult.ok, true);
  if (loginResult.ok) {
    assert.equal(loginResult.user.id, registerResult.user.id);
  }
});

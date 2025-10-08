/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Verify auth origin parsing and guard behaviour.
 * License: MIT
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { guardAuthPostOrigin, normalizeOrigin, parseAllowedOrigins } from '../../../src/core/security/origin';

const originalEnv = {
  APP_URL: process.env.APP_URL,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  DEV_TRUST_LOCAL_ORIGINS: process.env.DEV_TRUST_LOCAL_ORIGINS,
};

const restoreEnv = () => {
  if (originalEnv.APP_URL === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalEnv.APP_URL;
  }

  if (originalEnv.ALLOWED_ORIGINS === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = originalEnv.ALLOWED_ORIGINS;
  }

  if (originalEnv.DEV_TRUST_LOCAL_ORIGINS === undefined) {
    delete process.env.DEV_TRUST_LOCAL_ORIGINS;
  } else {
    process.env.DEV_TRUST_LOCAL_ORIGINS = originalEnv.DEV_TRUST_LOCAL_ORIGINS;
  }
};

test.afterEach(() => {
  restoreEnv();
});

void test('normalizeOrigin lowercases scheme/host and strips trailing slashes', () => {
  assert.equal(normalizeOrigin('HTTPS://Example.com:3001///'), 'https://example.com:3001');
});

void test('parseAllowedOrigins prioritises ALLOWED_ORIGINS and deduplicates entries', () => {
  process.env.ALLOWED_ORIGINS = ' https://example.com/ ,http://localhost:3001/,https://EXAMPLE.com ';

  const allowed = parseAllowedOrigins(process.env);

  assert.deepEqual(allowed, ['https://example.com', 'http://localhost:3001']);
});

void test('parseAllowedOrigins falls back to APP_URL and appends dev defaults', () => {
  delete process.env.ALLOWED_ORIGINS;
  process.env.APP_URL = 'https://example.com/app';
  process.env.DEV_TRUST_LOCAL_ORIGINS = 'true';

  const allowed = parseAllowedOrigins(process.env);

  assert.deepEqual(allowed, [
    'https://example.com',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://10.211.55.13:3001',
  ]);
});

void test('guardAuthPostOrigin allows configured origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const allowed = parseAllowedOrigins(process.env);
  const request = new Request('https://app.local/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
    },
  });

  const result = guardAuthPostOrigin(request, allowed);

  assert.equal(result.ok, true);
});

void test('guardAuthPostOrigin reports mismatched origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const allowed = parseAllowedOrigins(process.env);
  const request = new Request('https://app.local/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
    },
  });

  const result = guardAuthPostOrigin(request, allowed);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mismatch');
  assert.equal(result.redirectTo, 'https://app.local/auth/login?error=invalid-origin');
});

void test('guardAuthPostOrigin reports missing origins when headers are absent', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const allowed = parseAllowedOrigins(process.env);
  const request = new Request('https://app.local/auth/register', {
    method: 'POST',
  });

  const result = guardAuthPostOrigin(request, allowed);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.equal(result.redirectTo, 'https://app.local/auth/register?error=invalid-origin');
});

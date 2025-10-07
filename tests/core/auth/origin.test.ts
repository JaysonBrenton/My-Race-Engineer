import assert from 'node:assert/strict';
import test from 'node:test';

import { getAllowedOrigins } from '../../../src/core/auth/getAllowedOrigins';
import { guardAuthPostOrigin } from '../../../src/core/auth/guardAuthPostOrigin';

const originalAppUrl = process.env.APP_URL;
const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

const restoreEnv = () => {
  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }

  if (originalAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  }
};

test.afterEach(() => {
  restoreEnv();
});

test('getAllowedOrigins normalises entries and removes duplicates', () => {
  process.env.ALLOWED_ORIGINS = ' https://example.com/ ,http://localhost:3001/,https://EXAMPLE.com ';

  const allowed = getAllowedOrigins();

  assert.equal(allowed.size, 2);
  assert(allowed.has('https://example.com'));
  assert(allowed.has('http://localhost:3001'));
});

test('getAllowedOrigins falls back to APP_URL when explicit origins are missing', () => {
  delete process.env.ALLOWED_ORIGINS;
  process.env.APP_URL = 'https://example.com/app';

  const allowed = getAllowedOrigins();

  assert.equal(allowed.size, 1);
  assert(allowed.has('https://example.com'));
});

test('guardAuthPostOrigin allows configured origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';

  const request = new Request('https://app.local/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
    },
  });

  const result = guardAuthPostOrigin(request, '/auth/login');

  assert.equal(result, null);
});

test('guardAuthPostOrigin redirects mismatched origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';

  const request = new Request('https://app.local/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
    },
  });

  const result = guardAuthPostOrigin(request, '/auth/login');

  assert(result instanceof Response);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://app.local/auth/login?error=invalid-origin');
});

test('guardAuthPostOrigin redirects when origin header is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';

  const request = new Request('https://app.local/auth/register', {
    method: 'POST',
  });

  const result = guardAuthPostOrigin(request, '/auth/register');

  assert(result instanceof Response);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://app.local/auth/register?error=invalid-origin');
});

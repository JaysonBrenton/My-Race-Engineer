import assert from 'node:assert/strict';
import test from 'node:test';

import { validateOrigin } from '../src/server/security/origin';

const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

const restoreEnv = () => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  }
};

test.afterEach(() => {
  restoreEnv();
});

test('validateOrigin accepts requests that match the configured origin', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers({
    origin: 'https://example.com',
  });

  assert.equal(validateOrigin(headers), 'ok');
});

test('validateOrigin falls back to referer when origin is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers({
    referer: 'https://example.com/path',
  });

  assert.equal(validateOrigin(headers), 'ok');
});

test('validateOrigin returns mismatch for unexpected origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers({
    origin: 'https://attacker.com',
  });

  assert.equal(validateOrigin(headers), 'mismatch');
});

test('validateOrigin reports missing when no headers are present', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers();

  assert.equal(validateOrigin(headers), 'missing');
});

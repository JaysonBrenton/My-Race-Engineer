import assert from 'node:assert/strict';
import test from 'node:test';

import { getAllowedOrigins, isCookieSecure } from '../src/server/runtime';

const originalAppUrl = process.env.APP_URL;
const originalCookieSecure = process.env.COOKIE_SECURE;
const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

const restoreEnv = () => {
  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }

  if (originalCookieSecure === undefined) {
    delete process.env.COOKIE_SECURE;
  } else {
    process.env.COOKIE_SECURE = originalCookieSecure;
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

test('isCookieSecure returns false for http app URLs by default', () => {
  process.env.APP_URL = 'http://localhost:3001';
  delete process.env.COOKIE_SECURE;

  assert.equal(isCookieSecure(), false);
});

test('isCookieSecure prefers explicit env override', () => {
  process.env.APP_URL = 'http://localhost:3001';
  process.env.COOKIE_SECURE = 'true';

  assert.equal(isCookieSecure(), true);
});

test('isCookieSecure returns true when APP_URL is https', () => {
  process.env.APP_URL = 'https://example.com';
  delete process.env.COOKIE_SECURE;

  assert.equal(isCookieSecure(), true);
});

test('getAllowedOrigins trims entries and removes trailing slashes', () => {
  process.env.ALLOWED_ORIGINS = ' https://example.com/ ,http://localhost:3001/,https://EXAMPLE.com ';

  assert.deepEqual(getAllowedOrigins(), [
    'https://example.com',
    'http://localhost:3001',
    'https://example.com',
  ]);
});

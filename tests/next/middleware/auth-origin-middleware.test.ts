/**
 * Author: Jayson + The Brainy One
 * Date: 2025-03-18
 * Purpose: Verify auth origin middleware edge handling for allowed and disallowed POSTs.
 * License: MIT License
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { middleware } from '../../../src/middleware';

const createRequest = (url: string, init?: RequestInit): Request => new Request(url, init);

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

const expectPassThrough = (response: Response | undefined) => {
  assert(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
};

test('middleware allows POSTs from configured origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://app.local:3001',
    },
  });

  const response = middleware(request);

  expectPassThrough(response ?? undefined);
});

test('middleware redirects login POSTs with mismatched origins using 303', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
    },
  });

  const response = middleware(request);

  assert(response);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://app.local:3001/auth/login?error=invalid-origin');
});

test('middleware redirects register POSTs with mismatched origins using 303', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/register', {
    method: 'POST',
    headers: {
      origin: 'https://attacker.example',
    },
  });

  const response = middleware(request);

  assert(response);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://app.local:3001/auth/register?error=invalid-origin');
});

test('middleware allows register POSTs when origin header is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/register', {
    method: 'POST',
  });

  const response = middleware(request);

  expectPassThrough(response ?? undefined);
});

test('middleware allows login POSTs when origin header is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/login', {
    method: 'POST',
  });

  const response = middleware(request);

  expectPassThrough(response ?? undefined);
});


import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

import { middleware } from '../../../middleware';

const createRequest = (url: string, init?: RequestInit): NextRequest => {
  const request = new Request(url, init);

  return {
    headers: request.headers,
    method: request.method,
    nextUrl: new URL(url),
    url,
  } as unknown as NextRequest;
};

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

test('middleware allows POSTs from configured origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://app.local:3001',
    },
  });

  const response = middleware(request);

  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get('location'), null);
});

test('middleware redirects login POSTs with mismatched origins', () => {
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

test('middleware redirects register POSTs when origin header is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.local:3001';

  const request = createRequest('https://app.local:3001/auth/register', {
    method: 'POST',
  });

  const response = middleware(request);

  assert(response);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://app.local:3001/auth/register?error=invalid-origin');
});

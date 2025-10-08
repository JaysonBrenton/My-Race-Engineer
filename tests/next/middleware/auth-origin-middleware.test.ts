/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Validate middleware origin guard handling for auth POST requests.
 * License: MIT
 */

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
  assert.equal(response?.headers.get('x-auth-origin-guard'), 'ok');
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
  assert.equal(response.headers.get('x-auth-origin-guard'), 'mismatch');
  assert.equal(response.headers.get('x-allowed-origins'), 'https://app.local:3001');
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
  assert.equal(response.headers.get('x-auth-origin-guard'), 'mismatch');
  assert.equal(response.headers.get('x-allowed-origins'), 'https://app.local:3001');
});

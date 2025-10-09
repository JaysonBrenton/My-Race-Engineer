/**
 * Filename: tests/origin.test.ts
 * Purpose: Smoke-test the origin evaluation helper exposed for server-side adapters.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateOriginHeader, parseAllowedOrigins } from '../src/core/security/origin';

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

const evaluate = (headers: Headers) => {
  const allowed = parseAllowedOrigins(process.env);
  return evaluateOriginHeader(headers.get('origin'), allowed);
};

test('evaluateOriginHeader accepts requests that match the configured origin', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers({
    origin: 'https://example.com',
  });

  const decision = evaluate(headers);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'allowed');
});

test('evaluateOriginHeader allows requests when origin is missing', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers();

  const decision = evaluate(headers);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'no-origin-header');
});

test('evaluateOriginHeader rejects unexpected origins', () => {
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const headers = new Headers({
    origin: 'https://attacker.com',
  });

  const decision = evaluate(headers);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'origin-not-allowed');
});


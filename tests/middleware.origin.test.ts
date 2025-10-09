/**
 * Filename: tests/middleware.origin.test.ts
 * Purpose: Validate origin parsing and evaluation used by the authentication middleware.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateOriginHeader,
  normalizeOrigin,
  parseAllowedOrigins,
  type OriginEvaluation,
} from '../src/core/security/origin';

test('parseAllowedOrigins normalises entries and removes duplicates', () => {
  const env = {
    ALLOWED_ORIGINS: 'HTTP://Example.com:443/, https://another.test, https://another.test/ ',
  };

  const result = parseAllowedOrigins(env);

  assert.deepEqual(result, ['http://example.com:443', 'https://another.test']);
});

test('parseAllowedOrigins falls back to APP_URL when no explicit list is provided', () => {
  const env = {
    APP_URL: 'https://mre.example.com',
  };

  const result = parseAllowedOrigins(env);

  assert.deepEqual(result, ['https://mre.example.com']);
});

test('evaluateOriginHeader accepts matching origins regardless of trailing slash or case', () => {
  const allowed = ['http://localhost:3001'];
  const decision: OriginEvaluation = evaluateOriginHeader('HTTP://LOCALHOST:3001/', allowed);

  assert.equal(decision.allowed, true);
  assert.equal(decision.origin, normalizeOrigin('http://localhost:3001/'));
});

test('evaluateOriginHeader allows requests without an Origin header', () => {
  const allowed = ['http://localhost:3001'];
  const decision = evaluateOriginHeader(null, allowed);

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'no-origin-header');
});

test('evaluateOriginHeader rejects origins not in the allow list', () => {
  const allowed = ['https://mre.example.com'];
  const decision = evaluateOriginHeader('https://unknown.example.com', allowed);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'origin-not-allowed');
});


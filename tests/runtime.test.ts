/**
 * Filename: tests/runtime.test.ts
 * Purpose: Verify runtime helpers for cookie security flags honour environment expectations.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { isCookieSecure } from '../src/server/runtime';

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;

const setNodeEnv = (value: string | undefined) => {
  if (value === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = value;
  }
};

test.afterEach(() => {
  setNodeEnv(originalNodeEnv);
});

test('isCookieSecure disables the Secure attribute outside production', () => {
  setNodeEnv('development');

  assert.equal(isCookieSecure(), false);
});

test('isCookieSecure enables the Secure attribute in production', () => {
  setNodeEnv('production');

  assert.equal(isCookieSecure(), true);
});

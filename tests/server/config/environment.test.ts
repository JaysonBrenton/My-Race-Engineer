/**
 * Filename: tests/server/config/environment.test.ts
 * Purpose: Ensure environment configuration parsing and validation behave as expected.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentValidationError,
  parseEnvironment,
} from '../../../src/server/config/environment';

const buildSecret = () => 'a'.repeat(40);

test('parseEnvironment returns canonicalised configuration', () => {
  const config = parseEnvironment({
    APP_URL: 'https://example.com/',
    SESSION_SECRET: buildSecret(),
    ALLOWED_ORIGINS: 'https://example.com, http://localhost:3001/',
    TRUST_PROXY: 'true',
    NEXT_PUBLIC_BASE_URL: 'https://public.example.com',
    FEATURE_REQUIRE_EMAIL_VERIFICATION: '1',
    FEATURE_REQUIRE_ADMIN_APPROVAL: '0',
    FEATURE_INVITE_ONLY: 'false',
  });

  assert.equal(config.appUrl.toString(), 'https://example.com/');
  assert.equal(config.appOrigin, 'https://example.com');
  assert.deepEqual(config.allowedOrigins, ['https://example.com', 'http://localhost:3001']);
  assert.equal(config.trustProxy, true);
  assert.equal(config.nextPublicBaseUrl?.toString(), 'https://public.example.com/');
  assert.equal(config.features.requireEmailVerification, true);
  assert.equal(config.features.requireAdminApproval, false);
  assert.equal(config.features.inviteOnly, false);
});

test('parseEnvironment falls back to APP_URL origin when ALLOWED_ORIGINS is missing', () => {
  const config = parseEnvironment({
    APP_URL: 'https://example.com',
    SESSION_SECRET: buildSecret(),
  });

  assert.deepEqual(config.allowedOrigins, ['https://example.com']);
  assert.equal(config.trustProxy, false);
  assert.equal(config.nextPublicBaseUrl, null);
  assert.equal(config.features.requireEmailVerification, true);
  assert.equal(config.features.requireAdminApproval, false);
  assert.equal(config.features.inviteOnly, false);
});

test('parseEnvironment surfaces validation issues for invalid entries', () => {
  assert.throws(
    () => {
      parseEnvironment({
        APP_URL: 'not-a-url',
        SESSION_SECRET: 'short',
        TRUST_PROXY: 'maybe',
      });
    },
    (error: unknown) => {
      if (!(error instanceof EnvironmentValidationError)) {
        return false;
      }

      const keys = error.issues.map((issue) => issue.key).sort();
      assert.deepEqual(keys, ['APP_URL', 'SESSION_SECRET', 'TRUST_PROXY']);
      return true;
    },
  );
});

test('parseEnvironment requires ALLOWED_ORIGINS to include APP_URL when provided', () => {
  assert.throws(
    () => {
      parseEnvironment({
        APP_URL: 'https://example.com',
        SESSION_SECRET: buildSecret(),
        ALLOWED_ORIGINS: 'https://other.example.com',
      });
    },
    (error: unknown) => {
      if (!(error instanceof EnvironmentValidationError)) {
        return false;
      }

      const issue = error.issues.find((entry) => entry.key === 'ALLOWED_ORIGINS');
      assert.ok(issue);
      assert.match(issue.message, /should include APP_URL origin/);
      return true;
    },
  );
});

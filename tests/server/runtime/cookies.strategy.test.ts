import assert from 'node:assert/strict';
import test from 'node:test';

import { computeCookieSecure } from '../../../src/server/runtime/cookies';

const env = process.env as Record<string, string | undefined>;
const original = {
  NODE_ENV: env.NODE_ENV,
  APP_URL: env.APP_URL,
  TRUST_PROXY: env.TRUST_PROXY,
  COOKIE_SECURE_STRATEGY: env.COOKIE_SECURE_STRATEGY,
};

const restoreEnv = () => {
  Object.entries(original).forEach(([key, value]) => {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  });
};

test.afterEach(() => {
  restoreEnv();
});

const setEnv = (overrides: Partial<typeof original>) => {
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  });
};

test('auto strategy respects APP_URL scheme when proxy headers are absent', () => {
  setEnv({ NODE_ENV: 'production', APP_URL: 'http://example.test' });

  const secure = computeCookieSecure({
    strategy: 'auto',
    trustProxy: false,
    appUrl: env.APP_URL ?? null,
    forwardedProto: null,
  });

  assert.equal(secure, false);
});

test('auto strategy enables Secure when APP_URL is https://', () => {
  setEnv({ NODE_ENV: 'production', APP_URL: 'https://example.test' });

  const secure = computeCookieSecure({
    strategy: 'auto',
    trustProxy: false,
    appUrl: env.APP_URL ?? null,
    forwardedProto: null,
  });

  assert.equal(secure, true);
});

test('auto strategy trusts proxy headers when enabled', () => {
  setEnv({ NODE_ENV: 'production', TRUST_PROXY: 'true', APP_URL: 'http://example.test' });

  const secure = computeCookieSecure({
    strategy: 'auto',
    trustProxy: env.TRUST_PROXY === 'true',
    appUrl: env.APP_URL ?? null,
    forwardedProto: 'https',
  });

  assert.equal(secure, true);
});

test('explicit strategy overrides environment heuristics', () => {
  const alwaysSecure = computeCookieSecure({ strategy: 'always' });
  const neverSecure = computeCookieSecure({ strategy: 'never' });

  assert.equal(alwaysSecure, true);
  assert.equal(neverSecure, false);
});

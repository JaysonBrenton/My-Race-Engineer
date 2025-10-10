/**
 * Author: Jayson + The Brainy One
 * Date: 2025-03-18
 * Purpose: Ensure the built middleware manifest preserves the auth route matcher.
 * License: MIT License
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const manifestPath = join(process.cwd(), '.next', 'server', 'middleware-manifest.json');

test('middleware manifest includes /auth/:path* matcher', (t) => {
  if (!existsSync(manifestPath)) {
    t.skip('middleware manifest not generated. Run "npm run build" before this check.');
    return;
  }

  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as {
    middleware?: Record<string, { matchers?: Array<{ originalSource?: string }> }>;
  };

  const matchers = Object.values(manifest.middleware ?? {}).flatMap((entry) => entry.matchers ?? []);
  const hasAuthMatcher = matchers.some((matcher) => matcher.originalSource === '/auth/:path*');

  assert(hasAuthMatcher, 'Expected middleware manifest to contain /auth/:path* matcher.');
});

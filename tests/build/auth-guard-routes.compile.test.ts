/**
 * Filename: tests/build/auth-guard-routes.compile.test.ts
 * Purpose: Ensure the auth guard route modules load without violating build constraints.
 * Author: OpenAI Assistant
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const loadModule = async (modulePath: string) => import(modulePath);

test('login guard route module loads without throwing', async () => {
  const module = await loadModule('../../src/app/(auth)/auth/login/(guard)/route');
  assert.equal(typeof module.POST, 'function');
});

test('register guard route module loads without throwing', async () => {
  const module = await loadModule('../../src/app/(auth)/auth/register/(guard)/route');
  assert.equal(typeof module.POST, 'function');
});

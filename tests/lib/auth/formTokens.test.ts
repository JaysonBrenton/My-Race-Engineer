import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeAuthFormToken,
  generateAuthFormToken,
  validateAuthFormToken,
} from '../../../src/lib/auth/formTokens';
import { __resetEnvironmentCacheForTests } from '../../../src/server/config/environment';

test('generateAuthFormToken produces tokens that validate successfully', () => {
  process.env.APP_URL = 'http://localhost:3001';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3001';
  process.env.SESSION_SECRET = '12345678901234567890123456789012';
  process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3001';
  __resetEnvironmentCacheForTests();

  const token = generateAuthFormToken('registration');
  const description = describeAuthFormToken(token);

  assert.equal(description.prefix, 'mre-auth');
  assert.equal(description.context, 'registration');
  assert.ok(
    typeof description.issuedAtMs === 'number' && Number.isFinite(description.issuedAtMs),
    'expected issuedAtMs to be a finite number',
  );

  const validation = validateAuthFormToken(token, 'registration');
  assert.equal(validation.ok, true, `expected token to validate but got ${JSON.stringify(validation)}`);
});

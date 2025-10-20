import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canShowResolveButton,
  type ParsedState,
} from '../src/app/(dashboard)/import/parsedState';

test('canShowResolveButton returns true for HTML links when resolver enabled', () => {
  const parsed: ParsedState = { kind: 'html' };
  assert.equal(canShowResolveButton(true, parsed), true);
});

test('canShowResolveButton returns true for JSON links missing suffix when resolver enabled', () => {
  const parsed = {
    kind: 'json',
    result: {} as unknown,
    canonicalAbsoluteJsonUrl: 'https://example.com/results/a.json',
    wasMissingJsonSuffix: true,
  } as ParsedState;

  assert.equal(canShowResolveButton(true, parsed), true);
});

test('canShowResolveButton returns false when resolver disabled', () => {
  const parsed: ParsedState = { kind: 'html' };
  assert.equal(canShowResolveButton(false, parsed), false);
});

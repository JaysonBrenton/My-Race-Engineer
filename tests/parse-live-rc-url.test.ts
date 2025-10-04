import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLiveRcUrl } from '../src/core/liverc/urlParser';

test('parseLiveRcUrl preserves nested base paths for JSON endpoints', () => {
  const result = parseLiveRcUrl(
    'https://example.com/prefix/results/event-1/class-a/round-2/race-3.json',
  );

  assert.equal(result.type, 'json');
  if (result.type !== 'json') {
    return;
  }

  assert.equal(result.resultsBaseUrl, 'https://example.com/prefix/results');
  assert.equal(
    result.canonicalJsonPath,
    '/prefix/results/event-1/class-a/round-2/race-3.json',
  );
  assert.deepEqual(result.slugs, ['event-1', 'class-a', 'round-2', 'race-3']);
});

test('parseLiveRcUrl normalises canonical JSON paths without nested prefixes', () => {
  const result = parseLiveRcUrl('https://example.com/results/event/class/round/race');

  assert.equal(result.type, 'json');
  if (result.type !== 'json') {
    return;
  }

  assert.equal(result.resultsBaseUrl, 'https://example.com/results');
  assert.equal(result.canonicalJsonPath, '/results/event/class/round/race.json');
  assert.deepEqual(result.slugs, ['event', 'class', 'round', 'race']);
});

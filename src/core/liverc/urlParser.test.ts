import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LiveRcUrlInvalidReasons,
  parseLiveRcUrl,
  type LiveRcJsonUrlParseResult,
  type LiveRcInvalidUrlParseResult,
} from './urlParser';

void test('parseLiveRcUrl preserves origin and slug casing for valid JSON results URLs', () => {
  const url =
    'https://canberraoffroad.liverc.com/results/SUMMER SERIES/2WD Buggy/Round 3/A Main.json';
  const result = parseLiveRcUrl(url) as LiveRcJsonUrlParseResult;

  assert.equal(result.type, 'json');
  assert.equal(result.origin, 'https://canberraoffroad.liverc.com');
  assert.equal(result.resultsBaseUrl, 'https://canberraoffroad.liverc.com/results');
  assert.deepEqual(result.slugs, ['SUMMER SERIES', '2WD Buggy', 'Round 3', 'A Main']);
  assert.equal(result.canonicalJsonPath, '/results/SUMMER SERIES/2WD Buggy/Round 3/A Main.json');
});

void test('parseLiveRcUrl infers canonical path when JSON extension is omitted', () => {
  const url = 'https://liverc.com/results/Winter Showdown/Expert 4WD/Round 1/Main--Event';
  const result = parseLiveRcUrl(url) as LiveRcJsonUrlParseResult;

  assert.equal(result.type, 'json');
  assert.deepEqual(result.slugs, ['Winter Showdown', 'Expert 4WD', 'Round 1', 'Main--Event']);
  assert.equal(
    result.canonicalJsonPath,
    '/results/Winter Showdown/Expert 4WD/Round 1/Main--Event.json',
  );
});

void test('parseLiveRcUrl flags legacy HTML results URLs', () => {
  const url = 'https://liverc.com/?p=view_race_result&id=12345';
  const result = parseLiveRcUrl(url);

  assert.equal(result.type, 'html');
});

void test('parseLiveRcUrl reports invalid URLs with descriptive reasons', () => {
  const invalidResults: Array<{
    input: string;
    reason: LiveRcInvalidUrlParseResult['reasonIfInvalid'];
  }> = [
    { input: 'not-a-url', reason: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL },
    {
      input: 'https://example.com/results/event/class/round/race',
      reason: LiveRcUrlInvalidReasons.UNTRUSTED_HOST,
    },
    {
      input: 'https://liverc.com/results/event/class/round',
      reason: LiveRcUrlInvalidReasons.INCOMPLETE_RESULTS_SEGMENTS,
    },
    {
      input: 'https://liverc.com/results/event/class/round/race/extra',
      reason: LiveRcUrlInvalidReasons.EXTRA_SEGMENTS,
    },
    {
      input: 'https://liverc.com/somewhere-else',
      reason: LiveRcUrlInvalidReasons.INVALID_RESULTS_PATH,
    },
  ];

  for (const { input, reason } of invalidResults) {
    const result = parseLiveRcUrl(input);
    assert.equal(result.type, 'invalid');
    assert.equal(result.reasonIfInvalid, reason);
  }
});

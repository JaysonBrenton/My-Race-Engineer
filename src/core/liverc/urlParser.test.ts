import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LiveRcUrlInvalidReasons,
  parseLiveRcUrl,
  type LiveRcJsonUrlParseResult,
  type LiveRcInvalidUrlParseResult,
} from './urlParser';

test('parseLiveRcUrl recognises valid JSON results URLs with four segments', () => {
  const url = 'https://liverc.com/results/SUMMER SERIES/2WD Buggy/Round 3/A Main.json';
  const result = parseLiveRcUrl(url) as LiveRcJsonUrlParseResult;

  assert.equal(result.type, 'json');
  assert.deepEqual(result.slugs, ['summer-series', '2wd-buggy', 'round-3', 'a-main']);
  assert.equal(result.canonicalJsonPath, '/results/summer-series/2wd-buggy/round-3/a-main.json');
});

test('parseLiveRcUrl infers canonical path when JSON extension is omitted', () => {
  const url = 'https://liverc.com/results/Winter Showdown/Expert 4WD/Round 1/Main Event';
  const result = parseLiveRcUrl(url) as LiveRcJsonUrlParseResult;

  assert.equal(result.type, 'json');
  assert.deepEqual(result.slugs, ['winter-showdown', 'expert-4wd', 'round-1', 'main-event']);
  assert.equal(result.canonicalJsonPath, '/results/winter-showdown/expert-4wd/round-1/main-event.json');
});

test('parseLiveRcUrl flags legacy HTML results URLs', () => {
  const url = 'https://liverc.com/?p=view_race_result&id=12345';
  const result = parseLiveRcUrl(url);

  assert.equal(result.type, 'html');
});

test('parseLiveRcUrl reports invalid URLs with descriptive reasons', () => {
  const invalidResults: Array<{ input: string; reason: LiveRcInvalidUrlParseResult['reasonIfInvalid'] }> = [
    { input: 'not-a-url', reason: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL },
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

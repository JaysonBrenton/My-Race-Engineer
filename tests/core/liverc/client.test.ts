import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { HttpLiveRcClient, appendJsonSuffix } from '../../../src/core/app/connectors/liverc/client';

const client = new HttpLiveRcClient();

test('resolveJsonUrlFromHtml returns alternate JSON link when present', async () => {
  const fixtureUrl = new URL('../../../fixtures/liverc/html/sample-event-overview.html', import.meta.url);
  const html = await readFile(fixtureUrl, 'utf-8');

  const jsonUrl = client.resolveJsonUrlFromHtml(html);

  assert.equal(
    jsonUrl,
    'https://www.liverc.com/results/sample-event/index.json',
    'expected resolveJsonUrlFromHtml to return the alternate link href',
  );
});

test('resolveJsonUrlFromHtml falls back to canonical link when alternate is missing', async () => {
  const fixtureUrl = new URL('../../../fixtures/liverc/html/sample-session-page.html', import.meta.url);
  const html = await readFile(fixtureUrl, 'utf-8');

  const jsonUrl = client.resolveJsonUrlFromHtml(html);

  assert.equal(
    jsonUrl,
    'https://www.liverc.com/results/sample-event/sample-class/main/sample-final.json',
    'expected resolveJsonUrlFromHtml to derive JSON URL from canonical link',
  );
});

test('appendJsonSuffix preserves query strings and removes trailing slashes', () => {
  const url = 'https://www.liverc.com/results/?p=view_event&id=123&c_id=456';

  const result = appendJsonSuffix(url);

  assert.equal(
    result,
    'https://www.liverc.com/results.json?p=view_event&id=123&c_id=456',
    'expected query parameters to remain intact when appending .json suffix',
  );
});

test('appendJsonSuffix avoids duplicating existing json suffix', () => {
  const url = 'https://www.liverc.com/results/sample-event/sample-class/main/a-main.json?ref=1';

  const result = appendJsonSuffix(url);

  assert.equal(
    result,
    url,
    'expected appendJsonSuffix to leave URLs with .json suffix unchanged',
  );
});

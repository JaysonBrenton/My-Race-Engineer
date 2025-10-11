import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { HttpLiveRcClient } from '../../../src/core/app/connectors/liverc/client';

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

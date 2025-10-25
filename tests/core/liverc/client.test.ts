/**
 * Project: My Race Engineer
 * File: tests/core/liverc/client.test.ts
 * Summary: Unit tests covering the LiveRC client URL resolution helpers.
 */

/* eslint-disable @typescript-eslint/no-floating-promises -- Node test registration intentionally runs without awaiting. */
/* eslint-disable @typescript-eslint/require-await -- Test doubles implement async interfaces synchronously for fixture speed. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HttpLiveRcClient,
  LiveRcClientError,
  appendJsonSuffix,
} from '../../../src/core/app/connectors/liverc/client';

const client = new HttpLiveRcClient();

test('resolveJsonUrlFromHtml returns alternate JSON link when present', async () => {
  const fixtureUrl = new URL(
    '../../../fixtures/liverc/html/sample-event-overview.html',
    import.meta.url,
  );
  const html = await readFile(fixtureUrl, 'utf-8');

  const jsonUrl = client.resolveJsonUrlFromHtml(html);

  assert.equal(
    jsonUrl,
    'https://live.liverc.com/results/sample-event/index.json',
    'expected resolveJsonUrlFromHtml to return the alternate link href',
  );
});

test('resolveJsonUrlFromHtml falls back to canonical link when alternate is missing', async () => {
  const fixtureUrl = new URL(
    '../../../fixtures/liverc/html/sample-session-page.html',
    import.meta.url,
  );
  const html = await readFile(fixtureUrl, 'utf-8');

  const jsonUrl = client.resolveJsonUrlFromHtml(html);

  assert.equal(
    jsonUrl,
    'https://live.liverc.com/results/sample-event/sample-class/main/sample-final.json',
    'expected resolveJsonUrlFromHtml to derive JSON URL from canonical link',
  );
});

test('resolveJsonUrlFromHtml supports caller-provided fallback patterns', () => {
  const html = `
    <html>
      <body>
        <div data-results-endpoint="//club.liverc.com/results/custom/event-1/pro-buggy/a-main"></div>
      </body>
    </html>
  `;

  const jsonUrl = client.resolveJsonUrlFromHtml(html, [
    'data-results-endpoint=["\'](?<url>[^"\']+)["\']',
  ]);

  assert.equal(
    jsonUrl,
    'https://club.liverc.com/results/custom/event-1/pro-buggy/a-main',
    'expected resolveJsonUrlFromHtml to honour the provided fallback pattern',
  );
});

test('resolveJsonUrlFromHtml returns null when no absolute URLs can be resolved', () => {
  const html = `
    <html>
      <body>
        <div data-json-url="/relative/path/results"></div>
      </body>
    </html>
  `;

  const jsonUrl = client.resolveJsonUrlFromHtml(html);

  assert.equal(jsonUrl, null, 'expected resolveJsonUrlFromHtml to skip unresolved relative URLs');
});

test('appendJsonSuffix preserves query strings and removes trailing slashes', () => {
  const url = 'https://live.liverc.com/results/?p=view_event&id=123&c_id=456';

  const result = appendJsonSuffix(url);

  assert.equal(
    result,
    'https://live.liverc.com/results.json?p=view_event&id=123&c_id=456',
    'expected query parameters to remain intact when appending .json suffix',
  );
});

test('fetchJson throws when upstream response is not JSON', async () => {
  const responses: Response[] = [
    new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  ];

  const clientWithStubFetch = new HttpLiveRcClient({
    fetchImpl: async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected additional fetch invocation');
      }

      return response;
    },
  });

  await assert.rejects(
    () => clientWithStubFetch.fetchJson('https://live.liverc.com/results/event.json'),
    (error: unknown) => {
      assert.ok(error instanceof LiveRcClientError, 'expected LiveRcClientError to be thrown');
      assert.equal(error.code, 'INVALID_CONTENT_TYPE');
      return true;
    },
  );
});

test('fetchJson wraps JSON parse failures in LiveRcClientError', async () => {
  const responses: Response[] = [
    new Response('{"event":', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ];

  const clientWithStubFetch = new HttpLiveRcClient({
    fetchImpl: async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected additional fetch invocation');
      }

      return response;
    },
  });

  await assert.rejects(
    () => clientWithStubFetch.fetchJson('https://live.liverc.com/results/event.json'),
    (error: unknown) => {
      assert.ok(error instanceof LiveRcClientError, 'expected LiveRcClientError to be thrown');
      assert.equal(error.code, 'JSON_PARSE_FAILURE');
      return true;
    },
  );
});

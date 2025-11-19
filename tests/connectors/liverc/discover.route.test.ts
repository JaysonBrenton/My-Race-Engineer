/**
 * Project: My Race Engineer
 * File: tests/connectors/liverc/discover.route.test.ts
 * Summary: Route-level tests for the LiveRC discover connector API.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

import { POST, OPTIONS } from '../../../src/app/api/connectors/liverc/discover/route';
import { liveRcDependencies } from '../../../src/dependencies/liverc';

/** Patch global fetch during a test. */
const withPatchedFetch = async (
  stub: (url: string, init?: RequestInit) => Promise<Response> | Response,
  run: (calls: { url: string; init?: RequestInit }[]) => Promise<void>,
) => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  const toRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    return input.url;
  };
  const patchedFetch: typeof fetch = async (input, init) => {
    const url = toRequestUrl(input);
    calls.push({ url, init });
    return stub(url, init);
  };
  try {
    globalThis.fetch = patchedFetch;
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
};

const htmlForDate = (dateLabel: string) => `<!DOCTYPE html>
<html><head><title>Events ${dateLabel}</title></head>
<body>
  <article class="event-card">
    <h2><a href="https://live.liverc.com/events/event-canberra">Canberra Off-Road Championship</a></h2>
    <div class="portfolio-meta"><span>${dateLabel} 10:00 AM</span></div>
    <p class="event-location" data-track="Canberra Off-Road">Round 3</p>
  </article>
  <article class="event-card">
    <h2><a href="https://live.liverc.com/events/event-other">Regional Club Day</a></h2>
    <div class="portfolio-meta"><span>${dateLabel} 12:00 PM</span></div>
    <p class="event-location">Somewhere Else</p>
  </article>
</body></html>`;

const stubForEventsOverview = (url: string): Response => {
  // HTML client requests /events?date=YYYY-MM-DD
  const u = new URL(url);
  if (
    (u.hostname === 'live.liverc.com' || u.hostname === 'liverc.com') &&
    (u.pathname === '/events' || u.pathname === '/events/') &&
    u.searchParams.has('date')
  ) {
    const dateLabel = u.searchParams.get('date') ?? '2025-10-18';
    return new Response(htmlForDate(dateLabel), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new Response('not found', { status: 404 });
};

const makeRequest = (body: unknown): NextRequest =>
  // Cast because the route handler only consumes the Fetch API surface of NextRequest in tests.
  new Request('http://localhost/api/connectors/liverc/discover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

// --- Tests ---------------------------------------------------------------

void test('OPTIONS returns Allow header for discover route', () => {
  const res = OPTIONS();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

void test('POST rejects invalid date formats and ranges', async () => {
  // invalid format (DD-MM-YYYY given to API; API expects ISO)
  let res = await POST(
    makeRequest({ startDate: '18-10-2025', endDate: '19-10-2025', track: 'Canberra' }),
  );
  assert.equal(res.status, 400);

  // end before start
  res = await POST(
    makeRequest({ startDate: '2025-10-20', endDate: '2025-10-18', track: 'Canberra' }),
  );
  assert.equal(res.status, 400);

  // range > 7
  res = await POST(
    makeRequest({ startDate: '2025-10-01', endDate: '2025-10-11', track: 'Canberra' }),
  );
  assert.equal(res.status, 400);
});

type HtmlClientWithFetch = {
  config: {
    fetchImpl: typeof fetch;
  };
};

type DiscoveryPayload = {
  data?: {
    events?: Array<{ eventRef: string; title: string }>;
  };
};

void test('POST happy path returns discovered events and sets headers', async () => {
  await withPatchedFetch(
    (url) => stubForEventsOverview(url),
    async () => {
      const htmlClient = liveRcDependencies.liveRcHtmlClient as unknown as HtmlClientWithFetch;
      const originalFetchImpl: typeof fetch = htmlClient.config.fetchImpl;
      htmlClient.config.fetchImpl = globalThis.fetch;
      try {
        const res = await POST(
          makeRequest({
            startDate: '2025-10-18',
            endDate: '2025-10-19',
            track: 'Canberra',
            limit: 40,
          }),
        );

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('Cache-Control'), 'no-store');
        assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
        assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');

        const payload = (await res.json()) as DiscoveryPayload;
        const events = payload.data?.events ?? [];
        assert.ok(events.length >= 1);

        const first = events[0];
        assert.equal(typeof first.eventRef, 'string');
        assert.ok(first.eventRef.includes('/events/'));
        assert.equal(typeof first.title, 'string');
      } finally {
        htmlClient.config.fetchImpl = originalFetchImpl;
      }
    },
  );
});

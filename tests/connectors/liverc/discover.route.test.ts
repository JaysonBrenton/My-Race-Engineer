/**
 * Project: My Race Engineer
 * File: tests/connectors/liverc/discover.route.test.ts
 * Summary: Route-level tests for the LiveRC discover connector API.
 */

/**
 * Guardrail: The intended /api/connectors/liverc/discover contract is { clubId, startDate, endDate, limit? }
 * per ADR-20251120-liverc-club-based-discovery. Tests should not assume a `track` field or
 * https://live.liverc.com/events/?date=... calls once the refactor is done; any such assumptions are legacy to remove.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { NextRequest } from 'next/server';

import { OPTIONS, POST } from '../../../src/app/api/connectors/liverc/discover/route';
import { liveRcDependencies } from '../../../src/dependencies/liverc';
import type { Club } from '../../../src/core/domain/club';

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

const clubEventsHtml = readFileSync('fixtures/liverc/html/canberra-club-events.html', 'utf-8');

const stubClubRepository = (club: Club) => {
  const repo = liveRcDependencies.clubRepository as {
    findById: (clubId: string) => Promise<Club | null>;
  };
  const original = repo.findById;
  repo.findById = (clubId: string) => Promise.resolve(clubId === club.id ? club : null);
  return () => {
    repo.findById = original;
  };
};

const stubForClubEventsPage = (url: string): Response => {
  const u = new URL(url);
  if (u.hostname === 'canberraoffroad.liverc.com' && u.pathname === '/events/') {
    return new Response(clubEventsHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new Response('not found', { status: 404 });
};

const makeRequest = (body: unknown): NextRequest =>
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

void test('POST rejects invalid payloads for club discovery', async () => {
  const resMissingClub = await POST(
    makeRequest({ startDate: '2025-10-18', endDate: '2025-10-19' }),
  );
  assert.equal(resMissingClub.status, 400);

  const resBadRange = await POST(
    makeRequest({ clubId: 'club-1', startDate: '2025-10-20', endDate: '2025-10-18' }),
  );
  assert.equal(resBadRange.status, 400);

  const resInvalidDate = await POST(
    makeRequest({ clubId: 'club-1', startDate: '10/01/2025', endDate: '2025-10-11' }),
  );
  assert.equal(resInvalidDate.status, 400);
});

type HtmlClientWithFetch = {
  config: {
    fetchImpl: typeof fetch;
  };
};

type DiscoveryPayload = {
  data?: {
    events?: Array<{ eventRef: string; title: string; whenIso: string }>;
  };
};

void test('POST happy path returns discovered events for a club', async () => {
  const restoreClubRepo = stubClubRepository({
    id: 'club-1',
    liveRcSubdomain: 'canberraoffroad',
    displayName: 'Canberra Off-Road',
    country: null,
    region: null,
    firstSeenAt: new Date('2025-01-01T00:00:00Z'),
    lastSeenAt: new Date('2025-10-01T00:00:00Z'),
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-10-01T00:00:00Z'),
  });
  await withPatchedFetch(
    (url) => stubForClubEventsPage(url),
    async () => {
      const htmlClient = liveRcDependencies.liveRcHtmlClient as unknown as HtmlClientWithFetch;
      const originalFetchImpl: typeof fetch = htmlClient.config.fetchImpl;
      htmlClient.config.fetchImpl = globalThis.fetch;
      try {
        const res = await POST(
          makeRequest({
            clubId: 'club-1',
            startDate: '2025-09-01',
            endDate: '2025-10-31',
            limit: 2,
          }),
        );

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('Cache-Control'), 'no-store');
        assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
        assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');

        const payload = (await res.json()) as DiscoveryPayload;
        const events = payload.data?.events ?? [];
        assert.equal(events.length, 2);
        assert.deepEqual(
          events.map((event) => event.eventRef),
          [
            'https://canberraoffroad.liverc.com/events/september-practice-day',
            'https://canberraoffroad.liverc.com/events/canberra-club-round',
          ],
        );
      } finally {
        htmlClient.config.fetchImpl = originalFetchImpl;
        restoreClubRepo();
      }
    },
  );
});

void test('POST treats a 404 club events page as no results', async () => {
  const restoreClubRepo = stubClubRepository({
    id: 'club-1',
    liveRcSubdomain: 'canberraoffroad',
    displayName: 'Canberra Off-Road',
    country: null,
    region: null,
    firstSeenAt: new Date('2025-01-01T00:00:00Z'),
    lastSeenAt: new Date('2025-10-01T00:00:00Z'),
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-10-01T00:00:00Z'),
  });
  await withPatchedFetch(
    () => new Response('not found', { status: 404 }),
    async () => {
      const htmlClient = liveRcDependencies.liveRcHtmlClient as unknown as HtmlClientWithFetch;
      const originalFetchImpl: typeof fetch = htmlClient.config.fetchImpl;
      htmlClient.config.fetchImpl = globalThis.fetch;
      try {
        const res = await POST(
          makeRequest({
            clubId: 'club-1',
            startDate: '2025-09-01',
            endDate: '2025-10-31',
          }),
        );

        assert.equal(res.status, 200);
        const payload = (await res.json()) as DiscoveryPayload;
        assert.deepEqual(payload.data?.events ?? [], []);
      } finally {
        htmlClient.config.fetchImpl = originalFetchImpl;
        restoreClubRepo();
      }
    },
  );
});

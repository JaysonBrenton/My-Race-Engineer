import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest } from 'next/server';

import { GET } from '../src/app/api/dev/liverc/results/[...slug]/route';

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

const withPatchedFetch = async (
  stub: typeof fetch,
  run: (calls: FetchCall[]) => Promise<void>,
) => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return stub(input, init);
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('GET /api/dev/liverc/results proxies race result requests when proxy flag enabled', async () => {
  await withPatchedFetch(async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async (calls) => {
    const request = new NextRequest(
      'http://localhost/api/dev/liverc/results/sample-event/sample-class/round-1/a-main.json?proxy=1',
      {
        headers: { 'x-request-id': 'test-race-result' },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        slug: ['sample-event', 'sample-class', 'round-1', 'a-main.json'],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      'https://liverc.com/results/sample-event/sample-class/round-1/a-main.json',
    );

    const payload = (await response.json()) as { ok: boolean };
    assert.deepEqual(payload, { ok: true });
  });
});

test('GET /api/dev/liverc/results proxies entry list requests when proxy flag enabled', async () => {
  await withPatchedFetch(async () => {
    return new Response(JSON.stringify({ entries: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async (calls) => {
    const request = new NextRequest(
      'http://localhost/api/dev/liverc/results/sample-event/sample-class/entry-list.json?proxy=1',
      {
        headers: { 'x-request-id': 'test-entry-list' },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        slug: ['sample-event', 'sample-class', 'entry-list.json'],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      'https://liverc.com/results/sample-event/sample-class/entry-list.json',
    );

    const payload = (await response.json()) as { entries: unknown[] };
    assert.deepEqual(payload, { entries: [] });
  });
});

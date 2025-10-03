import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveRcHttpClient, LiveRcHttpError } from '../src/core/infra/http/liveRcClient';

test('fetchEntryList surfaces network failures as LiveRcHttpError', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const client = new LiveRcHttpClient(async (url, init) => {
    calls.push({ url: String(url), init });
    throw new TypeError('getaddrinfo ENOTFOUND liverc.com');
  });

  await assert.rejects(
    () =>
      client.fetchEntryList({
        resultsBaseUrl: 'https://liverc.com/results',
        eventSlug: 'event',
        classSlug: 'class',
      }),
    (error: unknown) => {
      assert.ok(error instanceof LiveRcHttpError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'ENTRY_LIST_FETCH_FAILED');
      assert.equal(error.details?.url, 'https://liverc.com/results/event/class/entry-list.json');
      assert.deepEqual(error.details?.cause, { message: 'getaddrinfo ENOTFOUND liverc.com', name: 'TypeError' });
      return true;
    },
  );

  assert.equal(calls.length, 1);
  const headers = calls[0]?.init?.headers;
  let accept: string | null = null;
  if (headers instanceof Headers) {
    accept = headers.get('Accept');
  } else if (Array.isArray(headers)) {
    const pair = headers.find(([key]) => key.toLowerCase() === 'accept');
    accept = pair ? pair[1] : null;
  } else if (headers && typeof headers === 'object') {
    accept = (headers as Record<string, string>)['Accept'] ?? (headers as Record<string, string>)['accept'] ?? null;
  }

  assert.equal(accept, 'application/json');
});

test('fetchRaceResult surfaces invalid JSON payloads', async () => {
  const client = new LiveRcHttpClient(async () =>
    new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );

  await assert.rejects(
    () =>
      client.fetchRaceResult({
        resultsBaseUrl: 'https://liverc.com/results',
        eventSlug: 'event',
        classSlug: 'class',
        roundSlug: 'round',
        raceSlug: 'final',
      }),
    (error: unknown) => {
      assert.ok(error instanceof LiveRcHttpError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'RACE_RESULT_INVALID_RESPONSE');
      assert.equal(error.details?.url, 'https://liverc.com/results/event/class/round/final.json');
      assert.equal((error.details?.cause as Record<string, string>).name, 'SyntaxError');
      return true;
    },
  );
});

test('fetchRaceResult returns mapped payload on success', async () => {
  const client = new LiveRcHttpClient(async () =>
    new Response(
      JSON.stringify({
        event: { event_id: 'evt-1', event_name: 'Sample Event' },
        class: { class_id: 'cls-1', class_name: 'Sample Class' },
        race_id: 'race-1',
        laps: [
          {
            lap: 1,
            lap_time: 31.5,
            entry_id: 'driver-1',
            driver_name: 'Driver One',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const result = await client.fetchRaceResult({
    resultsBaseUrl: 'https://liverc.com/results',
    eventSlug: 'event',
    classSlug: 'class',
    roundSlug: 'round',
    raceSlug: 'final',
  });

  assert.equal(result.eventId, 'evt-1');
  assert.equal(result.classId, 'cls-1');
  assert.equal(result.laps[0]?.lapNumber, 1);
  assert.equal(result.laps[0]?.lapTimeSeconds, 31.5);
});

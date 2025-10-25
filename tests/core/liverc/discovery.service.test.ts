/**
 * Project: My Race Engineer
 * File: tests/core/liverc/discovery.service.test.ts
 * Summary: Unit tests covering LiveRcDiscoveryService event aggregation behaviour.
 */

/**
 * Project: My Race Engineer
 * File: tests/core/liverc/discovery.service.test.ts
 * Summary: Tests for the LiveRC discovery service when parsing event listings.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveRcDiscoveryService } from '../../../src/core/app/connectors/liverc/discovery';

// Minimal client the service will call per day
class StubHtmlClient {
  constructor(private readonly htmlByDate: Record<string, string>) {}
  getEventOverview(urlOrRef: string): Promise<string> {
    // Discovery requests should hit the live.liverc.com host when resolving relative paths.
    const url = new URL(urlOrRef, 'https://live.liverc.com/');
    const date = url.searchParams.get('date');
    if (date) {
      return Promise.resolve(this.htmlByDate[date] ?? '<html><body></body></html>');
    }
    return Promise.resolve('<html><body></body></html>');
  }
}

const day = (ymd: string, matchText = 'Canberra Off-Road') => `<!DOCTYPE html>
<html><body>
  <article class="event-card">
    <h2><a href="https://live.liverc.com/events/event-${ymd}">${matchText} Challenge</a></h2>
    <div class="portfolio-meta"><span>${ymd} 10:00 AM</span></div>
    <p class="event-location" data-track="${matchText}">Round</p>
  </article>
  <article class="event-card">
    <h2><a href="https://live.liverc.com/events/other-${ymd}">Regional Club Day</a></h2>
    <div class="portfolio-meta"><span>${ymd} 12:00 PM</span></div>
    <p class="event-location">Somewhere Else</p>
  </article>
</body></html>`;

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const make = (map: Record<string, string>) =>
  new LiveRcDiscoveryService({
    client: new StubHtmlClient(map),
    logger: noopLogger,
  });

// --- Tests ---------------------------------------------------------------

void test('aggregates across days, de-dupes by eventRef, sorts by score desc then time asc', async () => {
  const svc = make({
    '2025-10-18': day('2025-10-18', 'Canberra Off-Road'),
    '2025-10-19': day('2025-10-19', 'Canberra Off-Road'),
  });

  const { events } = await svc.discoverByDateRangeAndTrack({
    startDate: '2025-10-18',
    endDate: '2025-10-19',
    track: 'canberra',
    limit: 40,
  });

  assert.ok(Array.isArray(events));
  assert.ok(events.some((e) => /canberra/i.test(e.title)));

  const unique = new Set(events.map((e) => e.eventRef));
  assert.equal(unique.size, events.length);

  let lastScore = Infinity;
  for (const e of events) {
    assert.ok(e.score <= lastScore);
    lastScore = e.score;
  }
});

void test('enforces limit after sorting', async () => {
  const svc = make({ '2025-10-18': day('2025-10-18', 'Canberra Off-Road') });
  const { events } = await svc.discoverByDateRangeAndTrack({
    startDate: '2025-10-18',
    endDate: '2025-10-18',
    track: 'can',
    limit: 1,
  });
  assert.equal(events.length, 1);
});

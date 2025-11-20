/**
 * Project: My Race Engineer
 * File: tests/core/liverc/discovery.service.test.ts
 * Summary: Tests for the LiveRC discovery service when parsing club event listings.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LiveRcClientError } from '../../../src/core/app/connectors/liverc/client';
import { LiveRcDiscoveryService } from '../../../src/core/app/connectors/liverc/discovery';
import type { Club } from '../../../src/core/domain/club';

class StubHtmlClient {
  constructor(
    private readonly html: string,
    private readonly shouldThrowNotFound = false,
  ) {}

  getClubEventsPage(): Promise<string> {
    if (this.shouldThrowNotFound) {
      return Promise.reject(new LiveRcClientError('not found', { status: 404 }));
    }
    return Promise.resolve(this.html);
  }
}

class StubClubRepository {
  constructor(private readonly clubs: Record<string, Club>) {}

  findById(clubId: string): Promise<Club | null> {
    return Promise.resolve(this.clubs[clubId] ?? null);
  }
}

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const clubFixtureHtml = readFileSync('fixtures/liverc/html/canberra-club-events.html', 'utf-8');

void test('filters club events by date range and sorts chronologically', async () => {
  const svc = new LiveRcDiscoveryService({
    client: new StubHtmlClient(clubFixtureHtml),
    clubRepository: new StubClubRepository({
      'club-1': {
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
      },
    }),
    logger: noopLogger,
  });

  const { events, clubBaseOrigin } = await svc.discoverByClubAndDateRange({
    clubId: 'club-1',
    startDate: '2025-09-01',
    endDate: '2025-10-31',
    limit: 3,
  });

  assert.equal(clubBaseOrigin, 'https://canberraoffroad.liverc.com');
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => ({ ref: event.eventRef, when: event.whenIso.slice(0, 10) })),
    [
      {
        ref: 'https://canberraoffroad.liverc.com/events/september-practice-day',
        when: '2025-09-28',
      },
      { ref: 'https://canberraoffroad.liverc.com/events/canberra-club-round', when: '2025-10-12' },
      {
        ref: 'https://canberraoffroad.liverc.com/events/canberra-spring-shootout',
        when: '2025-10-19',
      },
    ],
  );
});

void test('treats a 404 club events page as an empty result set', async () => {
  const svc = new LiveRcDiscoveryService({
    client: new StubHtmlClient(clubFixtureHtml, true),
    clubRepository: new StubClubRepository({
      'club-1': {
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
      },
    }),
    logger: noopLogger,
  });

  const { events } = await svc.discoverByClubAndDateRange({
    clubId: 'club-1',
    startDate: '2025-09-01',
    endDate: '2025-10-31',
  });

  assert.deepEqual(events, []);
});

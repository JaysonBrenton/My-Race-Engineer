/**
 * Project: My Race Engineer
 * File: tests/core/liverc/club-catalogue.service.test.ts
 * Summary: Tests for the LiveRC club catalogue sync service and HTML parsing.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { LiveRcClubCatalogueService } from '../../../src/core/app/connectors/liverc/clubs';
import { HttpLiveRcClient } from '../../../src/core/app/connectors/liverc/client';
import type { ClubRepository, ClubUpsertInput } from '../../../src/core/app/ports/clubRepository';

const fixturePath = join(process.cwd(), 'fixtures/liverc/html/root-track-list.html');
const noopLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

const readFixture = () => readFile(fixturePath, 'utf8');

/** Patch global fetch during a test (matching the pattern used by other LiveRC tests). */
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

type StoredClub = {
  id: string;
  liveRcSubdomain: string;
  displayName: string;
  country: string | null;
  region: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Lightweight in-memory repository that mirrors the persistence semantics so
// we can assert on upsert/deactivate behaviour without touching a real DB.
class InMemoryClubRepository implements ClubRepository {
  readonly records = new Map<string, StoredClub>();

  constructor(initial: StoredClub[] = []) {
    for (const record of initial) {
      this.records.set(record.liveRcSubdomain, record);
    }
  }

  upsertByLiveRcSubdomain(input: ClubUpsertInput): Promise<void> {
    const subdomain = input.liveRcSubdomain.toLowerCase();
    const existing = this.records.get(subdomain);
    if (existing) {
      existing.displayName = input.displayName;
      existing.country = input.country ?? null;
      existing.region = input.region ?? null;
      existing.lastSeenAt = input.seenAt;
      existing.isActive = true;
      existing.updatedAt = input.seenAt;
      return Promise.resolve();
    }

    this.records.set(subdomain, {
      id: subdomain,
      liveRcSubdomain: subdomain,
      displayName: input.displayName,
      country: input.country ?? null,
      region: input.region ?? null,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      isActive: true,
      createdAt: input.seenAt,
      updatedAt: input.seenAt,
    });

    return Promise.resolve();
  }

  markInactiveClubsNotInSubdomains(subdomains: readonly string[]): Promise<number> {
    const allowed = new Set(subdomains.map((subdomain) => subdomain.toLowerCase()));
    let updated = 0;
    for (const record of this.records.values()) {
      if (allowed.has(record.liveRcSubdomain)) {
        continue;
      }
      if (!record.isActive) {
        continue;
      }
      record.isActive = false;
      record.updatedAt = record.lastSeenAt;
      updated += 1;
    }
    return Promise.resolve(updated);
  }

  // Simple active-only substring search to mirror the dashboard typeahead
  // behaviour without pulling in a full text search dependency.
  searchByDisplayName(
    query: string,
    limit: number,
  ): ReturnType<ClubRepository['searchByDisplayName']> {
    const normalised = query.trim().toLowerCase();
    if (!normalised || limit <= 0) {
      return Promise.resolve([]);
    }

    const results: Awaited<ReturnType<ClubRepository['searchByDisplayName']>> = [];
    for (const record of this.records.values()) {
      if (!record.isActive) {
        continue;
      }
      if (!record.displayName.toLowerCase().includes(normalised)) {
        continue;
      }

      results.push({
        id: record.id,
        liveRcSubdomain: record.liveRcSubdomain,
        displayName: record.displayName,
        country: record.country,
        region: record.region,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return Promise.resolve(results);
  }

  // Provide stable club lookup by id using the stored records.
  findById(clubId: string): ReturnType<ClubRepository['findById']> {
    for (const record of this.records.values()) {
      if (record.id === clubId) {
        // Return a copy so tests cannot mutate the repository internals.
        return Promise.resolve({ ...record });
      }
    }

    return Promise.resolve(null);
  }
}

/**
 * Decorates the in-memory repository to capture persistence method invocations for
 * assertions about how many clubs were processed during a sync run.
 */
class TrackingClubRepository extends InMemoryClubRepository {
  readonly upsertCalls: ClubUpsertInput[] = [];
  readonly markInactiveCalls: string[][] = [];

  override upsertByLiveRcSubdomain(input: ClubUpsertInput): Promise<void> {
    this.upsertCalls.push(input);
    return super.upsertByLiveRcSubdomain(input);
  }

  override markInactiveClubsNotInSubdomains(subdomains: readonly string[]): Promise<number> {
    this.markInactiveCalls.push([...subdomains]);
    return super.markInactiveClubsNotInSubdomains(subdomains);
  }
}

const stubForRootTrackList = async (url: string): Promise<Response> => {
  const normalized = url.replace(/\/+$/, '/');
  if (normalized === 'https://live.liverc.com/') {
    return new Response(await readFixture(), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new Response('not found', { status: 404 });
};

const newDate = (iso: string) => new Date(iso);

// --- Tests ---------------------------------------------------------------

void test('syncCatalogue inserts clubs parsed from the LiveRC root directory', async () => {
  await withPatchedFetch(
    (url) => stubForRootTrackList(url),
    async () => {
      const repository = new InMemoryClubRepository();
      const syncTime = newDate('2025-01-01T00:00:00.000Z');
      const service = new LiveRcClubCatalogueService({
        client: new HttpLiveRcClient({ fetchImpl: globalThis.fetch }),
        repository,
        logger: noopLogger,
        clock: () => syncTime,
      });

      const result = await service.syncCatalogue();

      assert.equal(result.upserted, 3);
      assert.equal(result.deactivated, 0);
      assert.equal(repository.records.size, 3);

      const canberra = repository.records.get('canberra');
      assert.ok(canberra);
      assert.equal(canberra.displayName, 'Canberra RC Collective');
      assert.equal(canberra.country, 'Australia');
      assert.equal(canberra.region, 'ACT');
      assert.equal(canberra.firstSeenAt, syncTime);
      assert.equal(canberra.lastSeenAt, syncTime);
    },
  );
});

void test('syncCatalogue updates existing clubs and deactivates missing ones', async () => {
  await withPatchedFetch(
    (url) => stubForRootTrackList(url),
    async () => {
      const oldSeen = newDate('2024-12-01T00:00:00.000Z');
      const repository = new InMemoryClubRepository([
        {
          id: 'canberra',
          liveRcSubdomain: 'canberra',
          displayName: 'Old Canberra Name',
          country: 'Australia',
          region: 'ACT',
          firstSeenAt: oldSeen,
          lastSeenAt: oldSeen,
          isActive: true,
          createdAt: oldSeen,
          updatedAt: oldSeen,
        },
        {
          id: 'retiredclub',
          liveRcSubdomain: 'retiredclub',
          displayName: 'Retired RC Club',
          country: 'Australia',
          region: 'NSW',
          firstSeenAt: oldSeen,
          lastSeenAt: oldSeen,
          isActive: true,
          createdAt: oldSeen,
          updatedAt: oldSeen,
        },
      ]);

      const syncTime = newDate('2025-02-02T00:00:00.000Z');
      const service = new LiveRcClubCatalogueService({
        client: new HttpLiveRcClient({ fetchImpl: globalThis.fetch }),
        repository,
        logger: noopLogger,
        clock: () => syncTime,
      });

      const result = await service.syncCatalogue();

      assert.equal(result.upserted, 3);
      assert.equal(result.deactivated, 1);

      const canberra = repository.records.get('canberra');
      assert.ok(canberra);
      assert.equal(canberra.displayName, 'Canberra RC Collective');
      assert.equal(canberra.firstSeenAt, oldSeen);
      assert.equal(canberra.lastSeenAt, syncTime);
      assert.equal(canberra.isActive, true);

      const retired = repository.records.get('retiredclub');
      assert.ok(retired);
      assert.equal(retired.isActive, false);
    },
  );
});

void test('syncCatalogue honours sync limit and skips deactivation when capped', async () => {
  const originalLimit = process.env.LIVERC_SYNC_CLUB_LIMIT;
  process.env.LIVERC_SYNC_CLUB_LIMIT = '2';

  try {
    await withPatchedFetch(
      (url) => stubForRootTrackList(url),
      async () => {
        const repository = new TrackingClubRepository();
        const syncTime = newDate('2025-03-03T00:00:00.000Z');
        const service = new LiveRcClubCatalogueService({
          client: new HttpLiveRcClient({ fetchImpl: globalThis.fetch }),
          repository,
          logger: noopLogger,
          clock: () => syncTime,
        });

        const result = await service.syncCatalogue();

        assert.equal(result.upserted, 2);
        assert.equal(result.deactivated, 0);
        assert.equal(repository.upsertCalls.length, 2);
        assert.equal(repository.markInactiveCalls.length, 0);
        assert.equal(repository.records.size, 2);

        const seenSubdomains = Array.from(repository.records.keys()).sort();
        assert.deepEqual(seenSubdomains, ['canberra', 'goldcoast']);
      },
    );
  } finally {
    if (originalLimit === undefined) {
      delete process.env.LIVERC_SYNC_CLUB_LIMIT;
    } else {
      process.env.LIVERC_SYNC_CLUB_LIMIT = originalLimit;
    }
  }
});

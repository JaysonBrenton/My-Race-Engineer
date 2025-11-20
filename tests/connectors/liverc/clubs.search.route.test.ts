/**
 * Project: My Race Engineer
 * File: tests/connectors/liverc/clubs.search.route.test.ts
 * Summary: Route-level tests for the LiveRC club search API endpoint.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

import '../../helpers/test-env';
import { GET, OPTIONS } from '../../../src/app/api/connectors/liverc/clubs/search/route';
import { createInMemoryPrismaClient, seedClubs } from './prismaClubTestHelpers';

const prisma = createInMemoryPrismaClient();
// Ensure Prisma repository lookups use the in-memory client instead of trying to
// connect to a real database during tests.
(globalThis as Record<string, unknown>).prisma = prisma;

const makeRequest = (query: string): NextRequest =>
  new Request(`http://localhost/api/connectors/liverc/clubs/search${query}`, {
    method: 'GET',
  }) as unknown as NextRequest;

const parsePayload = async (response: Response) =>
  (await response.json()) as {
    data?: {
      clubs?: Array<{ displayName: string; country: string | null; region: string | null }>;
    };
  };

test.beforeEach(() => {
  prisma.club.reset();
});

void test('OPTIONS returns Allow header for club search route', () => {
  const res = OPTIONS();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Allow'), 'OPTIONS, GET');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

void test('GET returns matching clubs sorted alphabetically', async () => {
  await seedClubs(prisma, [
    {
      id: 'club_1',
      liveRcSubdomain: 'canberra',
      displayName: 'Canberra RC Collective',
      country: 'Australia',
      region: 'ACT',
    },
    {
      id: 'club_2',
      liveRcSubdomain: 'sydrc',
      displayName: 'Sydney RC Hub',
      country: 'Australia',
      region: 'NSW',
    },
    {
      id: 'club_3',
      liveRcSubdomain: 'retired',
      displayName: 'Retired Club',
      country: 'Australia',
      region: 'VIC',
      isActive: false,
    },
  ]);

  const res = await GET(makeRequest('?q=RC'));

  assert.equal(res.status, 200);
  const payload = await parsePayload(res);
  const clubs = payload.data?.clubs ?? [];
  assert.equal(clubs.length, 2);
  assert.deepEqual(
    clubs.map((club) => club.displayName),
    ['Canberra RC Collective', 'Sydney RC Hub'],
  );
  assert.equal(clubs[0]?.country, 'Australia');
  assert.equal(clubs[0]?.region, 'ACT');
});

void test('GET returns empty list when no clubs match', async () => {
  await seedClubs(prisma, [
    {
      id: 'club_10',
      liveRcSubdomain: 'melbourne',
      displayName: 'Melbourne RC Arena',
      country: 'Australia',
      region: 'VIC',
    },
  ]);

  const res = await GET(makeRequest('?q=Nonexistent'));

  assert.equal(res.status, 200);
  const payload = await parsePayload(res);
  const clubs = payload.data?.clubs ?? [];
  assert.equal(clubs.length, 0);
});

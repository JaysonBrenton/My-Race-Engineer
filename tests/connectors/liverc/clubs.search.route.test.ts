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
      clubs?: Array<{
        id: string;
        name: string;
        subdomain: string;
        region: string | null;
        timezone: string | null;
      }>;
    };
    error?: { code: string };
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

void test('GET returns matching clubs sorted alphabetically with normalized fields', async () => {
  await seedClubs(prisma, [
    {
      id: 'club_1',
      liveRcSubdomain: 'canberra',
      displayName: 'Canberra RC Collective',
      region: 'ACT',
      timezone: 'Australia/Sydney',
    },
    {
      id: 'club_2',
      liveRcSubdomain: 'sydrc',
      displayName: 'Sydney RC Hub',
      region: 'NSW',
      timezone: 'Australia/Sydney',
    },
    {
      id: 'club_3',
      liveRcSubdomain: 'retired',
      displayName: 'Retired Club',
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
    clubs.map((club) => ({ id: club.id, name: club.name, subdomain: club.subdomain })),
    [
      { id: 'club_1', name: 'Canberra RC Collective', subdomain: 'canberra' },
      { id: 'club_2', name: 'Sydney RC Hub', subdomain: 'sydrc' },
    ],
  );
  assert.equal(clubs[0]?.region, 'ACT');
  assert.equal(clubs[0]?.timezone, 'Australia/Sydney');
});

void test('GET returns empty list when no clubs match', async () => {
  await seedClubs(prisma, [
    {
      id: 'club_10',
      liveRcSubdomain: 'melbourne',
      displayName: 'Melbourne RC Arena',
      region: 'VIC',
      timezone: 'Australia/Melbourne',
    },
  ]);

  const res = await GET(makeRequest('?q=Nonexistent'));

  assert.equal(res.status, 200);
  const payload = await parsePayload(res);
  const clubs = payload.data?.clubs ?? [];
  assert.equal(clubs.length, 0);
});

void test('GET rejects missing or too-short search terms', async () => {
  const missingQueryResponse = await GET(makeRequest(''));
  assert.equal(missingQueryResponse.status, 400);
  const missingPayload = await parsePayload(missingQueryResponse);
  assert.equal(missingPayload.error?.code, 'INVALID_REQUEST');

  const shortQueryResponse = await GET(makeRequest('?q=a'));
  assert.equal(shortQueryResponse.status, 400);
  const shortPayload = await parsePayload(shortQueryResponse);
  assert.equal(shortPayload.error?.code, 'INVALID_REQUEST');
});

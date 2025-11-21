/**
 * Project: My Race Engineer
 * File: tests/connectors/liverc/prismaClubTestHelpers.ts
 * Summary: In-memory Prisma client stand-in for seeding and querying clubs in tests.
 */

import { randomUUID } from 'node:crypto';

export type InMemoryClubRecord = {
  id: string;
  liveRcSubdomain: string;
  displayName: string;
  region: string | null;
  timezone: string | null;
  isActive: boolean;
};

export type InMemoryPrismaClient = {
  club: {
    create: (args: { data: Partial<InMemoryClubRecord> }) => Promise<InMemoryClubRecord>;
    findMany: (args?: {
      where?: {
        displayName?: { contains?: string | null; mode?: string | null };
        liveRcSubdomain?: { contains?: string | null; mode?: string | null };
        isActive?: boolean;
        OR?: Array<{
          displayName?: { contains?: string | null; mode?: string | null };
          liveRcSubdomain?: { contains?: string | null; mode?: string | null };
        }>;
      };
      orderBy?: { displayName?: 'asc' | 'desc' } | Array<{ displayName?: 'asc' | 'desc' }>;
      take?: number;
    }) => Promise<InMemoryClubRecord[]>;
    reset: () => void;
  };
};

export const createInMemoryPrismaClient = (
  initial: InMemoryClubRecord[] = [],
): InMemoryPrismaClient => {
  const records: InMemoryClubRecord[] = [...initial];

  const normaliseDisplayName = (value: string) => value.trim().toLowerCase();

  const sortByDisplayName = (first: InMemoryClubRecord, second: InMemoryClubRecord) => {
    return normaliseDisplayName(first.displayName).localeCompare(
      normaliseDisplayName(second.displayName),
    );
  };

  const client: InMemoryPrismaClient = {
    club: {
      create({ data }) {
        const record: InMemoryClubRecord = {
          id: data.id ?? randomUUID(),
          liveRcSubdomain: data.liveRcSubdomain ?? 'unknown',
          displayName: data.displayName ?? 'Unknown Club',
          region: data.region ?? null,
          timezone: data.timezone ?? null,
          isActive: data.isActive ?? true,
        };

        // Align with Prisma semantics by pushing the materialised record into the
        // backing array before returning it to the caller.
        records.push(record);
        return Promise.resolve(record);
      },
      findMany(args) {
        const orConditions = args?.where?.OR ?? [];
        const isActive = args?.where?.isActive;

        const matchesSearch = (record: InMemoryClubRecord): boolean => {
          if (orConditions.length === 0) {
            return true;
          }

          return orConditions.some((condition) => {
            const nameContains = condition.displayName?.contains?.toLowerCase();
            const subdomainContains = condition.liveRcSubdomain?.contains?.toLowerCase();

            const matchesName =
              typeof nameContains === 'string' &&
              record.displayName.toLowerCase().includes(nameContains);
            const matchesSubdomain =
              typeof subdomainContains === 'string' &&
              record.liveRcSubdomain.toLowerCase().includes(subdomainContains);

            return matchesName || matchesSubdomain;
          });
        };

        const filtered = records.filter((record) => {
          if (typeof isActive === 'boolean' && record.isActive !== isActive) {
            return false;
          }

          return matchesSearch(record);
        });

        const ordered = (() => {
          const orderBy = args?.orderBy;
          if (!orderBy) {
            return filtered;
          }

          const firstOrder = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          if (firstOrder?.displayName) {
            const direction = firstOrder.displayName === 'desc' ? -1 : 1;
            return [...filtered].sort((a, b) => direction * sortByDisplayName(a, b));
          }
          return filtered;
        })();

        const limit = args?.take ?? ordered.length;
        return Promise.resolve(ordered.slice(0, limit));
      },
      reset() {
        records.splice(0, records.length);
      },
    },
  };

  return client;
};

export const seedClubs = async (
  client: InMemoryPrismaClient,
  clubs: Array<
    Partial<InMemoryClubRecord> & Pick<InMemoryClubRecord, 'liveRcSubdomain' | 'displayName'>
  >,
) => {
  for (const club of clubs) {
    await client.club.create({
      data: {
        id: club.id,
        liveRcSubdomain: club.liveRcSubdomain,
        displayName: club.displayName,
        region: club.region ?? null,
        timezone: club.timezone ?? null,
        isActive: club.isActive ?? true,
      },
    });
  }
};

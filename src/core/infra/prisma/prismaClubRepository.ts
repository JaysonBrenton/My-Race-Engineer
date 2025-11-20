/**
 * Project: My Race Engineer
 * File: src/core/infra/prisma/prismaClubRepository.ts
 * Summary: Prisma-backed repository for storing LiveRC club catalogue records.
 */

import type { ClubRepository, ClubSearchResult, ClubUpsertInput } from '@core/app';
import type { Club } from '@core/domain/club';

import { getPrismaClient } from './prismaClient';

// Persist subdomains in a canonical lowercase format so lookups remain case
// insensitive regardless of how LiveRC renders the links.
const normaliseSubdomain = (value: string): string => value.trim().toLowerCase();

export class PrismaClubRepository implements ClubRepository {
  async upsertByLiveRcSubdomain(input: ClubUpsertInput): Promise<void> {
    const prisma = getPrismaClient();
    const liveRcSubdomain = normaliseSubdomain(input.liveRcSubdomain);
    const seenAt = input.seenAt;

    await prisma.club.upsert({
      where: { liveRcSubdomain },
      update: {
        displayName: input.displayName,
        country: input.country ?? null,
        region: input.region ?? null,
        lastSeenAt: seenAt,
        isActive: true,
      },
      create: {
        liveRcSubdomain,
        displayName: input.displayName,
        country: input.country ?? null,
        region: input.region ?? null,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        isActive: true,
      },
    });
  }

  async markInactiveClubsNotInSubdomains(subdomains: readonly string[]): Promise<number> {
    const prisma = getPrismaClient();
    // De-duplicate subdomains since the caller may have encountered the same
    // club multiple times within the HTML table.
    const unique = Array.from(
      new Set(subdomains.map((subdomain) => normaliseSubdomain(subdomain))),
    );

    const where =
      unique.length > 0
        ? { liveRcSubdomain: { notIn: unique }, isActive: true }
        : { isActive: true };

    const result = await prisma.club.updateMany({
      where,
      data: { isActive: false },
    });

    return result.count;
  }

  async searchByDisplayName(query: string, limit: number): Promise<ClubSearchResult[]> {
    const prisma = getPrismaClient();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const results = await prisma.club.findMany({
      // Prefer a case-insensitive contains match so the UI can surface results as
      // users type without forcing exact casing or full-name matches.
      where: {
        displayName: { contains: trimmedQuery, mode: 'insensitive' },
        isActive: true,
      },
      orderBy: [{ displayName: 'asc' }],
      take: limit,
    });

    return results.map((club) => ({
      id: club.id,
      liveRcSubdomain: club.liveRcSubdomain,
      displayName: club.displayName,
      country: club.country ?? null,
      region: club.region ?? null,
    }));
  }

  async findById(clubId: string): Promise<Club | null> {
    const prisma = getPrismaClient();

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return null;
    }

    return {
      id: club.id,
      liveRcSubdomain: club.liveRcSubdomain,
      displayName: club.displayName,
      country: club.country,
      region: club.region,
      firstSeenAt: club.firstSeenAt,
      lastSeenAt: club.lastSeenAt,
      isActive: club.isActive,
      createdAt: club.createdAt,
      updatedAt: club.updatedAt,
    } satisfies Club;
  }
}

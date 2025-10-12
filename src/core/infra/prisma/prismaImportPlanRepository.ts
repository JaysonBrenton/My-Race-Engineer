import type { ImportPlanEventState, ImportPlanRepository } from '@core/app';

import { getPrismaClient } from './prismaClient';

type SessionCounts = {
  id: string;
  _count: {
    laps: number;
  };
};

type EntrantIdentifier = {
  sourceEntrantId: string | null;
  displayName: string;
};

const normaliseRef = (value: string) => value.trim();

const isLikelyUrl = (value: string) => /^https?:/i.test(value);

const buildCandidateUrls = (ref: string): string[] => {
  const trimmed = ref.replace(/^\/+/, '');
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  const normalized = trimmed.startsWith('results/') ? trimmed : `results/${trimmed}`;

  const prefixes = ['https://www.liverc.com/', 'https://liverc.com/'];

  for (const prefix of prefixes) {
    candidates.add(`${prefix}${normalized}`);
    candidates.add(`${prefix}${normalized.toLowerCase()}`);
  }

  return Array.from(candidates);
};

const normaliseEntrantKey = (entrant: EntrantIdentifier) => {
  if (entrant.sourceEntrantId) {
    return entrant.sourceEntrantId.trim();
  }

  return entrant.displayName.trim().toLowerCase();
};

export class PrismaImportPlanRepository implements ImportPlanRepository {
  async getEventStateByRef(eventRef: string): Promise<ImportPlanEventState | null> {
    const prisma = getPrismaClient();

    const ref = normaliseRef(eventRef);
    if (!ref) {
      return null;
    }

    const orConditions = [{ sourceEventId: ref }, { sourceUrl: ref }, { providerEventId: ref }];

    if (!isLikelyUrl(ref)) {
      for (const candidateUrl of buildCandidateUrls(ref)) {
        orConditions.push({ sourceUrl: candidateUrl });
      }
    }

    const event = await prisma.event.findFirst({
      where: { OR: orConditions },
      select: {
        id: true,
        sourceEventId: true,
        sourceUrl: true,
        entriesCount: true,
        driversCount: true,
        sessions: {
          select: {
            id: true,
            _count: { select: { laps: true } },
          },
        },
      },
    });

    if (!event) {
      return null;
    }

    const sessionCounts = event.sessions as SessionCounts[];

    const lapCount = sessionCounts.reduce((total, session) => total + session._count.laps, 0);
    const sessionsWithLaps = sessionCounts.reduce(
      (total, session) => total + (session._count.laps > 0 ? 1 : 0),
      0,
    );

    const entrantIdentifiers = await prisma.entrant.findMany({
      where: { eventId: event.id },
      select: {
        sourceEntrantId: true,
        displayName: true,
      },
    });

    const seenEntrants = new Set<string>();
    let entrantCount = 0;
    for (const entrant of entrantIdentifiers) {
      const key = normaliseEntrantKey(entrant);
      if (!key || seenEntrants.has(key)) {
        continue;
      }

      seenEntrants.add(key);
      entrantCount += 1;
    }

    return {
      event: {
        id: event.id,
        source: {
          eventId: event.sourceEventId,
          url: event.sourceUrl,
        },
        entriesCount: event.entriesCount,
        driversCount: event.driversCount,
      },
      sessionCount: sessionCounts.length,
      sessionsWithLaps,
      lapCount,
      entrantCount,
    };
  }
}

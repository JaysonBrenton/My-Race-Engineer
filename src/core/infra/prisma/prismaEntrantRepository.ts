import type { EntrantRepository } from '@core/app';
import type { Entrant } from '@core/domain';
import type { Entrant as PrismaEntrant } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (entrant: PrismaEntrant): Entrant => ({
  id: entrant.id,
  eventId: entrant.eventId,
  raceClassId: entrant.raceClassId,
  sessionId: entrant.sessionId,
  displayName: entrant.displayName,
  carNumber: entrant.carNumber,
  source: {
    entrantId: entrant.sourceEntrantId,
    transponderId: entrant.sourceTransponderId,
  },
  createdAt: entrant.createdAt,
  updatedAt: entrant.updatedAt,
});

export class PrismaEntrantRepository implements EntrantRepository {
  async getById(id: string): Promise<Entrant | null> {
    const prisma = getPrismaClient();
    const entrant = await prisma.entrant.findUnique({ where: { id } });

    return entrant ? toDomain(entrant) : null;
  }

  async findBySourceEntrantId(sourceEntrantId: string): Promise<Entrant | null> {
    const prisma = getPrismaClient();
    const entrant = await prisma.entrant.findFirst({ where: { sourceEntrantId } });

    return entrant ? toDomain(entrant) : null;
  }

  async listBySession(sessionId: string): Promise<Entrant[]> {
    const prisma = getPrismaClient();
    const entrants = await prisma.entrant.findMany({
      where: { sessionId },
      orderBy: { displayName: 'asc' },
    });

    return entrants.map(toDomain);
  }
}

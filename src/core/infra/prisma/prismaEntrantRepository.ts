import type { EntrantRepository, EntrantSourceLookup, EntrantUpsertInput } from '@core/app';
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

  async findBySourceEntrantId({
    eventId,
    raceClassId,
    sessionId,
    sourceEntrantId,
  }: EntrantSourceLookup): Promise<Entrant | null> {
    const prisma = getPrismaClient();
    const entrant = await prisma.entrant.findFirst({
      where: { eventId, raceClassId, sessionId, sourceEntrantId },
    });

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

  async upsertBySource(input: EntrantUpsertInput): Promise<Entrant> {
    const prisma = getPrismaClient();

    const existing = input.sourceEntrantId
      ? await prisma.entrant.findFirst({
          where: {
            eventId: input.eventId,
            raceClassId: input.raceClassId,
            sessionId: input.sessionId,
            sourceEntrantId: input.sourceEntrantId,
          },
        })
      : await prisma.entrant.findFirst({
          where: {
            sessionId: input.sessionId,
            displayName: input.displayName,
          },
        });

    if (existing) {
      const updated = await prisma.entrant.update({
        where: { id: existing.id },
        data: {
          eventId: input.eventId,
          raceClassId: input.raceClassId,
          sessionId: input.sessionId,
          displayName: input.displayName,
          carNumber: input.carNumber ?? null,
          sourceEntrantId: input.sourceEntrantId ?? null,
          sourceTransponderId: input.sourceTransponderId ?? null,
        },
      });

      return toDomain(updated);
    }

    const created = await prisma.entrant.create({
      data: {
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        sessionId: input.sessionId,
        displayName: input.displayName,
        carNumber: input.carNumber ?? null,
        sourceEntrantId: input.sourceEntrantId ?? null,
        sourceTransponderId: input.sourceTransponderId ?? null,
      },
    });

    return toDomain(created);
  }
}

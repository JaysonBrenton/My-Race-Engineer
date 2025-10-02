import type { SessionRepository, SessionUpsertInput } from '@core/app';
import type { Session } from '@core/domain';
import type { Session as PrismaSession } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (session: PrismaSession): Session => ({
  id: session.id,
  eventId: session.eventId,
  raceClassId: session.raceClassId,
  name: session.name,
  source: {
    sessionId: session.sourceSessionId,
    url: session.sourceUrl,
  },
  scheduledStart: session.scheduledStart,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

export class PrismaSessionRepository implements SessionRepository {
  async getById(id: string): Promise<Session | null> {
    const prisma = getPrismaClient();
    const session = await prisma.session.findUnique({ where: { id } });

    return session ? toDomain(session) : null;
  }

  async findBySourceId(sourceSessionId: string): Promise<Session | null> {
    const prisma = getPrismaClient();
    const session = await prisma.session.findUnique({ where: { sourceSessionId } });

    return session ? toDomain(session) : null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Session | null> {
    const prisma = getPrismaClient();
    const session = await prisma.session.findUnique({ where: { sourceUrl } });

    return session ? toDomain(session) : null;
  }

  async listByEvent(eventId: string): Promise<Session[]> {
    const prisma = getPrismaClient();
    const sessions = await prisma.session.findMany({
      where: { eventId },
      orderBy: { scheduledStart: 'asc' },
    });

    return sessions.map(toDomain);
  }

  async listByRaceClass(raceClassId: string): Promise<Session[]> {
    const prisma = getPrismaClient();
    const sessions = await prisma.session.findMany({
      where: { raceClassId },
      orderBy: { scheduledStart: 'asc' },
    });

    return sessions.map(toDomain);
  }

  async upsertBySource(input: SessionUpsertInput): Promise<Session> {
    const prisma = getPrismaClient();

    const session = await prisma.session.upsert({
      where: { sourceSessionId: input.sourceSessionId },
      update: {
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        name: input.name,
        sourceUrl: input.sourceUrl,
        scheduledStart: input.scheduledStart ?? null,
      },
      create: {
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        name: input.name,
        sourceSessionId: input.sourceSessionId,
        sourceUrl: input.sourceUrl,
        scheduledStart: input.scheduledStart ?? null,
      },
    });

    return toDomain(session);
  }
}

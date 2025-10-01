import type { EventRepository } from '@core/app';
import type { Event } from '@core/domain';
import type { Event as PrismaEvent } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (event: PrismaEvent): Event => ({
  id: event.id,
  name: event.name,
  source: {
    eventId: event.sourceEventId,
    url: event.sourceUrl,
  },
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
});

export class PrismaEventRepository implements EventRepository {
  async getById(id: string): Promise<Event | null> {
    const prisma = getPrismaClient();
    const event = await prisma.event.findUnique({ where: { id } });

    return event ? toDomain(event) : null;
  }

  async findBySourceId(sourceEventId: string): Promise<Event | null> {
    const prisma = getPrismaClient();
    const event = await prisma.event.findUnique({ where: { sourceEventId } });

    return event ? toDomain(event) : null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Event | null> {
    const prisma = getPrismaClient();
    const event = await prisma.event.findUnique({ where: { sourceUrl } });

    return event ? toDomain(event) : null;
  }
}

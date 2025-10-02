import type { RaceClassRepository, RaceClassUpsertInput } from '@core/app';
import type { RaceClass } from '@core/domain';
import type { RaceClass as PrismaRaceClass } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (raceClass: PrismaRaceClass): RaceClass => ({
  id: raceClass.id,
  eventId: raceClass.eventId,
  name: raceClass.name,
  classCode: raceClass.classCode,
  sourceUrl: raceClass.sourceUrl,
  createdAt: raceClass.createdAt,
  updatedAt: raceClass.updatedAt,
});

export class PrismaRaceClassRepository implements RaceClassRepository {
  async findByEventAndCode(eventId: string, classCode: string): Promise<RaceClass | null> {
    const prisma = getPrismaClient();
    const raceClass = await prisma.raceClass.findUnique({
      where: { eventId_classCode: { eventId, classCode } },
    });

    return raceClass ? toDomain(raceClass) : null;
  }

  async upsertBySource(input: RaceClassUpsertInput): Promise<RaceClass> {
    const prisma = getPrismaClient();

    const raceClass = await prisma.raceClass.upsert({
      where: { eventId_classCode: { eventId: input.eventId, classCode: input.classCode } },
      update: {
        name: input.name,
        sourceUrl: input.sourceUrl,
      },
      create: {
        eventId: input.eventId,
        name: input.name,
        classCode: input.classCode,
        sourceUrl: input.sourceUrl,
      },
    });

    return toDomain(raceClass);
  }
}

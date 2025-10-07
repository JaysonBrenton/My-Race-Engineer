import type { LapRepository, LapUpsertInput } from '@core/app';
import type { Lap } from '@core/domain';
import type { Lap as PrismaLap } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (lap: PrismaLap): Lap => ({
  id: lap.id,
  entrantId: lap.entrantId,
  sessionId: lap.sessionId,
  lapNumber: lap.lapNumber,
  lapTime: { milliseconds: lap.lapTimeMs },
  createdAt: lap.createdAt,
  updatedAt: lap.updatedAt,
});

export class PrismaLapRepository implements LapRepository {
  async listByEntrant(entrantId: string): Promise<Lap[]> {
    const prisma = getPrismaClient();

    const laps = await prisma.lap.findMany({
      where: { entrantId },
      orderBy: { lapNumber: 'asc' },
    });

    return laps.map(toDomain);
  }

  async replaceForEntrant(
    entrantId: string,
    _sessionId: string,
    laps: ReadonlyArray<LapUpsertInput>,
  ): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      await tx.lap.deleteMany({ where: { entrantId } });

      if (laps.length === 0) {
        return;
      }

      await tx.lap.createMany({
        data: laps.map((lap) => ({
          id: lap.id,
          entrantId: lap.entrantId,
          sessionId: lap.sessionId,
          lapNumber: lap.lapNumber,
          lapTimeMs: lap.lapTimeMs,
        })),
      });
    });
  }
}

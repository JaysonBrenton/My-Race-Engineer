import type { Lap } from '@core/domain';
import type { LapRepository } from '@core/app';
import { prisma } from './prismaClient';

export class PrismaLapRepository implements LapRepository {
  async listByDriver(driverName: string): Promise<Lap[]> {
    const laps = await prisma.lap.findMany({
      where: { driverName },
      orderBy: { lapNumber: 'asc' },
    });

    return laps.map((lap) => ({
      id: lap.id,
      driverName: lap.driverName,
      lapNumber: lap.lapNumber,
      lapTime: { milliseconds: lap.lapTimeMs },
      createdAt: lap.createdAt,
      updatedAt: lap.updatedAt,
    }));
  }
}

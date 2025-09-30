import { LapSummaryService } from '@core/app';
import { PrismaLapRepository } from '@core/infra';

class MockLapRepository extends PrismaLapRepository {
  override async listByDriver(driverName: string) {
    if (!process.env.DATABASE_URL) {
      return [
        {
          id: 'mock-1',
          driverName,
          lapNumber: 1,
          lapTimeMs: 92345,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-2',
          driverName,
          lapNumber: 2,
          lapTimeMs: 91012,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ].map((lap) => ({
        id: lap.id,
        driverName: lap.driverName,
        lapNumber: lap.lapNumber,
        lapTime: { milliseconds: lap.lapTimeMs },
        createdAt: lap.createdAt,
        updatedAt: lap.updatedAt,
      }));
    }

    try {
      return await super.listByDriver(driverName);
    } catch (error) {
      console.warn('Falling back to mock lap data', error);
      return [
        {
          id: 'fallback-1',
          driverName,
          lapNumber: 1,
          lapTime: { milliseconds: 95000 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }
  }
}

const lapRepository = new MockLapRepository();

export const lapSummaryService = new LapSummaryService(lapRepository);

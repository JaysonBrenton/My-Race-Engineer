import { LapSummaryService } from '@core/app';
import { PrismaLapRepository, isPrismaClientInitializationError } from '@core/infra';

type MockLapSeed = {
  id: string;
  lapNumber: number;
  lapTimeMs: number;
};

const MOCK_LAPS: ReadonlyArray<MockLapSeed> = [
  { id: 'mock-1', lapNumber: 1, lapTimeMs: 92345 },
  { id: 'mock-2', lapNumber: 2, lapTimeMs: 91012 },
];

const FALLBACK_LAPS: ReadonlyArray<MockLapSeed> = [
  { id: 'fallback-1', lapNumber: 1, lapTimeMs: 95000 },
];

class MockLapRepository extends PrismaLapRepository {
  override async listByDriver(driverName: string) {
    if (!process.env.DATABASE_URL) {
      return this.buildLapsFromSeed(driverName, MOCK_LAPS);
    }

    try {
      return await super.listByDriver(driverName);
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable. Falling back to mock lap data.', error);
        return this.buildLapsFromSeed(driverName, MOCK_LAPS);
      }

      console.warn('Falling back to mock lap data after unexpected error.', error);
      return this.buildLapsFromSeed(driverName, FALLBACK_LAPS);
    }
  }

  private buildLapsFromSeed(driverName: string, seed: ReadonlyArray<MockLapSeed>) {
    return seed.map((lap) => ({
      id: lap.id,
      driverName,
      lapNumber: lap.lapNumber,
      lapTime: { milliseconds: lap.lapTimeMs },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}

const lapRepository = new MockLapRepository();

export const lapSummaryService = new LapSummaryService(lapRepository);

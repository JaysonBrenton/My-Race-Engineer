import { LapSummaryService } from '@core/app';
import {
  PrismaEntrantRepository,
  PrismaLapRepository,
  isPrismaClientInitializationError,
} from '@core/infra';
import type { Entrant } from '@core/domain';
import type { LapUpsertInput } from '@core/app';

const DEFAULT_EVENT_ID = 'baseline-event';
const DEFAULT_RACE_CLASS_ID = 'baseline-race-class';
const DEFAULT_SESSION_ID = 'baseline-session';
const DEFAULT_ENTRANT_ID = 'baseline-entrant';
const DEFAULT_EVENT_SOURCE_ID = 'liverc-event-baseline';
const DEFAULT_EVENT_URL = 'https://liverc.com/events/baseline';
const DEFAULT_CLASS_CODE = 'PRO-LITE';
const DEFAULT_CLASS_URL = 'https://liverc.com/events/baseline/classes/pro-lite';
const DEFAULT_SESSION_SOURCE_ID = 'liverc-session-baseline';
const DEFAULT_SESSION_URL = 'https://liverc.com/events/baseline/classes/pro-lite/heat-1';
const DEFAULT_ENTRANT_SOURCE_ID = 'liverc-entrant-baseline';

const createMockEntrant = (): Entrant => ({
  id: DEFAULT_ENTRANT_ID,
  eventId: DEFAULT_EVENT_ID,
  raceClassId: DEFAULT_RACE_CLASS_ID,
  sessionId: DEFAULT_SESSION_ID,
  displayName: 'Baseline Driver',
  carNumber: '7',
  source: {
    entrantId: DEFAULT_ENTRANT_SOURCE_ID,
    transponderId: 'TX-BASELINE-7',
  },
  createdAt: new Date(),
  updatedAt: new Date(),
});

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

export class MockLapRepository extends PrismaLapRepository {
  private readonly memoryLapStore = new Map<string, LapUpsertInput[]>();

  override async listByEntrant(entrantId: string) {
    const isBaselineEntrant = entrantId === DEFAULT_ENTRANT_ID;

    const buildMockLaps = () => this.buildLapsFromSeed(MOCK_LAPS, entrantId, DEFAULT_SESSION_ID);
    const buildFallbackLaps = () =>
      this.buildLapsFromSeed(FALLBACK_LAPS, entrantId, DEFAULT_SESSION_ID);

    const buildStoredLaps = () => {
      const stored = this.memoryLapStore.get(entrantId);
      if (!stored || stored.length === 0) {
        return null;
      }

      return stored
        .slice()
        .sort((a, b) => a.lapNumber - b.lapNumber)
        .map((lap) => this.buildLapFromUpsert(lap));
    };

    if (!process.env.DATABASE_URL) {
      return buildStoredLaps() ?? (isBaselineEntrant ? buildMockLaps() : []);
    }

    try {
      const laps = await super.listByEntrant(entrantId);
      if (laps.length > 0) {
        return laps;
      }

      return buildStoredLaps() ?? [];
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable. Falling back to mock lap data.', error);
        return buildStoredLaps() ?? (isBaselineEntrant ? buildMockLaps() : []);
      }

      console.warn('Falling back to mock lap data after unexpected error.', error);
      return buildStoredLaps() ?? (isBaselineEntrant ? buildFallbackLaps() : []);
    }
  }

  private buildLapsFromSeed(
    seed: ReadonlyArray<MockLapSeed>,
    entrantId: string,
    sessionId: string,
  ) {
    return seed.map((lap) => ({
      id: lap.id,
      entrantId,
      sessionId,
      lapNumber: lap.lapNumber,
      lapTime: { milliseconds: lap.lapTimeMs },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  override async replaceForEntrant(
    entrantId: string,
    sessionId: string,
    laps: ReadonlyArray<LapUpsertInput>,
  ): Promise<void> {
    const storeLaps = () =>
      this.memoryLapStore.set(
        entrantId,
        laps.map((lap) => ({ ...lap })),
      );

    if (!process.env.DATABASE_URL) {
      storeLaps();
      return;
    }

    try {
      await super.replaceForEntrant(entrantId, sessionId, laps);
      storeLaps();
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable during lap replace. Storing in memory.', error);
        storeLaps();
        return;
      }

      throw error;
    }
  }

  private buildLapFromUpsert(lap: LapUpsertInput) {
    return {
      id: lap.id,
      entrantId: lap.entrantId,
      sessionId: lap.sessionId,
      lapNumber: lap.lapNumber,
      lapTime: { milliseconds: lap.lapTimeMs },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

class MockEntrantRepository extends PrismaEntrantRepository {
  override async getById(id: string) {
    if (!process.env.DATABASE_URL) {
      return id === DEFAULT_ENTRANT_ID ? createMockEntrant() : null;
    }

    try {
      const entrant = await super.getById(id);
      if (entrant) {
        return entrant;
      }
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable. Falling back to mock entrant data.', error);
        return id === DEFAULT_ENTRANT_ID ? createMockEntrant() : null;
      }

      console.warn('Falling back to mock entrant data after unexpected error.', error);
      return id === DEFAULT_ENTRANT_ID ? createMockEntrant() : null;
    }

    return id === DEFAULT_ENTRANT_ID ? createMockEntrant() : null;
  }

  override async findBySourceEntrantId(sourceEntrantId: string) {
    if (!process.env.DATABASE_URL && sourceEntrantId === DEFAULT_ENTRANT_SOURCE_ID) {
      return createMockEntrant();
    }

    try {
      const entrant = await super.findBySourceEntrantId(sourceEntrantId);
      if (entrant) {
        return entrant;
      }
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable. Falling back to mock entrant data.', error);
        return sourceEntrantId === DEFAULT_ENTRANT_SOURCE_ID ? createMockEntrant() : null;
      }

      console.warn('Falling back to mock entrant data after unexpected error.', error);
      return sourceEntrantId === DEFAULT_ENTRANT_SOURCE_ID ? createMockEntrant() : null;
    }

    return sourceEntrantId === DEFAULT_ENTRANT_SOURCE_ID ? createMockEntrant() : null;
  }

  override async listBySession(sessionId: string) {
    if (!process.env.DATABASE_URL && sessionId === DEFAULT_SESSION_ID) {
      return [createMockEntrant()];
    }

    try {
      const entrants = await super.listBySession(sessionId);
      if (entrants.length > 0) {
        return entrants;
      }
    } catch (error) {
      if (isPrismaClientInitializationError(error)) {
        console.warn('Prisma client unavailable. Falling back to mock entrant data.', error);
        return sessionId === DEFAULT_SESSION_ID ? [createMockEntrant()] : [];
      }

      console.warn('Falling back to mock entrant data after unexpected error.', error);
      return sessionId === DEFAULT_SESSION_ID ? [createMockEntrant()] : [];
    }

    return sessionId === DEFAULT_SESSION_ID ? [createMockEntrant()] : [];
  }
}

const lapRepository = new MockLapRepository();
const entrantRepository = new MockEntrantRepository();

export const lapSummaryService = new LapSummaryService(lapRepository, entrantRepository);
export const defaultEntrantContext = {
  event: {
    id: DEFAULT_EVENT_ID,
    sourceEventId: DEFAULT_EVENT_SOURCE_ID,
    url: DEFAULT_EVENT_URL,
  },
  raceClass: {
    id: DEFAULT_RACE_CLASS_ID,
    classCode: DEFAULT_CLASS_CODE,
    url: DEFAULT_CLASS_URL,
  },
  session: {
    id: DEFAULT_SESSION_ID,
    sourceSessionId: DEFAULT_SESSION_SOURCE_ID,
    url: DEFAULT_SESSION_URL,
  },
  entrant: {
    id: DEFAULT_ENTRANT_ID,
    sourceEntrantId: DEFAULT_ENTRANT_SOURCE_ID,
  },
};

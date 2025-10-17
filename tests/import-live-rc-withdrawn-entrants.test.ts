import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EntrantRepository,
  EntrantSourceLookup,
  EntrantUpsertInput,
  EventRepository,
  EventUpsertInput,
  LapRepository,
  LapUpsertInput,
  LiveRcClient,
  LiveRcEntryListResponse,
  LiveRcRaceResultResponse,
  Logger,
  RaceClassRepository,
  RaceClassUpsertInput,
  SessionRepository,
  SessionUpsertInput,
} from '../src/core/app';
import type { Entrant, Event, Lap, RaceClass, Session } from '../src/core/domain';
import { LiveRcImportService } from '../src/core/app/services/importLiveRc';

const fixedNow = new Date('2024-01-01T00:00:00Z');

const createNoopLogger = (): Logger => {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    withContext: () => logger,
  };

  return logger;
};

const createEntrant = (id: string, sourceEntrantId: string): Entrant => ({
  id,
  eventId: 'event-1',
  raceClassId: 'race-class-1',
  sessionId: 'session-1',
  displayName: `Entrant ${id}`,
  carNumber: null,
  source: { entrantId: sourceEntrantId, transponderId: null },
  createdAt: fixedNow,
  updatedAt: fixedNow,
});

class StaticLiveRcClient implements LiveRcClient {
  constructor(
    private readonly entryList: LiveRcEntryListResponse,
    private readonly raceResult: LiveRcRaceResultResponse,
  ) {}

  async fetchEntryList(): Promise<LiveRcEntryListResponse> {
    return {
      ...this.entryList,
      entries: this.entryList.entries.map((entry) => ({ ...entry })),
    };
  }

  async fetchRaceResult(): Promise<LiveRcRaceResultResponse> {
    return {
      ...this.raceResult,
      laps: this.raceResult.laps.map((lap) => ({ ...lap })),
    };
  }
}

class InMemoryEventRepository implements EventRepository {
  async getById(): Promise<Event | null> {
    return null;
  }

  async findBySourceId(): Promise<Event | null> {
    return null;
  }

  async findBySourceUrl(): Promise<Event | null> {
    return null;
  }

  async upsertBySource(input: EventUpsertInput): Promise<Event> {
    return {
      id: 'event-1',
      name: input.name,
      source: { eventId: input.sourceEventId, url: input.sourceUrl },
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } satisfies Event;
  }
}

class InMemoryRaceClassRepository implements RaceClassRepository {
  async findByEventAndCode(): Promise<RaceClass | null> {
    return null;
  }

  async upsertBySource(input: RaceClassUpsertInput): Promise<RaceClass> {
    return {
      id: 'race-class-1',
      eventId: input.eventId,
      name: input.name,
      classCode: input.classCode,
      sourceUrl: input.sourceUrl,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } satisfies RaceClass;
  }
}

class InMemorySessionRepository implements SessionRepository {
  async getById(): Promise<Session | null> {
    return null;
  }

  async findBySourceId(): Promise<Session | null> {
    return null;
  }

  async findBySourceUrl(): Promise<Session | null> {
    return null;
  }

  async listByEvent(): Promise<Session[]> {
    return [];
  }

  async listByRaceClass(): Promise<Session[]> {
    return [];
  }

  async upsertBySource(input: SessionUpsertInput): Promise<Session> {
    const scheduledStart = input.scheduledStart ?? null;

    return {
      id: 'session-1',
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      name: input.name,
      source: { sessionId: input.sourceSessionId, url: input.sourceUrl },
      scheduledStart,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } satisfies Session;
  }
}

class RecordingLapRepository implements LapRepository {
  readonly replaceCalls: Array<{
    entrantId: string;
    sessionId: string;
    laps: ReadonlyArray<LapUpsertInput>;
  }> = [];

  async listByEntrant(): Promise<Lap[]> {
    return [];
  }

  async replaceForEntrant(
    entrantId: string,
    sessionId: string,
    laps: ReadonlyArray<LapUpsertInput>,
  ): Promise<void> {
    this.replaceCalls.push({ entrantId, sessionId, laps: [...laps] });
  }
}

class InMemoryEntrantRepository implements EntrantRepository {
  private readonly entrantsById = new Map<string, Entrant>();
  private readonly entrantsBySourceId = new Map<string, Entrant>();
  private nextGeneratedId = 1;

  constructor(initialEntrants: Entrant[]) {
    for (const entrant of initialEntrants) {
      this.storeEntrant(entrant);
    }
  }

  async getById(id: string): Promise<Entrant | null> {
    return this.entrantsById.get(id) ?? null;
  }

  async findBySourceEntrantId(lookup: EntrantSourceLookup): Promise<Entrant | null> {
    void lookup;
    return this.entrantsBySourceId.get(lookup.sourceEntrantId) ?? null;
  }

  async listBySession(sessionId: string): Promise<Entrant[]> {
    return Array.from(this.entrantsById.values()).filter((entrant) => entrant.sessionId === sessionId);
  }

  async upsertBySource(input: EntrantUpsertInput): Promise<Entrant> {
    const sourceEntrantId = input.sourceEntrantId ?? null;

    if (sourceEntrantId) {
      const existing = this.entrantsBySourceId.get(sourceEntrantId);
      if (existing) {
        const updated: Entrant = {
          ...existing,
          displayName: input.displayName,
          carNumber: input.carNumber ?? null,
          updatedAt: fixedNow,
        };
        this.storeEntrant(updated);
        return updated;
      }
    }

    const id = sourceEntrantId ?? `generated-${this.nextGeneratedId++}`;
    const entrant: Entrant = {
      id: `entrant-${id}`,
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      sessionId: input.sessionId,
      displayName: input.displayName,
      carNumber: input.carNumber ?? null,
      source: { entrantId: sourceEntrantId, transponderId: input.sourceTransponderId ?? null },
      createdAt: fixedNow,
      updatedAt: fixedNow,
    };

    this.storeEntrant(entrant);
    return entrant;
  }

  private storeEntrant(entrant: Entrant) {
    this.entrantsById.set(entrant.id, entrant);
    const sourceEntrantId = entrant.source.entrantId;
    if (sourceEntrantId) {
      this.entrantsBySourceId.set(sourceEntrantId, entrant);
    }
  }
}

type ServiceSetup = {
  service: LiveRcImportService;
  lapRepository: RecordingLapRepository;
};

const createService = (
  entryList: LiveRcEntryListResponse,
  raceResult: LiveRcRaceResultResponse,
  existingEntrants: Entrant[],
): ServiceSetup => {
  const lapRepository = new RecordingLapRepository();
  const entrantRepository = new InMemoryEntrantRepository(existingEntrants);

  const service = new LiveRcImportService({
    liveRcClient: new StaticLiveRcClient(entryList, raceResult),
    eventRepository: new InMemoryEventRepository(),
    raceClassRepository: new InMemoryRaceClassRepository(),
    sessionRepository: new InMemorySessionRepository(),
    entrantRepository,
    lapRepository,
    logger: createNoopLogger(),
  });

  return { service, lapRepository };
};

void test('clears laps for withdrawn entrants even when no new lap data exists', async () => {
  const entryList: LiveRcEntryListResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    entries: [
      {
        entryId: 'withdrawn-driver',
        displayName: 'Withdrawn Driver',
        withdrawn: true,
      },
    ],
  };

  const raceResult: LiveRcRaceResultResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    raceId: 'race-1',
    raceName: 'A Main',
    laps: [],
  };

  const existingEntrant = createEntrant('entrant-withdrawn', 'withdrawn-driver');
  const { service, lapRepository } = createService(entryList, raceResult, [existingEntrant]);

  await service.importFromUrl('https://liverc.com/results/event/class/round/race.json');

  const clearCall = lapRepository.replaceCalls.find(
    (call) => call.entrantId === 'entrant-withdrawn' && call.laps.length === 0,
  );

  assert.ok(clearCall, 'expected withdrawn entrant laps to be cleared');
});

void test('clears laps for entrants missing from the entry list', async () => {
  const entryList: LiveRcEntryListResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    entries: [
      {
        entryId: 'retained-driver',
        displayName: 'Retained Driver',
      },
    ],
  };

  const raceResult: LiveRcRaceResultResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    raceId: 'race-1',
    raceName: 'A Main',
    laps: [
      {
        entryId: 'missing-driver',
        driverName: 'Missing Driver',
        lapNumber: 1,
        lapTimeSeconds: 32.1,
      },
      {
        entryId: 'retained-driver',
        driverName: 'Retained Driver',
        lapNumber: 1,
        lapTimeSeconds: 27.5,
      },
    ],
  };

  const existingEntrant = createEntrant('entrant-missing', 'missing-driver');
  const { service, lapRepository } = createService(entryList, raceResult, [existingEntrant]);

  const summary = await service.importFromUrl(
    'https://liverc.com/results/event/class/round/race.json',
  );

  const cleared = lapRepository.replaceCalls.find(
    (call) => call.entrantId === 'entrant-missing' && call.laps.length === 0,
  );
  assert.ok(cleared, 'expected missing entrant laps to be cleared');

  const retained = lapRepository.replaceCalls.find(
    (call) => call.entrantId !== 'entrant-missing' && call.laps.length > 0,
  );
  assert.ok(retained, 'expected retained entrant laps to be imported');
  assert.equal(summary.lapsImported, 1);
  assert.equal(summary.skippedLapCount, 1);
});

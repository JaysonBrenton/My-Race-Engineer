import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EntrantRepository,
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

class StubEventRepository implements EventRepository {
  lastUpsert?: EventUpsertInput;

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
    this.lastUpsert = input;

    return {
      id: 'event-1',
      name: input.name,
      source: { eventId: input.sourceEventId, url: input.sourceUrl },
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } satisfies Event;
  }
}

class StubRaceClassRepository implements RaceClassRepository {
  lastUpsert?: RaceClassUpsertInput;

  async findByEventAndCode(): Promise<RaceClass | null> {
    return null;
  }

  async upsertBySource(input: RaceClassUpsertInput): Promise<RaceClass> {
    this.lastUpsert = input;

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

class StubSessionRepository implements SessionRepository {
  lastUpsert?: SessionUpsertInput & { scheduledStart: Date | null };

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
    this.lastUpsert = { ...input, scheduledStart };

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

class StubEntrantRepository implements EntrantRepository {
  async getById(): Promise<Entrant | null> {
    return null;
  }

  async findBySourceEntrantId(): Promise<Entrant | null> {
    return null;
  }

  async listBySession(): Promise<Entrant[]> {
    return [];
  }

  async upsertBySource(input: EntrantUpsertInput): Promise<Entrant> {
    return {
      id: `entrant-${input.sourceEntrantId ?? 'unknown'}`,
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      sessionId: input.sessionId,
      displayName: input.displayName,
      carNumber: input.carNumber ?? null,
      source: {
        entrantId: input.sourceEntrantId ?? null,
        transponderId: input.sourceTransponderId ?? null,
      },
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } satisfies Entrant;
  }
}

class StubLapRepository implements LapRepository {
  replaceCalls: Array<{ entrantId: string; sessionId: string; laps: ReadonlyArray<LapUpsertInput> }> = [];

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

type ServiceSetup = {
  service: LiveRcImportService;
  sessionRepository: StubSessionRepository;
};

const createService = (startTimeUtc?: string): ServiceSetup => {
  const entryList: LiveRcEntryListResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    eventName: 'Test Event',
    className: 'Pro Buggy',
    entries: [
      {
        entryId: 'driver-1',
        displayName: 'Driver One',
      },
    ],
  };

  const raceResult: LiveRcRaceResultResponse = {
    eventId: 'upstream-event',
    classId: 'upstream-class',
    raceId: 'upstream-race',
    raceName: 'A Main',
    roundId: 'round-1',
    laps: [
      {
        entryId: 'driver-1',
        driverName: 'Driver One',
        lapNumber: 1,
        lapTimeSeconds: 31.234,
      },
    ],
    startTimeUtc,
  };

  const liveRcClient: LiveRcClient = {
    async fetchEntryList() {
      return entryList;
    },
    async fetchRaceResult() {
      return raceResult;
    },
  };

  const eventRepository = new StubEventRepository();
  const raceClassRepository = new StubRaceClassRepository();
  const sessionRepository = new StubSessionRepository();
  const entrantRepository = new StubEntrantRepository();
  const lapRepository = new StubLapRepository();

  const logger = createNoopLogger();

  const service = new LiveRcImportService({
    liveRcClient,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    entrantRepository,
    lapRepository,
    logger,
  });

  return { service, sessionRepository };
};

const importUrl =
  'https://liverc.com/results/test-event/pro-buggy/round-1/a-main';

test('timezone-aware startTimeUtc values are persisted as scheduledStart', async () => {
  const startTime = '2024-10-06T12:34:56Z';
  const { service, sessionRepository } = createService(startTime);

  await service.importFromUrl(importUrl);

  assert.ok(sessionRepository.lastUpsert, 'session upsert should be recorded');
  assert.ok(
    sessionRepository.lastUpsert?.scheduledStart instanceof Date,
    'scheduledStart should be a Date instance',
  );
  assert.equal(
    sessionRepository.lastUpsert?.scheduledStart?.toISOString(),
    new Date(startTime).toISOString(),
    'scheduledStart should preserve the upstream timestamp including offset',
  );
});

test('timezone-naive startTimeUtc values are treated as null', async () => {
  const naiveStart = '2024-10-06 12:34:56';
  const { service, sessionRepository } = createService(naiveStart);

  await service.importFromUrl(importUrl);

  assert.ok(sessionRepository.lastUpsert, 'session upsert should be recorded');
  assert.equal(
    sessionRepository.lastUpsert?.scheduledStart,
    null,
    'scheduledStart should be null when the upstream timestamp lacks timezone context',
  );
});

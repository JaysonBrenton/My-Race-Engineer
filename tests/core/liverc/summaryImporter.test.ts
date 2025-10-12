import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import type {
  DriverRepository,
  DriverUpsertInput,
  EventRepository,
  EventUpsertInput,
  EntrantRepository,
  EntrantUpsertInput,
  LapRepository,
  LapUpsertInput,
  RaceClassRepository,
  RaceClassUpsertInput,
  ResultRowRepository,
  ResultRowUpsertInput,
  SessionRepository,
  SessionUpsertInput,
} from '../../../src/core/app';
import type { Driver, Entrant, Event, RaceClass, ResultRow, Session } from '../../../src/core/domain';
import { LiveRcSummaryImporter } from '../../../src/core/app';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'fixtures', 'liverc', 'html');

const loadFixture = (filename: string) => readFile(path.join(fixturesDir, filename), 'utf8');

type Identified<T> = T & { id: string };

type StoredEvent = Identified<Event>;

type StoredRaceClass = Identified<RaceClass>;

type StoredSession = Identified<Session>;

type StoredDriver = Identified<Driver>;

type StoredResultRow = Identified<ResultRow>;

type StoredEntrant = Identified<Entrant>;

class InMemoryEventRepository implements EventRepository {
  private readonly bySource = new Map<string, StoredEvent>();

  private readonly byId = new Map<string, StoredEvent>();

  private idCounter = 1;

  async getById(id: string): Promise<Event | null> {
    return this.byId.get(id) ?? null;
  }

  async findBySourceId(sourceEventId: string): Promise<Event | null> {
    return this.bySource.get(sourceEventId) ?? null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Event | null> {
    for (const event of this.bySource.values()) {
      if (event.source.url === sourceUrl) {
        return event;
      }
    }

    return null;
  }

  async upsertBySource(input: EventUpsertInput): Promise<Event> {
    const existing = this.bySource.get(input.sourceEventId);
    const now = new Date();

    if (existing) {
      const updated: StoredEvent = {
        ...existing,
        name: input.name,
        source: { eventId: input.sourceEventId, url: input.sourceUrl },
        updatedAt: now,
      };
      this.bySource.set(input.sourceEventId, updated);
      this.byId.set(updated.id, updated);
      return updated;
    }

    const created: StoredEvent = {
      id: `evt-${this.idCounter++}`,
      name: input.name,
      source: { eventId: input.sourceEventId, url: input.sourceUrl },
      createdAt: now,
      updatedAt: now,
    };
    this.bySource.set(input.sourceEventId, created);
    this.byId.set(created.id, created);
    return created;
  }

  get size(): number {
    return this.bySource.size;
  }
}

class InMemoryRaceClassRepository implements RaceClassRepository {
  private readonly byKey = new Map<string, StoredRaceClass>();

  private idCounter = 1;

  async findByEventAndCode(eventId: string, classCode: string): Promise<RaceClass | null> {
    return this.byKey.get(this.buildKey(eventId, classCode)) ?? null;
  }

  async upsertBySource(input: RaceClassUpsertInput): Promise<RaceClass> {
    const key = this.buildKey(input.eventId, input.classCode);
    const existing = this.byKey.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredRaceClass = {
        ...existing,
        name: input.name,
        sourceUrl: input.sourceUrl,
        updatedAt: now,
      };
      this.byKey.set(key, updated);
      return updated;
    }

    const created: StoredRaceClass = {
      id: `cls-${this.idCounter++}`,
      eventId: input.eventId,
      name: input.name,
      classCode: input.classCode,
      sourceUrl: input.sourceUrl,
      createdAt: now,
      updatedAt: now,
    };
    this.byKey.set(key, created);
    return created;
  }

  private buildKey(eventId: string, classCode: string) {
    return `${eventId}:${classCode}`;
  }

  get size(): number {
    return this.byKey.size;
  }
}

class InMemorySessionRepository implements SessionRepository {
  private readonly bySourceId = new Map<string, StoredSession>();

  private readonly byId = new Map<string, StoredSession>();

  private idCounter = 1;

  async getById(id: string): Promise<Session | null> {
    return this.byId.get(id) ?? null;
  }

  async findBySourceId(sourceSessionId: string): Promise<Session | null> {
    return this.bySourceId.get(sourceSessionId) ?? null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Session | null> {
    for (const session of this.bySourceId.values()) {
      if (session.source.url === sourceUrl) {
        return session;
      }
    }

    return null;
  }

  async listByEvent(eventId: string): Promise<Session[]> {
    return Array.from(this.bySourceId.values()).filter((session) => session.eventId === eventId);
  }

  async listByRaceClass(raceClassId: string): Promise<Session[]> {
    return Array.from(this.bySourceId.values()).filter((session) => session.raceClassId === raceClassId);
  }

  async upsertBySource(input: SessionUpsertInput): Promise<Session> {
    const existing = this.bySourceId.get(input.sourceSessionId);
    const now = new Date();

    if (existing) {
      const updated: StoredSession = {
        ...existing,
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        name: input.name,
        source: { sessionId: input.sourceSessionId, url: input.sourceUrl },
        scheduledStart: input.scheduledStart ?? null,
        updatedAt: now,
      };
      this.bySourceId.set(input.sourceSessionId, updated);
      this.byId.set(updated.id, updated);
      return updated;
    }

    const created: StoredSession = {
      id: `ses-${this.idCounter++}`,
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      name: input.name,
      source: { sessionId: input.sourceSessionId, url: input.sourceUrl },
      scheduledStart: input.scheduledStart ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.bySourceId.set(input.sourceSessionId, created);
    this.byId.set(created.id, created);
    return created;
  }

  get size(): number {
    return this.bySourceId.size;
  }
}

class InMemoryDriverRepository implements DriverRepository {
  private readonly byName = new Map<string, StoredDriver>();

  private idCounter = 1;

  async findByDisplayName(displayName: string): Promise<Driver | null> {
    return this.byName.get(displayName.toLowerCase()) ?? null;
  }

  async upsertByDisplayName(input: DriverUpsertInput): Promise<Driver> {
    const key = input.displayName.toLowerCase();
    const existing = this.byName.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredDriver = {
        ...existing,
        displayName: input.displayName,
        transponder: input.transponder ?? existing.transponder ?? null,
        updatedAt: now,
      };
      this.byName.set(key, updated);
      return updated;
    }

    const created: StoredDriver = {
      id: `drv-${this.idCounter++}`,
      displayName: input.displayName,
      transponder: input.transponder ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.byName.set(key, created);
    return created;
  }

  get size(): number {
    return this.byName.size;
  }
}

class InMemoryEntrantRepository implements EntrantRepository {
  private readonly byId = new Map<string, StoredEntrant>();

  private readonly bySourceKey = new Map<string, StoredEntrant>();

  private idCounter = 1;

  async getById(id: string): Promise<Entrant | null> {
    return this.byId.get(id) ?? null;
  }

  async findBySourceEntrantId(params: {
    eventId: string;
    raceClassId: string;
    sessionId: string;
    sourceEntrantId: string;
  }): Promise<Entrant | null> {
    return this.bySourceKey.get(this.buildKey(params)) ?? null;
  }

  async listBySession(sessionId: string): Promise<Entrant[]> {
    return Array.from(this.byId.values()).filter((entrant) => entrant.sessionId === sessionId);
  }

  async upsertBySource(input: EntrantUpsertInput): Promise<Entrant> {
    const key = this.buildKey({
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      sessionId: input.sessionId,
      sourceEntrantId: input.sourceEntrantId ?? '',
    });

    const existing = this.bySourceKey.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredEntrant = {
        ...existing,
        displayName: input.displayName,
        carNumber: input.carNumber ?? null,
        source: {
          entrantId: input.sourceEntrantId ?? existing.source.entrantId ?? null,
          transponderId: input.sourceTransponderId ?? existing.source.transponderId ?? null,
        },
        updatedAt: now,
      };
      this.byId.set(updated.id, updated);
      this.bySourceKey.set(key, updated);
      return updated;
    }

    const created: StoredEntrant = {
      id: `ent-${this.idCounter++}`,
      eventId: input.eventId,
      raceClassId: input.raceClassId,
      sessionId: input.sessionId,
      displayName: input.displayName,
      carNumber: input.carNumber ?? null,
      source: {
        entrantId: input.sourceEntrantId ?? null,
        transponderId: input.sourceTransponderId ?? null,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(created.id, created);
    this.bySourceKey.set(key, created);
    return created;
  }

  private buildKey(params: {
    eventId: string;
    raceClassId: string;
    sessionId: string;
    sourceEntrantId: string;
  }) {
    return `${params.eventId}:${params.raceClassId}:${params.sessionId}:${params.sourceEntrantId}`;
  }

  get size(): number {
    return this.byId.size;
  }

  get stored(): StoredEntrant[] {
    return Array.from(this.byId.values());
  }
}

class InMemoryLapRepository implements LapRepository {
  private readonly byEntrant = new Map<string, LapUpsertInput[]>();

  async listByEntrant(entrantId: string) {
    const stored = this.byEntrant.get(entrantId) ?? [];
    return stored.map((lap) => ({
      id: lap.id,
      entrantId: lap.entrantId,
      sessionId: lap.sessionId,
      lapNumber: lap.lapNumber,
      lapTime: { milliseconds: lap.lapTimeMs },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  async replaceForEntrant(
    entrantId: string,
    _sessionId: string,
    laps: ReadonlyArray<LapUpsertInput>,
  ): Promise<void> {
    this.byEntrant.set(entrantId, laps.map((lap) => ({ ...lap })));
  }

  getLapInputs(entrantId: string): LapUpsertInput[] {
    return this.byEntrant.get(entrantId) ?? [];
  }

  get size(): number {
    return this.byEntrant.size;
  }

  get totalLapCount(): number {
    let total = 0;
    for (const laps of this.byEntrant.values()) {
      total += laps.length;
    }
    return total;
  }

  get entrants(): string[] {
    return Array.from(this.byEntrant.keys());
  }
}

class InMemoryResultRowRepository implements ResultRowRepository {
  private readonly byKey = new Map<string, StoredResultRow>();

  private idCounter = 1;

  async upsertBySessionAndDriver(input: ResultRowUpsertInput): Promise<ResultRow> {
    const key = this.buildKey(input.sessionId, input.driverId);
    const existing = this.byKey.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredResultRow = {
        ...existing,
        ...input,
        createdAt: existing.createdAt,
        updatedAt: now,
        id: existing.id,
      };
      this.byKey.set(key, updated);
      return updated;
    }

    const created: StoredResultRow = {
      id: `row-${this.idCounter++}`,
      sessionId: input.sessionId,
      driverId: input.driverId,
      position: input.position ?? null,
      carNumber: input.carNumber ?? null,
      laps: input.laps ?? null,
      totalTimeMs: input.totalTimeMs ?? null,
      behindMs: input.behindMs ?? null,
      fastestLapMs: input.fastestLapMs ?? null,
      fastestLapNum: input.fastestLapNum ?? null,
      avgLapMs: input.avgLapMs ?? null,
      avgTop5Ms: input.avgTop5Ms ?? null,
      avgTop10Ms: input.avgTop10Ms ?? null,
      avgTop15Ms: input.avgTop15Ms ?? null,
      top3ConsecMs: input.top3ConsecMs ?? null,
      stdDevMs: input.stdDevMs ?? null,
      consistencyPct: input.consistencyPct ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.byKey.set(key, created);
    return created;
  }

  private buildKey(sessionId: string, driverId: string) {
    return `${sessionId}:${driverId}`;
  }

  get size(): number {
    return this.byKey.size;
  }
}

const createSummaryImporter = async () => {
  const eventHtml = await loadFixture('sample-event-overview-small.html');
  const buggySessionHtml = await loadFixture('sample-session-pro-buggy-main.html');
  const truggySessionHtml = await loadFixture('sample-session-pro-truggy-main.html');

  const htmlByUrl = new Map<string, string>([
    ['https://www.liverc.com/results/sample-event', eventHtml],
    ['https://www.liverc.com/results/sample-event/', eventHtml],
    ['https://www.liverc.com/results/sample-event/pro-buggy/main/a-main', buggySessionHtml],
    ['https://www.liverc.com/results/sample-event/pro-truggy/main/a-main', truggySessionHtml],
  ]);

  const jsonByUrl = new Map<string, unknown>([
    [
      'https://www.liverc.com/results/sample-event/pro-buggy/main/a-main.json',
      {
        event_id: 'sample-event',
        class_id: 'pro-buggy',
        race_id: 'a-main',
        laps: [
          { entry_id: 'ryan-maifield', driver_name: 'Ryan Maifield', lap: 1, lap_time: 29.123 },
          { entry_id: 'ryan-maifield', driver_name: 'Ryan Maifield', lap: 2, lap_time: 29.321 },
          { entry_id: 'spencer-rivkin', driver_name: 'Spencer Rivkin', lap: 1, lap_time: 29.45 },
          { entry_id: 'spencer-rivkin', driver_name: 'Spencer Rivkin', lap: 2, lap_time: 29.632 },
        ],
      },
    ],
    [
      'https://www.liverc.com/results/sample-event/pro-truggy/main/a-main.json',
      {
        event_id: 'sample-event',
        class_id: 'pro-truggy',
        race_id: 'a-main',
        laps: [
          { entry_id: 'dakotah-phend', driver_name: 'Dakotah Phend', lap: 1, lap_time: 32.0 },
          { entry_id: 'dakotah-phend', driver_name: 'Dakotah Phend', lap: 2, lap_time: 32.204 },
          { entry_id: 'ty-tessmann', driver_name: 'Ty Tessmann', lap: 1, lap_time: 32.41 },
          { entry_id: 'ty-tessmann', driver_name: 'Ty Tessmann', lap: 2, lap_time: 32.598 },
        ],
      },
    ],
  ]);

  const client = {
    async getEventOverview(url: string) {
      return htmlByUrl.get(url) ?? eventHtml;
    },
    async getSessionPage(url: string) {
      const normalised = url.endsWith('/') ? url.slice(0, -1) : url;
      const match = htmlByUrl.get(normalised) ?? htmlByUrl.get(`${normalised}/`);
      if (!match) {
        throw new Error(`Missing fixture for session URL: ${url}`);
      }
      return match;
    },
    resolveJsonUrlFromHtml(html: string) {
      if (html.includes('pro-buggy')) {
        return 'https://www.liverc.com/results/sample-event/pro-buggy/main/a-main.json';
      }
      if (html.includes('pro-truggy')) {
        return 'https://www.liverc.com/results/sample-event/pro-truggy/main/a-main.json';
      }
      return null;
    },
    async fetchJson<T>(url: string): Promise<T> {
      const data = jsonByUrl.get(url);
      if (!data) {
        throw new Error(`Missing fixture for JSON URL: ${url}`);
      }
      return data as T;
    },
  };

  const eventRepository = new InMemoryEventRepository();
  const raceClassRepository = new InMemoryRaceClassRepository();
  const sessionRepository = new InMemorySessionRepository();
  const driverRepository = new InMemoryDriverRepository();
  const resultRowRepository = new InMemoryResultRowRepository();
  const entrantRepository = new InMemoryEntrantRepository();
  const lapRepository = new InMemoryLapRepository();

  const importer = new LiveRcSummaryImporter({
    client,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
    entrantRepository,
    lapRepository,
  });

  return {
    importer,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
    entrantRepository,
    lapRepository,
  };
};

test('LiveRC summary importer ingests sessions, laps, and result rows idempotently', async () => {
  const {
    importer,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
    entrantRepository,
    lapRepository,
  } = await createSummaryImporter();

  const firstRun = await importer.ingestEventSummary('https://www.liverc.com/results/sample-event');
  assert.equal(firstRun.sessionsImported, 2);
  assert.equal(firstRun.resultRowsImported, 4);
  assert.equal(firstRun.lapsImported, 8);
  assert.equal(firstRun.driversWithLaps, 4);
  assert.equal(firstRun.lapsSkipped, 0);
  assert.equal(eventRepository.size, 1);
  assert.equal(raceClassRepository.size, 2);
  assert.equal(sessionRepository.size, 2);
  assert.equal(driverRepository.size, 4);
  assert.equal(resultRowRepository.size, 4);
  assert.equal(entrantRepository.size, 4);
  assert.equal(lapRepository.size, 4);
  assert.equal(lapRepository.totalLapCount, 8);

  const entrantIds = entrantRepository.stored.map((entrant) => entrant.id);
  for (const entrantId of entrantIds) {
    assert.equal(lapRepository.getLapInputs(entrantId).length, 2);
  }

  const secondRun = await importer.ingestEventSummary('https://www.liverc.com/results/sample-event');
  assert.equal(secondRun.sessionsImported, 2);
  assert.equal(secondRun.resultRowsImported, 4);
  assert.equal(secondRun.lapsImported, 8);
  assert.equal(secondRun.driversWithLaps, 4);
  assert.equal(secondRun.lapsSkipped, 0);
  assert.equal(eventRepository.size, 1);
  assert.equal(raceClassRepository.size, 2);
  assert.equal(sessionRepository.size, 2);
  assert.equal(driverRepository.size, 4);
  assert.equal(resultRowRepository.size, 4);
  assert.equal(entrantRepository.size, 4);
  assert.equal(lapRepository.size, 4);
  assert.equal(lapRepository.totalLapCount, 8);
});

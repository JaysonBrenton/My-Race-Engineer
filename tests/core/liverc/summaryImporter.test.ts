import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import type {
  DriverRepository,
  DriverUpsertInput,
  EventRepository,
  EventUpsertInput,
  RaceClassRepository,
  RaceClassUpsertInput,
  ResultRowRepository,
  ResultRowUpsertInput,
  SessionRepository,
  SessionUpsertInput,
} from '../../../src/core/app';
import type { Driver, Event, RaceClass, ResultRow, Session } from '../../../src/core/domain';
import { LiveRcSummaryImporter } from '../../../src/core/app';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'fixtures', 'liverc', 'html');

const loadFixture = (filename: string) => readFile(path.join(fixturesDir, filename), 'utf8');

type Identified<T> = T & { id: string };

type StoredEvent = Identified<Event>;

type StoredRaceClass = Identified<RaceClass>;

type StoredSession = Identified<Session>;

type StoredDriver = Identified<Driver>;

type StoredResultRow = Identified<ResultRow>;

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
    resolveJsonUrlFromHtml() {
      return null;
    },
    async fetchJson() {
      throw new Error('Not implemented in summary importer test client.');
    },
  };

  const eventRepository = new InMemoryEventRepository();
  const raceClassRepository = new InMemoryRaceClassRepository();
  const sessionRepository = new InMemorySessionRepository();
  const driverRepository = new InMemoryDriverRepository();
  const resultRowRepository = new InMemoryResultRowRepository();

  const importer = new LiveRcSummaryImporter({
    client,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
  });

  return {
    importer,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
  };
};

test('LiveRC summary importer ingests sessions and result rows idempotently', async () => {
  const { importer, eventRepository, raceClassRepository, sessionRepository, driverRepository, resultRowRepository } =
    await createSummaryImporter();

  const firstRun = await importer.ingestEventSummary('https://www.liverc.com/results/sample-event');
  assert.equal(firstRun.sessionsImported, 2);
  assert.equal(firstRun.resultRowsImported, 4);
  assert.equal(eventRepository.size, 1);
  assert.equal(raceClassRepository.size, 2);
  assert.equal(sessionRepository.size, 2);
  assert.equal(driverRepository.size, 4);
  assert.equal(resultRowRepository.size, 4);

  const secondRun = await importer.ingestEventSummary('https://www.liverc.com/results/sample-event');
  assert.equal(secondRun.sessionsImported, 2);
  assert.equal(secondRun.resultRowsImported, 4);
  assert.equal(eventRepository.size, 1);
  assert.equal(raceClassRepository.size, 2);
  assert.equal(sessionRepository.size, 2);
  assert.equal(driverRepository.size, 4);
  assert.equal(resultRowRepository.size, 4);
});

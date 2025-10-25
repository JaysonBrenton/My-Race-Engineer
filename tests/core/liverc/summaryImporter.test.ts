/**
 * Project: My Race Engineer
 * File: tests/core/liverc/summaryImporter.test.ts
 * Summary: Tests for importing LiveRC event summaries and session data end-to-end.
 */

/* eslint-disable @typescript-eslint/no-floating-promises -- Node test registration intentionally runs without awaiting. */
/* eslint-disable @typescript-eslint/require-await -- Repository doubles satisfy async contracts via synchronous operations. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import type {
  DriverRepository,
  DriverSourceUpsertInput,
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
  LiveRcTelemetry,
} from '../../../src/core/app';
import type {
  Driver,
  Entrant,
  Event,
  RaceClass,
  ResultRow,
  Session,
} from '../../../src/core/domain';
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
    return Array.from(this.bySourceId.values()).filter(
      (session) => session.raceClassId === raceClassId,
    );
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
  private readonly byId = new Map<string, StoredDriver>();

  private readonly bySource = new Map<string, StoredDriver>();

  private readonly byDisplayName = new Map<string, StoredDriver>();

  private idCounter = 1;

  async findByDisplayName(displayName: string): Promise<Driver | null> {
    return this.byDisplayName.get(displayName.toLowerCase()) ?? null;
  }

  async upsertByDisplayName(input: DriverUpsertInput): Promise<Driver> {
    const key = input.displayName.toLowerCase();
    const existing = this.byDisplayName.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredDriver = {
        ...existing,
        displayName: input.displayName,
        transponder: input.transponder ?? existing.transponder ?? null,
        updatedAt: now,
      };
      this.storeDriver(updated);
      return updated;
    }

    const created: StoredDriver = {
      id: `drv-${this.idCounter++}`,
      displayName: input.displayName,
      provider: 'Manual',
      sourceDriverId: null,
      transponder: input.transponder ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.storeDriver(created);
    return created;
  }

  async upsertBySource(input: DriverSourceUpsertInput): Promise<Driver> {
    const key = this.buildSourceKey(input.provider, input.sourceDriverId);
    const existing = this.bySource.get(key);
    const now = new Date();

    if (existing) {
      const updated: StoredDriver = {
        ...existing,
        displayName: input.displayName,
        transponder: input.transponder ?? existing.transponder ?? null,
        updatedAt: now,
      };
      this.storeDriver(updated);
      return updated;
    }

    const created: StoredDriver = {
      id: `drv-${this.idCounter++}`,
      displayName: input.displayName,
      provider: input.provider,
      sourceDriverId: input.sourceDriverId,
      transponder: input.transponder ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.storeDriver(created);
    return created;
  }

  private buildSourceKey(provider: string, sourceDriverId: string) {
    return `${provider}:${sourceDriverId}`;
  }

  private storeDriver(driver: StoredDriver) {
    this.byId.set(driver.id, driver);

    if (driver.sourceDriverId) {
      this.bySource.set(this.buildSourceKey(driver.provider, driver.sourceDriverId), driver);
    }

    for (const [key, existing] of this.byDisplayName.entries()) {
      if (existing.id === driver.id && key !== driver.displayName.toLowerCase()) {
        this.byDisplayName.delete(key);
      }
    }

    this.byDisplayName.set(driver.displayName.toLowerCase(), driver);
  }

  get size(): number {
    return this.byId.size;
  }

  get stored(): StoredDriver[] {
    return Array.from(this.byId.values());
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
    this.byEntrant.set(
      entrantId,
      laps.map((lap) => ({ ...lap })),
    );
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
    ['https://live.liverc.com/results/sample-event', eventHtml],
    ['https://live.liverc.com/results/sample-event/', eventHtml],
    ['https://live.liverc.com/results/sample-event/pro-buggy/main/a-main', buggySessionHtml],
    ['https://live.liverc.com/results/sample-event/pro-truggy/main/a-main', truggySessionHtml],
  ]);

  const jsonByUrl = new Map<string, unknown>([
    [
      'https://live.liverc.com/results/sample-event/pro-buggy/main/a-main.json',
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
      'https://live.liverc.com/results/sample-event/pro-truggy/main/a-main.json',
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
        return 'https://live.liverc.com/results/sample-event/pro-buggy/main/a-main.json';
      }
      if (html.includes('pro-truggy')) {
        return 'https://live.liverc.com/results/sample-event/pro-truggy/main/a-main.json';
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

  const firstRun = await importer.ingestEventSummary(
    'https://live.liverc.com/results/sample-event',
  );
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

  const secondRun = await importer.ingestEventSummary(
    'https://live.liverc.com/results/sample-event',
  );
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

test('LiveRC summary importer keeps duplicate display names separate', async () => {
  const eventHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Duplicate Drivers - LiveRC</title>
    <link rel="canonical" href="https://live.liverc.com/results/duplicate-event" />
  </head>
  <body>
    <h1>Duplicate Drivers Event</h1>
    <section class="card event-section">
      <header class="card-header">
        <h2>Main Events</h2>
      </header>
      <div class="card-body">
        <table class="table table-striped event-table">
          <thead>
            <tr>
              <th>Race</th>
              <th>Class</th>
              <th>Heat</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Race">
                <a href="https://live.liverc.com/results/duplicate-event/spec-truggy/main/a-main">Spec Truggy A Main</a>
              </td>
              <td data-label="Class">Spec Truggy</td>
              <td data-label="Heat">A Main</td>
              <td data-label="Completed">
                <time datetime="2024-05-11T18:30:00Z">May 11, 2024 6:30 PM UTC</time>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </body>
</html>`;

  const sessionHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Spec Truggy A Main - LiveRC</title>
    <link rel="canonical" href="https://live.liverc.com/results/duplicate-event/spec-truggy/main/a-main" />
  </head>
  <body>
    <h1>Spec Truggy A Main</h1>
    <table class="table table-striped race-results">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Driver</th>
          <th>Car #</th>
          <th>Laps</th>
          <th>Race Time</th>
          <th>Interval</th>
          <th>Fast Lap</th>
          <th>Fast Lap #</th>
          <th>Avg Lap</th>
          <th>Avg Top 5</th>
          <th>Avg Top 10</th>
          <th>Avg Top 15</th>
          <th>Top 3 Cons</th>
          <th>Std Dev</th>
          <th>Consistency</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td data-label="Pos">1</td>
          <td data-label="Driver">Alex Morgan</td>
          <td data-label="Car #">4</td>
          <td data-label="Laps">30</td>
          <td data-label="Race Time">15:12.000</td>
          <td data-label="Interval">0.000</td>
          <td data-label="Fast Lap">00:30.000</td>
          <td data-label="Fast Lap #">5</td>
          <td data-label="Avg Lap">30.400</td>
          <td data-label="Avg Top 5">30.200</td>
          <td data-label="Avg Top 10">30.310</td>
          <td data-label="Avg Top 15">30.350</td>
          <td data-label="Top 3 Cons">1:31.200</td>
          <td data-label="Std Dev">0.150</td>
          <td data-label="Consistency">98.2%</td>
        </tr>
        <tr>
          <td data-label="Pos">2</td>
          <td data-label="Driver">Alex Morgan</td>
          <td data-label="Car #">7</td>
          <td data-label="Laps">29</td>
          <td data-label="Race Time">15:25.000</td>
          <td data-label="Interval">+13.000</td>
          <td data-label="Fast Lap">00:30.500</td>
          <td data-label="Fast Lap #">6</td>
          <td data-label="Avg Lap">31.000</td>
          <td data-label="Avg Top 5">30.800</td>
          <td data-label="Avg Top 10">30.950</td>
          <td data-label="Avg Top 15">30.980</td>
          <td data-label="Top 3 Cons">1:32.100</td>
          <td data-label="Std Dev">0.220</td>
          <td data-label="Consistency">97.6%</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;

  const htmlByUrl = new Map<string, string>([
    ['https://live.liverc.com/results/duplicate-event', eventHtml],
    ['https://live.liverc.com/results/duplicate-event/spec-truggy/main/a-main', sessionHtml],
  ]);

  const jsonByUrl = new Map<string, unknown>([
    [
      'https://live.liverc.com/results/duplicate-event/spec-truggy/main/a-main.json',
      {
        event_id: 'duplicate-event',
        class_id: 'spec-truggy',
        race_id: 'a-main',
        laps: [
          { entry_id: 'alex-morgan-1', driver_name: 'Alex Morgan', lap: 1, lap_time: 30.0 },
          { entry_id: 'alex-morgan-1', driver_name: 'Alex Morgan', lap: 2, lap_time: 30.2 },
          { entry_id: 'alex-morgan-2', driver_name: 'Alex Morgan', lap: 1, lap_time: 30.5 },
          { entry_id: 'alex-morgan-2', driver_name: 'Alex Morgan', lap: 2, lap_time: 30.6 },
        ],
      },
    ],
  ]);

  const client = {
    async getEventOverview(url: string) {
      const match = htmlByUrl.get(url);
      if (!match) {
        throw new Error(`Missing duplicate-event fixture for URL: ${url}`);
      }
      return match;
    },
    async getSessionPage(url: string) {
      const match = htmlByUrl.get(url);
      if (!match) {
        throw new Error(`Missing duplicate-event session fixture for URL: ${url}`);
      }
      return match;
    },
    resolveJsonUrlFromHtml(html: string) {
      if (html.includes('Spec Truggy A Main')) {
        return 'https://live.liverc.com/results/duplicate-event/spec-truggy/main/a-main.json';
      }
      return null;
    },
    async fetchJson<T>(url: string): Promise<T> {
      const data = jsonByUrl.get(url);
      if (!data) {
        throw new Error(`Missing duplicate-event JSON fixture for URL: ${url}`);
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

  const result = await importer.ingestEventSummary(
    'https://live.liverc.com/results/duplicate-event',
  );

  assert.equal(result.sessionsImported, 1);
  assert.equal(result.resultRowsImported, 2);
  assert.equal(result.lapsImported, 4);
  assert.equal(result.driversWithLaps, 2);
  assert.equal(result.lapsSkipped, 0);

  assert.equal(driverRepository.size, 2);
  const driverSourceIds = new Set(driverRepository.stored.map((driver) => driver.sourceDriverId));
  assert.equal(driverSourceIds.size, 2);

  assert.equal(resultRowRepository.size, 2);
  assert.equal(entrantRepository.size, 2);
  assert.equal(lapRepository.size, 2);
  assert.equal(lapRepository.totalLapCount, 4);

  for (const entrantId of lapRepository.entrants) {
    const laps = lapRepository.getLapInputs(entrantId);
    assert.equal(laps.length, 2);
    const lapIds = new Set(laps.map((lap) => lap.id));
    assert.equal(lapIds.size, 2, 'expected unique lap ids per entrant when drivers share a name');
  }
});

test('LiveRC summary importer emits telemetry for session ingestion', async () => {
  const eventHtml = await loadFixture('sample-event-overview-small.html');
  const buggySessionHtml = await loadFixture('sample-session-pro-buggy-main.html');
  const truggySessionHtml = await loadFixture('sample-session-pro-truggy-main.html');

  const htmlByUrl = new Map<string, string>([
    ['https://live.liverc.com/results/sample-event', eventHtml],
    ['https://live.liverc.com/results/sample-event/', eventHtml],
    ['https://live.liverc.com/results/sample-event/pro-buggy/main/a-main', buggySessionHtml],
    ['https://live.liverc.com/results/sample-event/pro-truggy/main/a-main', truggySessionHtml],
  ]);

  const jsonByUrl = new Map<string, unknown>([
    [
      'https://live.liverc.com/results/sample-event/pro-buggy/main/a-main.json',
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
      'https://live.liverc.com/results/sample-event/pro-truggy/main/a-main.json',
      {
        event_id: 'sample-event',
        class_id: 'pro-truggy',
        race_id: 'a-main',
        laps: [
          { entry_id: 'dakotah-phend', driver_name: 'Dakotah Phend', lap: 1, lap_time: 32.0 },
          { entry_id: 'dakotah-phend', driver_name: 'Dakotah Phend', lap: 2, lap_time: 32.112 },
          { entry_id: 'ty-tessmann', driver_name: 'Ty Tessmann', lap: 1, lap_time: 32.41 },
          { entry_id: 'ty-tessmann', driver_name: 'Ty Tessmann', lap: 2, lap_time: 32.534 },
        ],
      },
    ],
  ]);

  const client = {
    async getEventOverview(url: string) {
      const match = htmlByUrl.get(url);
      if (!match) {
        throw new Error(`Missing LiveRC event fixture for URL: ${url}`);
      }
      return match;
    },
    async getSessionPage(url: string) {
      const match = htmlByUrl.get(url);
      if (!match) {
        throw new Error(`Missing LiveRC session fixture for URL: ${url}`);
      }
      return match;
    },
    resolveJsonUrlFromHtml(html: string) {
      if (html.includes('Pro Buggy A Main')) {
        return 'https://live.liverc.com/results/sample-event/pro-buggy/main/a-main.json';
      }
      if (html.includes('Pro Truggy A Main')) {
        return 'https://live.liverc.com/results/sample-event/pro-truggy/main/a-main.json';
      }
      return null;
    },
    async fetchJson<T>(url: string): Promise<T> {
      const payload = jsonByUrl.get(url);
      if (!payload) {
        throw new Error(`Missing LiveRC JSON fixture for URL: ${url}`);
      }
      return payload as T;
    },
  };

  const eventRepository = new InMemoryEventRepository();
  const raceClassRepository = new InMemoryRaceClassRepository();
  const sessionRepository = new InMemorySessionRepository();
  const driverRepository = new InMemoryDriverRepository();
  const resultRowRepository = new InMemoryResultRowRepository();
  const entrantRepository = new InMemoryEntrantRepository();
  const lapRepository = new InMemoryLapRepository();

  const telemetryEvents: Array<{ outcome: string; sessionType?: string | null }> = [];
  const telemetry: LiveRcTelemetry = {
    recordPlanRequest: () => {},
    recordApplyRequest: () => {},
    recordEventIngestion: () => {},
    recordSessionIngestion: (event) => {
      telemetryEvents.push({ outcome: event.outcome, sessionType: event.sessionType });
    },
  };

  const importer = new LiveRcSummaryImporter({
    client,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    driverRepository,
    resultRowRepository,
    entrantRepository,
    lapRepository,
    telemetry,
  });

  const result = await importer.ingestEventSummary('https://live.liverc.com/results/sample-event');

  assert.equal(result.sessionsImported, 2);
  assert.equal(result.resultRowsImported, 4);
  assert.equal(result.lapsImported, 8);
  assert.equal(result.driversWithLaps, 4);
  assert.equal(result.lapsSkipped, 0);

  const successfulTelemetryEvents = telemetryEvents.filter((event) => event.outcome === 'success');
  assert.equal(successfulTelemetryEvents.length, 2);
});

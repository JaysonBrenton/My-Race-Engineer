import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LiveRcImportService,
  type EntrantRepository,
  type EntrantUpsertInput,
  type EventRepository,
  type EventUpsertInput,
  type LapRepository,
  type LapUpsertInput,
  type LiveRcClient,
  type RaceClassRepository,
  type RaceClassUpsertInput,
  type SessionRepository,
  type SessionUpsertInput,
} from '../src/core/app';

const now = new Date();

test('orphan laps without entry list rows are skipped and reported', async () => {
  const persistedEntrants: unknown[] = [];
  const lapReplacements: unknown[] = [];

  const event = {
    id: 'event-1',
    name: 'Test Event',
    source: { eventId: 'event-1', url: 'https://liverc.com/results/event' },
    createdAt: now,
    updatedAt: now,
  };

  const raceClass = {
    id: 'class-1',
    eventId: event.id,
    name: 'Test Class',
    classCode: 'TC',
    sourceUrl: 'https://liverc.com/results/event/class',
    createdAt: now,
    updatedAt: now,
  };

  const session = {
    id: 'session-1',
    eventId: event.id,
    raceClassId: raceClass.id,
    name: 'Test Race',
    source: {
      sessionId: 'round-1:race-1',
      url: 'https://liverc.com/results/event/class/round/race',
    },
    scheduledStart: null,
    createdAt: now,
    updatedAt: now,
  };

  const liveRcClient: LiveRcClient = {
    async fetchEntryList() {
      return {
        eventId: 'event-remote',
        classId: 'class-remote',
        entries: [],
      };
    },
    async fetchRaceResult() {
      return {
        eventId: 'event-remote',
        classId: 'class-remote',
        raceId: 'race-remote',
        raceName: 'Remote Race',
        laps: [
          {
            entryId: 'missing-entry',
            driverName: 'Mystery Driver',
            lapNumber: 1,
            lapTimeSeconds: 40.123,
          },
        ],
      };
    },
  };

  const eventRepository: EventRepository = {
    async getById() {
      return null;
    },
    async findBySourceId() {
      return null;
    },
    async findBySourceUrl() {
      return null;
    },
    async upsertBySource() {
      return event;
    },
  };

  const raceClassRepository: RaceClassRepository = {
    async findByEventAndCode() {
      return null;
    },
    async upsertBySource() {
      return raceClass;
    },
  };

  const sessionRepository: SessionRepository = {
    async getById() {
      return null;
    },
    async findBySourceId() {
      return null;
    },
    async findBySourceUrl() {
      return null;
    },
    async listByEvent() {
      return [];
    },
    async listByRaceClass() {
      return [];
    },
    async upsertBySource() {
      return session;
    },
  };

  const entrantRepository: EntrantRepository = {
    async getById() {
      return null;
    },
    async findBySourceEntrantId() {
      return null;
    },
    async listBySession() {
      return [];
    },
    async upsertBySource(input) {
      persistedEntrants.push(input);
      return {
        id: `entrant-${persistedEntrants.length}`,
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
    },
  };

  const lapRepository: LapRepository = {
    async listByEntrant() {
      return [];
    },
    async replaceForEntrant(entrantId, sessionId, laps) {
      lapReplacements.push({ entrantId, sessionId, laps });
    },
  };

  const service = new LiveRcImportService({
    liveRcClient,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    entrantRepository,
    lapRepository,
  });

  const summary = await service.importFromUrl('https://liverc.com/results/event/class/round/race');

  assert.equal(summary.entrantsProcessed, 0);
  assert.equal(summary.lapsImported, 0);
  assert.equal(summary.skippedEntrantCount, 1);
  assert.equal(summary.skippedLapCount, 1);
  assert.equal(summary.skippedOutlapCount, 0);
  assert.equal(persistedEntrants.length, 0);
  assert.equal(lapReplacements.length, 0);
});

test('importFromPayload hydrates repositories from raw race result', async () => {
  const eventInputs: EventUpsertInput[] = [];
  const raceClassInputs: RaceClassUpsertInput[] = [];
  const sessionInputs: SessionUpsertInput[] = [];
  const entrantInputs: EntrantUpsertInput[] = [];
  const lapInputs: Array<{ entrantId: string; sessionId: string; laps: LapUpsertInput[] }> = [];

  const liveRcClient: LiveRcClient = {
    async fetchEntryList() {
      throw new Error('fetchEntryList should not be called for payload import');
    },
    async fetchRaceResult() {
      throw new Error('fetchRaceResult should not be called for payload import');
    },
  };

  const eventRepository: EventRepository = {
    async getById() {
      return null;
    },
    async findBySourceId() {
      return null;
    },
    async findBySourceUrl() {
      return null;
    },
    async upsertBySource(input) {
      eventInputs.push(input);
      return {
        id: 'event-1',
        name: input.name,
        source: { eventId: input.sourceEventId, url: input.sourceUrl },
        createdAt: now,
        updatedAt: now,
      } as any;
    },
  };

  const raceClassRepository: RaceClassRepository = {
    async findByEventAndCode() {
      return null;
    },
    async upsertBySource(input) {
      raceClassInputs.push(input);
      return {
        id: 'class-1',
        eventId: input.eventId,
        name: input.name,
        classCode: input.classCode,
        sourceUrl: input.sourceUrl,
        createdAt: now,
        updatedAt: now,
      } as any;
    },
  };

  const sessionRepository: SessionRepository = {
    async getById() {
      return null;
    },
    async findBySourceId() {
      return null;
    },
    async findBySourceUrl() {
      return null;
    },
    async listByEvent() {
      return [];
    },
    async listByRaceClass() {
      return [];
    },
    async upsertBySource(input) {
      sessionInputs.push(input);
      return {
        id: 'session-1',
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        name: input.name,
        source: { sessionId: input.sourceSessionId, url: input.sourceUrl },
        scheduledStart: input.scheduledStart ?? null,
        createdAt: now,
        updatedAt: now,
      } as any;
    },
  };

  const entrantRepository: EntrantRepository = {
    async getById() {
      return null;
    },
    async findBySourceEntrantId() {
      return null;
    },
    async listBySession() {
      return [];
    },
    async upsertBySource(input) {
      entrantInputs.push(input);
      return {
        id: `entrant-${entrantInputs.length}`,
        eventId: input.eventId,
        raceClassId: input.raceClassId,
        sessionId: input.sessionId,
        displayName: input.displayName,
        source: {
          entrantId: input.sourceEntrantId ?? null,
          transponderId: input.sourceTransponderId ?? null,
        },
        createdAt: now,
        updatedAt: now,
      } as any;
    },
  };

  const lapRepository: LapRepository = {
    async listByEntrant() {
      return [];
    },
    async replaceForEntrant(entrantId, sessionId, laps) {
      lapInputs.push({ entrantId, sessionId, laps: [...laps] });
    },
  };

  const service = new LiveRcImportService({
    liveRcClient,
    eventRepository,
    raceClassRepository,
    sessionRepository,
    entrantRepository,
    lapRepository,
  });

  const raceResultFixture = new URL(
    '../fixtures/liverc/results/sample-event/sample-class/race-result.json',
    import.meta.url,
  );
  const racePayload = JSON.parse(readFileSync(raceResultFixture, 'utf-8')) as unknown;

  const summary = await service.importFromPayload(racePayload);

  assert.equal(summary.eventId, 'event-1');
  assert.equal(summary.raceClassId, 'class-1');
  assert.equal(summary.sessionId, 'session-1');
  assert.equal(summary.includeOutlaps, false);
  assert.ok(summary.sourceUrl.startsWith('uploaded-file://'));
  assert.ok(summary.lapsImported > 0);
  assert.equal(eventInputs.length, 1);
  assert.equal(eventInputs[0].sourceEventId, 'sample-event');
  assert.equal(raceClassInputs.length, 1);
  assert.equal(raceClassInputs[0].eventId, 'event-1');
  assert.equal(sessionInputs.length, 1);
  assert.equal(sessionInputs[0].sourceUrl, summary.sourceUrl);
  assert.ok(entrantInputs.length > 0);
  assert.ok(lapInputs.length > 0);

  const totalLapInputs = lapInputs.reduce((count, entry) => count + entry.laps.length, 0);
  assert.equal(totalLapInputs, summary.lapsImported);
  assert.ok(
    lapInputs.every((entry) => entry.sessionId === summary.sessionId && entry.laps.length > 0),
  );
});

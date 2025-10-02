import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LiveRcImportService,
  type EntrantRepository,
  type EventRepository,
  type LapRepository,
  type LiveRcClient,
  type RaceClassRepository,
  type SessionRepository,
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

  const summary = await service.importFromUrl(
    'https://liverc.com/results/event/class/round/race',
  );

  assert.equal(summary.entrantsProcessed, 0);
  assert.equal(summary.lapsImported, 0);
  assert.equal(summary.skippedEntrantCount, 1);
  assert.equal(summary.skippedLapCount, 1);
  assert.equal(summary.skippedOutlapCount, 0);
  assert.equal(persistedEntrants.length, 0);
  assert.equal(lapReplacements.length, 0);
});

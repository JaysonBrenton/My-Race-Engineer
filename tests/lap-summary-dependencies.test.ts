import assert from 'node:assert/strict';
import test from 'node:test';

import type { Entrant } from '../src/core/domain';
import type { EntrantRepository } from '../src/core/app/ports/entrantRepository';
import { LapSummaryService } from '../src/core/app/services/getLapSummary';
import { MockLapRepository, defaultEntrantContext } from '../src/dependencies/server';

class InMemoryEntrantRepository implements EntrantRepository {
  constructor(private readonly entrants: Map<string, Entrant>) {}

  async getById(id: string) {
    return this.entrants.get(id) ?? null;
  }

  async findBySourceEntrantId() {
    return null;
  }

  async listBySession(sessionId: string) {
    return Array.from(this.entrants.values()).filter((entrant) => entrant.sessionId === sessionId);
  }

  async upsertBySource(): Promise<Entrant> {
    throw new Error('InMemoryEntrantRepository.upsertBySource is not implemented for this test');
  }
}

const withDatabaseUrl = async (value: string | undefined, fn: () => Promise<void>) => {
  const original = process.env.DATABASE_URL;

  if (value === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = value;
  }

  try {
    await fn();
  } finally {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  }
};

test('non-baseline entrants with zero laps produce an empty summary', async () => {
  await withDatabaseUrl(undefined, async () => {
    const entrant: Entrant = {
      id: 'entrant-non-baseline',
      eventId: 'event-non-baseline',
      raceClassId: 'class-non-baseline',
      sessionId: 'session-non-baseline',
      displayName: 'Guest Driver',
      carNumber: '42',
      source: { entrantId: 'source-entrant-42', transponderId: 'tx-42' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const lapRepository = new MockLapRepository();
    const entrantRepository = new InMemoryEntrantRepository(new Map([[entrant.id, entrant]]));
    const service = new LapSummaryService(lapRepository, entrantRepository);

    const summary = await service.getSummaryForEntrant(entrant.id);

    assert.equal(summary.entrantId, entrant.id);
    assert.equal(summary.lapsCompleted, 0);
    assert.equal(summary.bestLapMs, 0);
    assert.equal(summary.averageLapMs, 0);
  });
});

test('baseline entrant receives seeded laps when the database is unavailable', async () => {
  await withDatabaseUrl(undefined, async () => {
    const baselineEntrant: Entrant = {
      id: defaultEntrantContext.entrant.id,
      eventId: defaultEntrantContext.event.id,
      raceClassId: defaultEntrantContext.raceClass.id,
      sessionId: defaultEntrantContext.session.id,
      displayName: 'Baseline Driver',
      carNumber: '7',
      source: {
        entrantId: defaultEntrantContext.entrant.sourceEntrantId,
        transponderId: 'TX-BASELINE-7',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const lapRepository = new MockLapRepository();
    const entrantRepository = new InMemoryEntrantRepository(
      new Map([[baselineEntrant.id, baselineEntrant]]),
    );
    const service = new LapSummaryService(lapRepository, entrantRepository);

    const summary = await service.getSummaryForEntrant(baselineEntrant.id);

    assert.equal(summary.entrantId, baselineEntrant.id);
    assert.equal(summary.lapsCompleted, 2);
    assert.equal(summary.bestLapMs, 91012);
    assert.equal(summary.averageLapMs, 91679);

    const fallbackLaps = await lapRepository.listByEntrant(baselineEntrant.id);
    assert.ok(
      fallbackLaps.every(
        (lap) => lap.entrantId === baselineEntrant.id && lap.sessionId === baselineEntrant.sessionId,
      ),
      'fallback laps should match the requested entrant and session IDs',
    );
  });
});

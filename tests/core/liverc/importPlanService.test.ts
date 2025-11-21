/**
 * Project: My Race Engineer
 * File: tests/core/liverc/importPlanService.test.ts
 * Summary: Tests for the LiveRC import plan service heuristics and state handling.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import type { ImportPlanEventState, ImportPlanRepository } from '../../../src/core/app';
import { LiveRcImportPlanService } from '../../../src/core/app';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'fixtures', 'liverc', 'html');
const sampleEventHtmlPath = path.join(fixturesDir, 'sample-event-overview.html');

const loadSampleEventHtml = async () => readFile(sampleEventHtmlPath, 'utf8');

type RepositoryState = ImportPlanEventState | null;

const createService = (
  options: {
    client?: Record<string, unknown>;
    repositoryState?: RepositoryState;
    includeExistingEvents?: boolean;
  } = {},
) => {
  type ServiceDependencies = ConstructorParameters<typeof LiveRcImportPlanService>[0];

  const defaultClient = {
    getRootTrackList() {
      // The import plan service does not call this in these tests but the LiveRcClient type requires it.
      return Promise.resolve('<html></html>');
    },
    getClubEventsPage() {
      // Discovery is out of scope for import plan tests; keep the stub explicit.
      return Promise.reject(new Error('Not implemented'));
    },
    getEventOverview() {
      return loadSampleEventHtml();
    },
    getSessionPage() {
      return Promise.reject(new Error('Not implemented'));
    },
    resolveJsonUrlFromHtml() {
      return null;
    },
    fetchJson() {
      return Promise.reject(new Error('Not implemented'));
    },
  } satisfies Record<string, unknown>;

  const defaultRepository: ImportPlanRepository = {
    getEventStateByRef() {
      return Promise.resolve(options.repositoryState ?? null);
    },
  };

  const client = { ...defaultClient, ...(options.client ?? {}) } as ServiceDependencies['client'];
  const repository = defaultRepository;

  return new LiveRcImportPlanService(
    { client, repository },
    { includeExistingEvents: options.includeExistingEvents },
  );
};

void test('LiveRC import plan service marks new events and estimates counts via heuristics', async () => {
  const service = createService();

  const plan = await service.createPlan({ events: [{ eventRef: 'sample-event' }] });

  assert.equal(plan.items.length, 1);
  const item = plan.items[0];

  assert.equal(item.eventRef, 'sample-event');
  assert.equal(item.status, 'NEW');
  assert.equal(item.counts.sessions, 5);
  assert.ok(item.counts.drivers >= 1, 'expected driver estimate to be positive');
  assert.ok(
    item.counts.estimatedLaps >= item.counts.drivers,
    'expected lap estimate to exceed drivers',
  );
});

void test('LiveRC import plan service reports existing when sessions and laps are present', async () => {
  const repositoryState: ImportPlanEventState = {
    event: {
      id: 'evt-1',
      source: { eventId: 'sample-event', url: 'https://liverc.com/results/sample-event' },
      entriesCount: 26,
      driversCount: 24,
    },
    sessionCount: 5,
    sessionsWithLaps: 5,
    lapCount: 480,
    entrantCount: 22,
  };

  const service = createService({ repositoryState, includeExistingEvents: true });
  const plan = await service.createPlan({ events: [{ eventRef: 'sample-event' }] });
  const item = plan.items[0];

  assert.equal(item.status, 'EXISTING');
  assert.equal(item.counts.sessions, 5);
  assert.ok(item.counts.drivers >= 24, 'expected driver estimate to respect catalogue data');
  assert.ok(item.counts.estimatedLaps >= 480, 'expected lap estimate to respect stored lap count');
});

void test('LiveRC import plan service excludes existing events by default', async () => {
  const repositoryState: ImportPlanEventState = {
    event: {
      id: 'evt-3',
      source: { eventId: 'sample-event', url: 'https://liverc.com/results/sample-event' },
      entriesCount: 18,
      driversCount: 18,
    },
    sessionCount: 5,
    sessionsWithLaps: 5,
    lapCount: 480,
    entrantCount: 18,
  };

  const service = createService({ repositoryState });
  const plan = await service.createPlan({ events: [{ eventRef: 'sample-event' }] });

  assert.equal(plan.items.length, 0);
});

void test('LiveRC import plan service reports partial coverage when some sessions lack laps', async () => {
  const repositoryState: ImportPlanEventState = {
    event: {
      id: 'evt-2',
      source: { eventId: 'sample-event', url: 'https://liverc.com/results/sample-event' },
      entriesCount: 20,
      driversCount: null,
    },
    sessionCount: 2,
    sessionsWithLaps: 1,
    lapCount: 96,
    entrantCount: 0,
  };

  const service = createService({ repositoryState });
  const plan = await service.createPlan({ events: [{ eventRef: 'sample-event' }] });
  const item = plan.items[0];

  assert.equal(item.status, 'PARTIAL');
  assert.equal(item.counts.sessions, 5);
  assert.ok(item.counts.drivers >= 20, 'expected driver estimate to respect catalogue entries');
  assert.ok(item.counts.estimatedLaps >= 96, 'expected lap estimate to be at least stored laps');
});

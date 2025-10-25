/**
 * Project: My Race Engineer
 * File: tests/core/liverc/jobQueue.test.ts
 * Summary: Tests for the LiveRC job queue orchestration logic.
 */

/* eslint-disable @typescript-eslint/no-floating-promises -- Node test registration intentionally runs without awaiting. */
/* eslint-disable @typescript-eslint/require-await -- Repository doubles satisfy async contracts via synchronous operations. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ImportJobRecord,
  ImportJobRepository,
  UpdateImportJobItemInput,
  LiveRcTelemetry,
} from '../../../src/core/app';
import { LiveRcJobQueue } from '../../../src/core/app';
import type { LiveRcSummaryImporter } from '../../../src/core/app';

type StubSummaryImporter = Pick<LiveRcSummaryImporter, 'ingestEventSummary'>;

test('LiveRC job queue processes event items and updates counts', async () => {
  const processedItems: UpdateImportJobItemInput[] = [];
  const progressUpdates: { jobId: string; progress: number }[] = [];

  const repository: ImportJobRepository = {
    async createJob() {
      throw new Error('not implemented');
    },
    async getJob() {
      return null;
    },
    takeNextQueuedJob: (() => {
      let taken = false;
      const job: ImportJobRecord = {
        jobId: 'job-1',
        state: 'RUNNING',
        progressPct: 0,
        message: undefined,
        items: [
          {
            id: 'item-1',
            targetType: 'EVENT',
            targetRef: 'https://live.liverc.com/results/sample-event',
            state: 'RUNNING',
            counts: undefined,
          },
        ],
      };

      return async () => {
        if (taken) {
          return null;
        }
        taken = true;
        return job;
      };
    })(),
    async markJobSucceeded() {
      repositoryState.markedSucceeded += 1;
    },
    async markJobFailed(jobId, message) {
      repositoryState.markedFailed.push({ jobId, message });
    },
    async updateJobProgress(jobId, progressPct) {
      progressUpdates.push({ jobId, progress: progressPct });
    },
    async updateJobItem(input) {
      processedItems.push(input);
    },
  } as ImportJobRepository;

  const repositoryState = {
    markedSucceeded: 0,
    markedFailed: [] as { jobId: string; message: string }[],
  };

  const summaryImporter: StubSummaryImporter = {
    async ingestEventSummary() {
      importerCalls += 1;
      return {
        sessionsImported: 2,
        resultRowsImported: 4,
        lapsImported: 8,
        driversWithLaps: 4,
        lapsSkipped: 0,
      };
    },
  };

  let importerCalls = 0;

  const telemetryEvents: Array<{ outcome: string; counts?: unknown }> = [];
  const telemetry: LiveRcTelemetry = {
    recordPlanRequest: () => {},
    recordApplyRequest: () => {},
    recordEventIngestion: (event) => {
      telemetryEvents.push({ outcome: event.outcome, counts: event.counts });
    },
    recordSessionIngestion: () => {},
  };

  const queue = new LiveRcJobQueue(
    { repository, summaryImporter, logger: undefined, telemetry },
    { pollIntervalMs: 5, processingDelayMs: 0 },
  );

  queue.start();

  await new Promise((resolve) => setTimeout(resolve, 50));
  queue.stop();

  assert.equal(importerCalls, 1);
  assert.equal(processedItems.length, 1);
  assert.deepEqual(processedItems[0], {
    jobId: 'job-1',
    itemId: 'item-1',
    state: 'SUCCEEDED',
    message: null,
    counts: {
      sessionsImported: 2,
      resultRowsImported: 4,
      lapsImported: 8,
      driversWithLaps: 4,
      lapsSkipped: 0,
    },
  });
  assert.ok(progressUpdates.some((entry) => entry.jobId === 'job-1' && entry.progress === 100));
  assert.equal(repositoryState.markedSucceeded, 1);
  assert.deepEqual(repositoryState.markedFailed, []);
  assert.equal(telemetryEvents.length, 1);
  assert.equal(telemetryEvents[0]?.outcome, 'success');
});

test('LiveRC job queue records telemetry when event ingestion fails', async () => {
  const processedItems: UpdateImportJobItemInput[] = [];
  const repository: ImportJobRepository = {
    async createJob() {
      throw new Error('not implemented');
    },
    async getJob() {
      return null;
    },
    takeNextQueuedJob: (() => {
      let taken = false;
      const job: ImportJobRecord = {
        jobId: 'job-2',
        state: 'RUNNING',
        progressPct: 0,
        message: undefined,
        items: [
          {
            id: 'item-2',
            targetType: 'EVENT',
            targetRef: 'https://live.liverc.com/results/failure-event',
            state: 'RUNNING',
            counts: undefined,
          },
        ],
      };

      return async () => {
        if (taken) {
          return null;
        }
        taken = true;
        return job;
      };
    })(),
    async markJobSucceeded() {
      throw new Error('should not succeed');
    },
    async markJobFailed(jobId, message) {
      repositoryState.markedFailed.push({ jobId, message });
    },
    async updateJobProgress() {
      return;
    },
    async updateJobItem(input) {
      processedItems.push(input);
    },
  } as ImportJobRepository;

  const repositoryState = {
    markedFailed: [] as { jobId: string; message: string }[],
  };

  const summaryImporter: StubSummaryImporter = {
    async ingestEventSummary() {
      throw new Error('ingestion failed');
    },
  };

  const telemetryEvents: Array<{ outcome: string; reason?: string }> = [];
  const telemetry: LiveRcTelemetry = {
    recordPlanRequest: () => {},
    recordApplyRequest: () => {},
    recordEventIngestion: (event) => {
      telemetryEvents.push({ outcome: event.outcome, reason: event.reason });
    },
    recordSessionIngestion: () => {},
  };

  const queue = new LiveRcJobQueue(
    { repository, summaryImporter, logger: undefined, telemetry },
    { pollIntervalMs: 5, processingDelayMs: 0 },
  );

  queue.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  queue.stop();

  assert.equal(processedItems.length, 1);
  assert.equal(processedItems[0]?.state, 'FAILED');
  assert.equal(repositoryState.markedFailed.length, 1);
  assert.equal(repositoryState.markedFailed[0]?.jobId, 'job-2');
  assert.equal(telemetryEvents.length, 1);
  assert.equal(telemetryEvents[0]?.outcome, 'failure');
});

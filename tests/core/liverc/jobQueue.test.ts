import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ImportJobRecord,
  ImportJobRepository,
  UpdateImportJobItemInput,
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
            targetRef: 'https://www.liverc.com/results/sample-event',
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
      return { sessionsImported: 2, resultRowsImported: 4 };
    },
  };

  let importerCalls = 0;

  const queue = new LiveRcJobQueue(
    { repository, summaryImporter, logger: undefined },
    { pollIntervalMs: 5, processingDelayMs: 0 },
  );

  await new Promise((resolve) => setTimeout(resolve, 50));
  queue.stop();

  assert.equal(importerCalls, 1);
  assert.equal(processedItems.length, 1);
  assert.deepEqual(processedItems[0], {
    jobId: 'job-1',
    itemId: 'item-1',
    state: 'SUCCEEDED',
    message: null,
    counts: { sessionsImported: 2, resultRowsImported: 4 },
  });
  assert.ok(progressUpdates.some((entry) => entry.jobId === 'job-1' && entry.progress === 100));
  assert.equal(repositoryState.markedSucceeded, 1);
  assert.deepEqual(repositoryState.markedFailed, []);
});

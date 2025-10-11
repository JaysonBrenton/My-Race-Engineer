import { createHash } from 'node:crypto';

import type { Logger } from '@core/app/ports/logger';
import type { ImportJobRecord, ImportJobRepository } from '@core/app/ports/importJobRepository';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_PROCESSING_DELAY_MS = 250;

export type LiveRcJobQueueDependencies = {
  repository: ImportJobRepository;
  logger?: Pick<Logger, 'error'>;
};

export type EnqueueJobItemInput = {
  eventRef: string;
  counts?: unknown;
};

export type LiveRcJobStatus = ImportJobRecord;

const waitFor = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const computePlanHash = (planId: string) => createHash('sha256').update(planId).digest('hex');

export class LiveRcJobQueue {
  private readonly pollIntervalMs: number;

  private readonly processingDelayMs: number;

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  private tickInProgress = false;

  constructor(
    private readonly dependencies: LiveRcJobQueueDependencies,
    options: { pollIntervalMs?: number; processingDelayMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.processingDelayMs = options.processingDelayMs ?? DEFAULT_PROCESSING_DELAY_MS;
    this.start();
  }

  async enqueueJob(planId: string, items: EnqueueJobItemInput[]): Promise<{ jobId: string }> {
    const planHash = computePlanHash(planId.trim());
    const jobItems = items
      .map((item) => ({
        targetType: 'EVENT' as const,
        targetRef: item.eventRef.trim(),
        counts: item.counts,
      }))
      .filter((item) => item.targetRef.length > 0);

    return this.dependencies.repository.createJob({
      planId,
      planHash,
      mode: 'SUMMARY',
      items: jobItems,
    });
  }

  getJob(jobId: string): Promise<LiveRcJobStatus | null> {
    return this.dependencies.repository.getJob(jobId);
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextTick();
  }

  stop() {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick() {
    if (!this.running) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  private async tick() {
    if (!this.running) {
      return;
    }

    if (this.tickInProgress) {
      this.scheduleNextTick();
      return;
    }

    this.tickInProgress = true;

    try {
      const job = await this.dependencies.repository.takeNextQueuedJob();
      if (!job) {
        return;
      }

      await this.processJob(job);
    } catch (error) {
      this.dependencies.logger?.error?.('LiveRC job runner tick failed.', {
        event: 'liverc.jobRunner.tick_failed',
        outcome: 'failure',
        error,
      });
    } finally {
      this.tickInProgress = false;
      this.scheduleNextTick();
    }
  }

  private async processJob(job: ImportJobRecord) {
    try {
      await waitFor(this.processingDelayMs);
      await this.dependencies.repository.markJobSucceeded(job.jobId);
    } catch (error) {
      this.dependencies.logger?.error?.('LiveRC job runner failed to finalise job.', {
        event: 'liverc.jobRunner.job_failed',
        outcome: 'failure',
        jobId: job.jobId,
        error,
      });
    }
  }
}

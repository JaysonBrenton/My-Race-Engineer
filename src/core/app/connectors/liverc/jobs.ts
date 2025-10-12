/**
 * Author: Jayson Brenton
 * Date: 2025-10-12
 * Purpose: Permit debug-level logging in LiveRC job pipeline without behavior change.
 */

import { createHash } from 'node:crypto';

import type { Logger } from '@core/app/ports/logger';
import type {
  ImportJobRecord,
  ImportJobRepository,
  UpdateImportJobItemInput,
} from '@core/app/ports/importJobRepository';

import type { LiveRcSummaryImporter, LiveRcSummaryImportCounts } from './summary';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_PROCESSING_DELAY_MS = 250;

type SummaryImporter = Pick<LiveRcSummaryImporter, 'ingestEventSummary'>;

export type LiveRcJobQueueDependencies = {
  repository: ImportJobRepository;
  summaryImporter: SummaryImporter;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
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
      await this.processJobItems(job);
      await this.dependencies.repository.markJobSucceeded(job.jobId);
    } catch (error) {
      this.dependencies.logger?.error?.('LiveRC job runner failed to finalise job.', {
        event: 'liverc.jobRunner.job_failed',
        outcome: 'failure',
        jobId: job.jobId,
        error,
      });

      try {
        await this.dependencies.repository.markJobFailed(
          job.jobId,
          'LiveRC summary import failed.',
        );
      } catch (markError) {
        this.dependencies.logger?.error?.('LiveRC job runner failed to mark job as failed.', {
          event: 'liverc.jobRunner.job_mark_failed',
          outcome: 'failure',
          jobId: job.jobId,
          error: markError,
        });
      }
    }
  }

  private async processJobItems(job: ImportJobRecord) {
    const totalItems = job.items.length;

    if (totalItems === 0) {
      await this.dependencies.repository.updateJobProgress(job.jobId, 100);
      return;
    }

    let processed = 0;

    for (const item of job.items) {
      await waitFor(this.processingDelayMs);

      let counts: LiveRcSummaryImportCounts;
      const eventStartedAt = Date.now();

      this.dependencies.logger?.debug?.('TODO ingest.event.start telemetry hook', {
        event: 'liverc.telemetry.todo',
        metric: 'ingest.event.start',
        jobId: job.jobId,
        itemId: item.id,
        targetRef: item.targetRef,
      });

      try {
        this.dependencies.logger?.info?.('LiveRC summary import started for event.', {
          event: 'liverc.jobRunner.item_started',
          outcome: 'running',
          jobId: job.jobId,
          itemId: item.id,
          targetRef: item.targetRef,
        });

        counts = await this.dependencies.summaryImporter.ingestEventSummary(item.targetRef);
      } catch (error) {
        await this.safeUpdateJobItem({
          jobId: job.jobId,
          itemId: item.id,
          state: 'FAILED',
          message: 'Failed to import LiveRC event summary.',
        });

        this.dependencies.logger?.warn?.('LiveRC summary import failed for event.', {
          event: 'liverc.jobRunner.item_failed',
          outcome: 'failure',
          jobId: job.jobId,
          itemId: item.id,
          targetRef: item.targetRef,
          error,
        });

        this.dependencies.logger?.debug?.('TODO ingest.event.finish telemetry hook', {
          event: 'liverc.telemetry.todo',
          metric: 'ingest.event.finish',
          outcome: 'failure',
          jobId: job.jobId,
          itemId: item.id,
          targetRef: item.targetRef,
          durationMs: Date.now() - eventStartedAt,
          error,
        });

        throw error;
      }

      await this.safeUpdateJobItem({
        jobId: job.jobId,
        itemId: item.id,
        state: 'SUCCEEDED',
        message: null,
        counts,
      });

      processed += 1;
      const progress = Math.round((processed / totalItems) * 100);
      await this.dependencies.repository.updateJobProgress(job.jobId, progress);

      this.dependencies.logger?.info?.('LiveRC summary import completed for event.', {
        event: 'liverc.jobRunner.item_succeeded',
        outcome: 'success',
        jobId: job.jobId,
        itemId: item.id,
        targetRef: item.targetRef,
        counts,
      });

      this.dependencies.logger?.debug?.('TODO ingest.event.finish telemetry hook', {
        event: 'liverc.telemetry.todo',
        metric: 'ingest.event.finish',
        outcome: 'success',
        jobId: job.jobId,
        itemId: item.id,
        targetRef: item.targetRef,
        durationMs: Date.now() - eventStartedAt,
        counts,
      });
    }
  }

  private async safeUpdateJobItem(input: UpdateImportJobItemInput) {
    try {
      await this.dependencies.repository.updateJobItem(input);
    } catch (error) {
      this.dependencies.logger?.error?.('LiveRC job runner failed to update job item.', {
        event: 'liverc.jobRunner.item_update_failed',
        outcome: 'failure',
        jobId: input.jobId,
        itemId: input.itemId,
        error,
      });
    }
  }
}

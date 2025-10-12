import { randomUUID } from 'node:crypto';

import type { Logger } from '@core/app';
import type { LiveRcJobQueue, LiveRcJobStatus } from '@core/app';

import { isPrismaUnavailableError, liveRcImportJobQueue } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

type RouteContext = {
  params: {
    jobId?: string;
  };
};

export type JobStatusRouteContext = RouteContext;

type RouteHandler = (req: Request, context: RouteContext) => Promise<Response> | Response;

type JobStatusRouteHandlers = {
  GET: RouteHandler;
  OPTIONS?: RouteHandler;
};

type JobQueue = Pick<LiveRcJobQueue, 'getJob'>;

type ResolvedDependencies = {
  jobQueue: JobQueue;
  logger: Logger;
  isDatabaseUnavailable: (error: unknown) => boolean;
};

const defaultDependencies: ResolvedDependencies = {
  jobQueue: liveRcImportJobQueue,
  logger: applicationLogger,
  isDatabaseUnavailable: isPrismaUnavailableError,
};

export type JobStatusRouteDependencies = Partial<ResolvedDependencies>;

const buildJsonResponse = (status: number, payload: unknown, requestId: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...baseHeaders,
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });

const withRequestContext = (logger: Logger, requestId: string) =>
  logger.withContext({ requestId, route: '/api/connectors/liverc/jobs/[jobId]' });

const safeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const aggregateCounts = (items: LiveRcJobStatus['items']) => {
  let sessionsImported = 0;
  let resultRowsImported = 0;
  let lapsImported = 0;
  let driversWithLaps = 0;
  let lapsSkipped = 0;

  for (const item of items) {
    if (!item.counts || typeof item.counts !== 'object') {
      continue;
    }

    const counts = item.counts as Record<string, unknown>;
    sessionsImported += safeNumber(counts.sessionsImported);
    resultRowsImported += safeNumber(counts.resultRowsImported);
    lapsImported += safeNumber(counts.lapsImported);
    driversWithLaps += safeNumber(counts.driversWithLaps);
    lapsSkipped += safeNumber(counts.lapsSkipped);
  }

  return { sessionsImported, resultRowsImported, lapsImported, driversWithLaps, lapsSkipped };
};

const summariseItems = (items: LiveRcJobStatus['items']) => {
  const total = items.length;
  const completed = items.filter((item) => item.state === 'SUCCEEDED').length;

  return { total, completed };
};

const normaliseJob = (job: LiveRcJobStatus) => {
  const counts = aggregateCounts(job.items);
  const itemSummary = summariseItems(job.items);

  return {
    jobId: job.jobId,
    state: job.state,
    progressPct: job.progressPct,
    message: job.message,
    counts,
    progress: {
      percentage: job.progressPct,
      completedItems: itemSummary.completed,
      totalItems: itemSummary.total,
    },
    items: job.items.map((item) => ({
      id: item.id,
      targetType: item.targetType,
      targetRef: item.targetRef,
      state: item.state,
      message: item.message,
      counts: item.counts,
    })),
  };
};

export const createJobStatusRouteHandlers = (
  overrides: JobStatusRouteDependencies = {},
): JobStatusRouteHandlers => {
  const dependencies: ResolvedDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  const GET: RouteHandler = async (request, context) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const logger = withRequestContext(dependencies.logger, requestId);
    const rawJobId = context.params.jobId ?? '';
    const jobId = rawJobId.trim();

    if (!jobId) {
      logger.warn('LiveRC job status requested without a jobId parameter.', {
        event: 'liverc.jobStatus.invalid_request',
        outcome: 'invalid-request',
        details: { jobId: rawJobId },
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'INVALID_JOB_ID',
            message: 'A valid job identifier must be provided.',
          },
          requestId,
        },
        requestId,
      );
    }

    try {
      const job = await dependencies.jobQueue.getJob(jobId);

      if (!job) {
        logger.warn('LiveRC job status requested for unknown job.', {
          event: 'liverc.jobStatus.not_found',
          outcome: 'not-found',
          jobId,
        });

        return buildJsonResponse(
          404,
          {
            error: {
              code: 'JOB_NOT_FOUND',
              message: 'Import job could not be found.',
            },
            requestId,
          },
          requestId,
        );
      }

      logger.info('LiveRC job status retrieved.', {
        event: 'liverc.jobStatus.success',
        outcome: 'success',
        jobId,
        state: job.state,
      });

      return buildJsonResponse(
        200,
        {
          data: normaliseJob(job),
          requestId,
        },
        requestId,
      );
    } catch (error) {
      if (dependencies.isDatabaseUnavailable(error)) {
        logger.error('LiveRC job status unavailable due to database error.', {
          event: 'liverc.jobStatus.db_unavailable',
          outcome: 'failure',
          jobId,
          error,
        });

        return buildJsonResponse(
          503,
          {
            error: {
              code: 'DATABASE_UNAVAILABLE',
              message: 'Unable to read LiveRC job status at this time.',
            },
            requestId,
          },
          requestId,
        );
      }

      logger.error('LiveRC job status failed due to unexpected error.', {
        event: 'liverc.jobStatus.unexpected_error',
        outcome: 'failure',
        jobId,
        error,
      });

      return buildJsonResponse(
        500,
        {
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'Unexpected error while retrieving job status.',
          },
          requestId,
        },
        requestId,
      );
    }
  };

  const OPTIONS: RouteHandler = () =>
    new Response(null, {
      status: 204,
      headers: {
        ...baseHeaders,
        Allow: 'OPTIONS, GET',
      },
    });

  return { GET, OPTIONS };
};

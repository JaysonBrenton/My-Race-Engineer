import { randomUUID } from 'node:crypto';

import type { Logger } from '@core/app';
import type { LiveRcImportPlanService, LiveRcJobQueue } from '@core/app';
import { z } from 'zod';

import { liveRcImportPlanService, liveRcImportJobQueue } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';
import { liveRcImportPlanStore, type LiveRcImportPlanStore } from '../planStore';

type RouteHandler = (req: Request) => Promise<Response> | Response;

type ApplyRouteHandlers = {
  POST: RouteHandler;
  OPTIONS?: RouteHandler;
};

type PlanService = Pick<LiveRcImportPlanService, 'createPlan'>;

type JobQueue = Pick<LiveRcJobQueue, 'enqueueJob'>;

type ResolvedDependencies = {
  planService: PlanService;
  jobQueue: JobQueue;
  planStore: LiveRcImportPlanStore;
  logger: Logger;
};

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export const MAX_EVENTS_PER_PLAN = 12;
export const MAX_TOTAL_ESTIMATED_LAPS = 10_000;

const defaultDependencies: ResolvedDependencies = {
  planService: liveRcImportPlanService,
  jobQueue: liveRcImportJobQueue,
  planStore: liveRcImportPlanStore,
  logger: applicationLogger,
};

export type ImportApplyRouteDependencies = Partial<ResolvedDependencies>;

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
  logger.withContext({ requestId, route: '/api/connectors/liverc/import/apply' });

const planIdSchema = z.object({
  planId: z
    .string({ required_error: 'Plan identifier is required.' })
    .trim()
    .min(1, 'Plan identifier is required.'),
});

const normaliseEstimatedLaps = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : 0);

const computeTotals = (plan: { items: { counts: { estimatedLaps: number } }[] }) => {
  const eventCount = plan.items.length;
  const estimatedLaps = plan.items.reduce(
    (total, item) => total + normaliseEstimatedLaps(item.counts.estimatedLaps),
    0,
  );

  return { eventCount, estimatedLaps };
};

export const createImportApplyRouteHandlers = (
  overrides: ImportApplyRouteDependencies = {},
): ApplyRouteHandlers => {
  const dependencies: ResolvedDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  const buildRequestLogger = (requestId: string) => withRequestContext(dependencies.logger, requestId);

  const OPTIONS: RouteHandler = () =>
    new Response(null, {
      status: 204,
      headers: {
        ...baseHeaders,
        Allow: 'OPTIONS, POST',
      },
    });

  const POST: RouteHandler = async (request) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const requestLogger = buildRequestLogger(requestId);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (error) {
      requestLogger.warn('Failed to parse LiveRC import apply request as JSON.', {
        event: 'liverc.importApply.invalid_json',
        outcome: 'invalid-payload',
        error,
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must be valid JSON.',
          },
          requestId,
        },
        requestId,
      );
    }

    const parsed = planIdSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      requestLogger.warn('LiveRC import apply request failed validation.', {
        event: 'liverc.importApply.invalid_request',
        outcome: 'invalid-payload',
        details: { issues },
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'LiveRC import apply request payload is invalid.',
            details: { issues },
          },
          requestId,
        },
        requestId,
      );
    }

    const planId = parsed.data.planId;

    const storedPlan = await dependencies.planStore.get(planId);
    if (!storedPlan) {
      requestLogger.warn('LiveRC import apply request referenced unknown plan.', {
        event: 'liverc.importApply.plan_not_found',
        outcome: 'not-found',
        planId,
      });

      return buildJsonResponse(
        404,
        {
          error: {
            code: 'PLAN_NOT_FOUND',
            message: 'Import plan could not be found. Generate a new plan and try again.',
          },
          requestId,
        },
        requestId,
      );
    }

    let plan = storedPlan.plan;
    if (!plan) {
      try {
        const recomputedPlan = await dependencies.planService.createPlan(storedPlan.request);
        plan = { ...recomputedPlan, planId };
        await dependencies.planStore.save({ planId, request: storedPlan.request, plan });
      } catch (error) {
        requestLogger.error('Failed to recompute LiveRC import plan during apply.', {
          event: 'liverc.importApply.plan_recompute_failed',
          outcome: 'failure',
          planId,
          error,
        });

        return buildJsonResponse(
          500,
          {
            error: {
              code: 'PLAN_RECOMPUTE_FAILED',
              message: 'Unable to recompute LiveRC import plan. Generate a new plan and try again.',
            },
            requestId,
          },
          requestId,
        );
      }
    }

    const totals = computeTotals(plan);
    if (totals.eventCount > MAX_EVENTS_PER_PLAN || totals.estimatedLaps > MAX_TOTAL_ESTIMATED_LAPS) {
      requestLogger.warn('LiveRC import plan exceeds guardrails.', {
        event: 'liverc.importApply.guardrails_exceeded',
        outcome: 'rejected',
        planId,
        totals,
        limits: {
          maxEvents: MAX_EVENTS_PER_PLAN,
          maxEstimatedLaps: MAX_TOTAL_ESTIMATED_LAPS,
        },
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'PLAN_GUARDRAILS_EXCEEDED',
            message: 'Selected LiveRC events exceed import guardrails.',
            details: {
              eventCount: totals.eventCount,
              estimatedLaps: totals.estimatedLaps,
              limits: {
                maxEvents: MAX_EVENTS_PER_PLAN,
                maxEstimatedLaps: MAX_TOTAL_ESTIMATED_LAPS,
              },
            },
          },
          requestId,
        },
        requestId,
      );
    }

    try {
      const job = await dependencies.jobQueue.enqueueJob(
        planId,
        plan.items.map((item) => ({
          eventRef: item.eventRef,
          counts: item.counts,
        })),
      );

      requestLogger.info('LiveRC import job enqueued from plan.', {
        event: 'liverc.importApply.success',
        outcome: 'accepted',
        planId,
        jobId: job.jobId,
        eventCount: totals.eventCount,
        estimatedLaps: totals.estimatedLaps,
      });

      return new Response(
        JSON.stringify({ data: { jobId: job.jobId }, requestId }),
        {
          status: 202,
          headers: {
            ...baseHeaders,
            'content-type': 'application/json',
            'x-request-id': requestId,
            Location: `/api/connectors/liverc/jobs/${job.jobId}`,
          },
        },
      );
    } catch (error) {
      requestLogger.error('Failed to enqueue LiveRC import job from plan.', {
        event: 'liverc.importApply.enqueue_failed',
        outcome: 'failure',
        planId,
        error,
      });

      return buildJsonResponse(
        500,
        {
          error: {
            code: 'JOB_ENQUEUE_FAILED',
            message: 'Unable to queue LiveRC import job. Try again later.',
          },
          requestId,
        },
        requestId,
      );
    }
  };

  return { POST, OPTIONS };
};

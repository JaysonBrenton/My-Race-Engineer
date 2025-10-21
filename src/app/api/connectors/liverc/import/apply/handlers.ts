import { randomUUID } from 'node:crypto';

import type { Logger, LiveRcImportPlanService, LiveRcJobQueue, LiveRcTelemetry } from '@core/app';
import { z } from 'zod';

import { liveRcImportPlanService, liveRcImportJobQueue } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';
import { livercTelemetry } from '@/dependencies/telemetry';
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
  telemetry: LiveRcTelemetry;
};

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export const MAX_EVENTS_PER_PLAN = 50;
export const MAX_TOTAL_ESTIMATED_LAPS = 200_000;

const defaultDependencies: ResolvedDependencies = {
  planService: liveRcImportPlanService,
  jobQueue: liveRcImportJobQueue,
  planStore: liveRcImportPlanStore,
  logger: applicationLogger,
  telemetry: livercTelemetry,
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

const normaliseEstimatedLaps = (value: number | undefined) =>
  Number.isFinite(value) ? (value as number) : 0;

const computeTotals = (plan: { items: { counts: { estimatedLaps: number } }[] }) => {
  const eventCount = plan.items.length;
  const estimatedLaps = plan.items.reduce(
    (total, item) => total + normaliseEstimatedLaps(item.counts.estimatedLaps),
    0,
  );

  return { eventCount, estimatedLaps };
};

const formatInteger = (value: number) => new Intl.NumberFormat('en-US').format(value);

const buildGuardrailMessage = (totals: { eventCount: number; estimatedLaps: number }) => {
  const eventOverage = Math.max(0, totals.eventCount - MAX_EVENTS_PER_PLAN);
  const lapOverage = Math.max(0, totals.estimatedLaps - MAX_TOTAL_ESTIMATED_LAPS);
  const suggestedChunks = Math.max(
    eventOverage > 0 ? Math.ceil(totals.eventCount / MAX_EVENTS_PER_PLAN) : 1,
    lapOverage > 0 ? Math.ceil(totals.estimatedLaps / MAX_TOTAL_ESTIMATED_LAPS) : 1,
  );

  const actions: string[] = [];
  if (eventOverage > 0) {
    actions.push(
      `remove at least ${formatInteger(eventOverage)} event${eventOverage === 1 ? '' : 's'}`,
    );
  }
  if (lapOverage > 0) {
    actions.push(
      `drop enough high-lap sessions to stay under ${formatInteger(MAX_TOTAL_ESTIMATED_LAPS)} estimated laps`,
    );
  }

  let message = 'Selected LiveRC events exceed import guardrails.';
  if (actions.length > 0) {
    message += ` Please ${actions.join(' and ')}.`;
  }

  if (suggestedChunks > 1) {
    const approxEventsPerChunk = Math.max(1, Math.ceil(totals.eventCount / suggestedChunks));
    message += ` Or split the plan into ${suggestedChunks} apply jobs of about ${formatInteger(
      approxEventsPerChunk,
    )} events each.`;
  }

  return {
    message,
    eventOverage,
    lapOverage,
    suggestedChunks: suggestedChunks > 1 ? suggestedChunks : 1,
  };
};

export const createImportApplyRouteHandlers = (
  overrides: ImportApplyRouteDependencies = {},
): ApplyRouteHandlers => {
  const dependencies: ResolvedDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  const buildRequestLogger = (requestId: string) =>
    withRequestContext(dependencies.logger, requestId);

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
    const requestStartedAt = Date.now();

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

      dependencies.telemetry.recordApplyRequest({
        outcome: 'rejected',
        durationMs: Date.now() - requestStartedAt,
        planId,
        reason: 'plan_not_found',
        eventCount: 0,
        estimatedLaps: 0,
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

        dependencies.telemetry.recordApplyRequest({
          outcome: 'failure',
          durationMs: Date.now() - requestStartedAt,
          planId,
          reason: 'plan_recompute_failed',
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
    if (
      totals.eventCount > MAX_EVENTS_PER_PLAN ||
      totals.estimatedLaps > MAX_TOTAL_ESTIMATED_LAPS
    ) {
      const guardrailMessage = buildGuardrailMessage(totals);
      requestLogger.warn('LiveRC import plan exceeds guardrails.', {
        event: 'liverc.importApply.guardrails_exceeded',
        outcome: 'rejected',
        planId,
        totals,
        limits: {
          maxEvents: MAX_EVENTS_PER_PLAN,
          maxEstimatedLaps: MAX_TOTAL_ESTIMATED_LAPS,
        },
        suggestions: {
          eventOverage: guardrailMessage.eventOverage,
          lapOverage: guardrailMessage.lapOverage,
          chunkCount: guardrailMessage.suggestedChunks,
        },
      });

      dependencies.telemetry.recordApplyRequest({
        outcome: 'rejected',
        durationMs: Date.now() - requestStartedAt,
        planId,
        eventCount: totals.eventCount,
        estimatedLaps: totals.estimatedLaps,
        reason: 'guardrails',
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'PLAN_GUARDRAILS_EXCEEDED',
            message: guardrailMessage.message,
            details: {
              eventCount: totals.eventCount,
              estimatedLaps: totals.estimatedLaps,
              limits: {
                maxEvents: MAX_EVENTS_PER_PLAN,
                maxEstimatedLaps: MAX_TOTAL_ESTIMATED_LAPS,
              },
              suggestions: {
                trimEvents:
                  guardrailMessage.eventOverage > 0 ? guardrailMessage.eventOverage : undefined,
                trimEstimatedLaps:
                  guardrailMessage.lapOverage > 0 ? guardrailMessage.lapOverage : undefined,
                chunkCount: guardrailMessage.suggestedChunks,
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

      dependencies.telemetry.recordApplyRequest({
        outcome: 'accepted',
        durationMs: Date.now() - requestStartedAt,
        planId,
        jobId: job.jobId,
        eventCount: totals.eventCount,
        estimatedLaps: totals.estimatedLaps,
      });

      return new Response(JSON.stringify({ data: { jobId: job.jobId }, requestId }), {
        status: 202,
        headers: {
          ...baseHeaders,
          'content-type': 'application/json',
          'x-request-id': requestId,
          Location: `/api/connectors/liverc/jobs/${job.jobId}`,
        },
      });
    } catch (error) {
      requestLogger.error('Failed to enqueue LiveRC import job from plan.', {
        event: 'liverc.importApply.enqueue_failed',
        outcome: 'failure',
        planId,
        error,
      });

      dependencies.telemetry.recordApplyRequest({
        outcome: 'failure',
        durationMs: Date.now() - requestStartedAt,
        planId,
        eventCount: totals.eventCount,
        estimatedLaps: totals.estimatedLaps,
        reason: 'enqueue_failed',
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

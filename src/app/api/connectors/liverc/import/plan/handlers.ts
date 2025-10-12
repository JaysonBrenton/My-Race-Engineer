import { randomUUID } from 'node:crypto';

import type { Logger } from '@core/app';
import type { LiveRcImportPlanService } from '@core/app';
import { LiveRcClientError } from '@core/app/connectors/liverc/client';
import { z } from 'zod';

import { liveRcImportPlanService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';
import { liveRcImportPlanStore, type LiveRcImportPlanStore } from '../planStore';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

type RouteHandler = (req: Request) => Promise<Response> | Response;

type ImportPlanRouteHandlers = {
  POST: RouteHandler;
  OPTIONS?: RouteHandler;
};

type PlanService = Pick<LiveRcImportPlanService, 'createPlan'>;

type ResolvedDependencies = {
  service: PlanService;
  logger: Logger;
  planStore: LiveRcImportPlanStore;
};

const defaultDependencies: ResolvedDependencies = {
  service: liveRcImportPlanService,
  logger: applicationLogger,
  planStore: liveRcImportPlanStore,
};

export type ImportPlanRouteDependencies = Partial<ResolvedDependencies>;

const withRequestContext = (logger: Logger, context: { requestId: string }) =>
  logger.withContext({ ...context, route: '/api/connectors/liverc/import/plan' });

const planRequestSchema = z.object({
  events: z
    .array(
      z.object({
        eventRef: z
          .string({ required_error: 'Event reference is required.' })
          .trim()
          .min(1, 'Event reference is required.'),
      }),
    )
    .min(1, 'At least one event reference must be provided.'),
});

const buildJsonResponse = (status: number, payload: unknown, requestId: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...baseHeaders,
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });

const normaliseZodIssues = (issues: z.ZodIssue[]) =>
  issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

export const createImportPlanRouteHandlers = (
  overrides: ImportPlanRouteDependencies = {},
): ImportPlanRouteHandlers => {
  const dependencies: ResolvedDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  const buildRequestLogger = (requestId: string) => withRequestContext(dependencies.logger, { requestId });

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
      requestLogger.warn('Failed to parse LiveRC import plan request as JSON.', {
        event: 'liverc.importPlan.invalid_json',
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

    const parsed = planRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issues = normaliseZodIssues(parsed.error.issues);

      requestLogger.warn('LiveRC import plan request failed validation.', {
        event: 'liverc.importPlan.invalid_request',
        outcome: 'invalid-payload',
        details: { issues },
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'LiveRC import plan request payload is invalid.',
            details: { issues },
          },
          requestId,
        },
        requestId,
      );
    }

    try {
      const plan = await dependencies.service.createPlan(parsed.data);

      try {
        await dependencies.planStore.save({ planId: plan.planId, request: parsed.data, plan });
      } catch (storeError) {
        requestLogger.error('Failed to persist LiveRC import plan.', {
          event: 'liverc.importPlan.persistence_failed',
          outcome: 'failure',
          planId: plan.planId,
          error: storeError,
        });

        return buildJsonResponse(
          500,
          {
            error: {
              code: 'PLAN_PERSISTENCE_FAILED',
              message: 'Unable to persist LiveRC import plan.',
            },
            requestId,
          },
          requestId,
        );
      }

      requestLogger.info('LiveRC import plan generated.', {
        event: 'liverc.importPlan.success',
        outcome: 'success',
        planId: plan.planId,
        eventCount: plan.items.length,
      });

      return buildJsonResponse(
        200,
        {
          data: plan,
          requestId,
        },
        requestId,
      );
    } catch (error) {
      if (error instanceof LiveRcClientError) {
        requestLogger.warn('LiveRC import plan failed due to upstream error.', {
          event: 'liverc.importPlan.upstream_failure',
          outcome: 'failure',
          code: error.code,
          status: error.status,
          url: error.url,
          details: error.details,
        });

        return buildJsonResponse(
          error.status ?? 502,
          {
            error: {
              code: error.code ?? 'UPSTREAM_ERROR',
              message: 'Failed to fetch LiveRC event overview.',
              details: { url: error.url, status: error.status },
            },
            requestId,
          },
          requestId,
        );
      }

      requestLogger.error('LiveRC import plan failed due to unexpected error.', {
        event: 'liverc.importPlan.unexpected_error',
        outcome: 'failure',
        error,
      });

      return buildJsonResponse(
        500,
        {
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'Unexpected error while generating LiveRC import plan.',
          },
          requestId,
        },
        requestId,
      );
    }
  };

  return { OPTIONS, POST };
};

/* eslint @typescript-eslint/no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
// src/app/api/liverc/import/handlers.ts

import { randomUUID } from 'node:crypto';

import type { Logger, LoggerContext } from '@core/app';
import { LiveRcImportError, type LiveRcImportService } from '@core/app';
import { LiveRcHttpError } from '@core/infra/http/liveRcClient';
import { z } from 'zod';

import { isPrismaUnavailableError, liveRcImportService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

type RouteHandler = (req: Request) => Promise<Response> | Response;

type ImportRouteHandlers = {
  POST: RouteHandler;
  OPTIONS?: RouteHandler;
  GET?: RouteHandler;
  PUT?: RouteHandler;
  PATCH?: RouteHandler;
  DELETE?: RouteHandler;
  HEAD?: RouteHandler;
};

const buildJsonResponse = (status: number, payload: unknown, requestId: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...baseHeaders,
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });

const importRequestSchema = z.object({
  url: z
    .string({ required_error: 'LiveRC import URL is required.' })
    .trim()
    .min(1, 'LiveRC import URL is required.')
    .url('LiveRC import URL must be a valid URL.'),
  includeOutlaps: z.boolean().optional(),
});

type ImportService = Pick<LiveRcImportService, 'importFromUrl'>;

type ResolvedDependencies = {
  service: ImportService;
  logger: Logger;
  isDatabaseUnavailable: (error: unknown) => boolean;
};

const defaultDependencies: ResolvedDependencies = {
  service: liveRcImportService,
  logger: applicationLogger,
  isDatabaseUnavailable: isPrismaUnavailableError,
};

const withRequestContext = (logger: Logger, context: LoggerContext): Logger =>
  logger.withContext(context);

const normaliseZodIssues = (issues: z.ZodIssue[]) =>
  issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

const buildSuccessLogContext = (summary: Awaited<ReturnType<ImportService['importFromUrl']>>) => ({
  event: 'liverc.import.success',
  outcome: 'success',
  entrantsProcessed: summary.entrantsProcessed,
  lapsImported: summary.lapsImported,
  skippedLapCount: summary.skippedLapCount,
  skippedEntrantCount: summary.skippedEntrantCount,
  skippedOutlapCount: summary.skippedOutlapCount,
  raceId: summary.raceId,
  sessionId: summary.sessionId,
  raceClassId: summary.raceClassId,
  eventId: summary.eventId,
});

export type ImportRouteDependencies = {
  service?: ImportService;
  logger?: Logger;
  isDatabaseUnavailable?: (error: unknown) => boolean;
};

export const createImportRouteHandlers = (
  overrides: ImportRouteDependencies = {},
): ImportRouteHandlers => {
  const {
    service = defaultDependencies.service,
    logger = defaultDependencies.logger,
    isDatabaseUnavailable = defaultDependencies.isDatabaseUnavailable,
  } = overrides;

  const dependencies: ResolvedDependencies = {
    service,
    logger,
    isDatabaseUnavailable,
  };

  const buildRequestLogger = (requestId: string) =>
    withRequestContext(dependencies.logger, {
      requestId,
      route: '/api/liverc/import',
    });

  const OPTIONS: RouteHandler = (_request) =>
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
      requestLogger.warn('Failed to parse LiveRC import request as JSON.', {
        event: 'liverc.import.invalid_json',
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

    const parsed = importRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      requestLogger.warn('LiveRC import request failed validation.', {
        event: 'liverc.import.invalid_request',
        outcome: 'invalid-payload',
        details: { issues: normaliseZodIssues(parsed.error.issues) },
      });

      return buildJsonResponse(
        400,
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'LiveRC import request payload is invalid.',
            details: { issues: normaliseZodIssues(parsed.error.issues) },
          },
          requestId,
        },
        requestId,
      );
    }

    try {
      const summary = await dependencies.service.importFromUrl(parsed.data.url, {
        includeOutlaps: parsed.data.includeOutlaps ?? false,
        logger: requestLogger,
      });

      requestLogger.info('LiveRC import accepted.', buildSuccessLogContext(summary));

      return buildJsonResponse(
        202,
        {
          data: summary,
          requestId,
        },
        requestId,
      );
    } catch (error) {
      if (error instanceof LiveRcHttpError) {
        requestLogger.warn('LiveRC import failed due to upstream error.', {
          event: 'liverc.import.upstream_failure',
          outcome: 'failure',
          code: error.code,
          status: error.status,
          details: error.details,
        });

        return buildJsonResponse(
          error.status,
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
            requestId,
          },
          requestId,
        );
      }

      if (error instanceof LiveRcImportError) {
        requestLogger.warn('LiveRC import rejected due to validation error.', {
          event: 'liverc.import.validation_failed',
          outcome: 'failure',
          code: error.code,
          details: error.details,
        });

        return buildJsonResponse(
          error.status,
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
            requestId,
          },
          requestId,
        );
      }

      if (dependencies.isDatabaseUnavailable(error)) {
        requestLogger.error('Database unavailable while importing LiveRC data.', {
          event: 'liverc.import.database_unavailable',
          outcome: 'failure',
        });

        return buildJsonResponse(
          503,
          {
            error: {
              code: 'DATABASE_UNAVAILABLE',
              message: 'Database is not available to store LiveRC data.',
            },
            requestId,
          },
          requestId,
        );
      }

      requestLogger.error('Unexpected error while importing LiveRC data.', {
        event: 'liverc.import.unexpected_error',
        outcome: 'failure',
        error,
      });

      return buildJsonResponse(
        500,
        {
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'Unexpected error while importing from LiveRC.',
          },
          requestId,
        },
        requestId,
      );
    }
  };

  return {
    OPTIONS,
    POST,
  };
};

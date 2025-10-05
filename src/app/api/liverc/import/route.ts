import { randomUUID } from 'node:crypto';

import {
  LiveRcImportError,
  type LiveRcImportOptions,
  type LiveRcImportSummary,
  type Logger,
} from '@core/app';
import { LiveRcHttpError } from '@core/infra/http/liveRcClient';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isPrismaUnavailableError, liveRcImportService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';

const ROUTE_ID = '/api/liverc/import';

const importSchema = z.object({
  url: z.string().url(),
  includeOutlaps: z.boolean().optional(),
});

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const jsonResponse = (status: number, payload: unknown, requestId: string) =>
  NextResponse.json(payload, {
    status,
    headers: {
      ...baseHeaders,
      'x-request-id': requestId,
    },
  });

type LiveRcImportExecutor = {
  importFromUrl: (url: string, options?: LiveRcImportOptions) => Promise<LiveRcImportSummary>;
};

export type ImportRouteDependencies = {
  service: LiveRcImportExecutor;
  logger: Logger;
};

const createImportRouteHandlers = (dependencies: ImportRouteDependencies) => {
  const { service, logger } = dependencies;

  const post = async (request: Request) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const requestLogger = logger.withContext({ requestId, route: ROUTE_ID });
    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch (error) {
      requestLogger.warn('Failed to parse LiveRC import request body.', {
        event: 'liverc.import.invalid_json',
        outcome: 'invalid-payload',
        error,
      });

      return jsonResponse(
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

    const parsed = importSchema.safeParse(rawBody);
    if (!parsed.success) {
      requestLogger.warn('LiveRC import payload failed validation.', {
        event: 'liverc.import.validation_failed',
        outcome: 'invalid-payload',
        issues: parsed.error.issues,
      });

      return jsonResponse(
        400,
        {
          error: {
            code: 'INVALID_IMPORT_PAYLOAD',
            message: 'Import payload failed validation.',
            details: parsed.error.flatten(),
          },
          requestId,
        },
        requestId,
      );
    }

    try {
      const result = await service.importFromUrl(parsed.data.url, {
        includeOutlaps: parsed.data.includeOutlaps,
        logger: requestLogger,
      });

      requestLogger.info('LiveRC import accepted.', {
        event: 'liverc.import.success',
        outcome: 'success',
        url: parsed.data.url,
        entrantsProcessed: result.entrantsProcessed,
        lapsImported: result.lapsImported,
        skippedLapCount: result.skippedLapCount,
        skippedEntrantCount: result.skippedEntrantCount,
        skippedOutlapCount: result.skippedOutlapCount,
      });

      return jsonResponse(
        202,
        {
          data: result,
          requestId,
        },
        requestId,
      );
    } catch (error) {
      if (error instanceof LiveRcHttpError) {
        requestLogger.warn('LiveRC upstream responded with an error.', {
          event: 'liverc.import.upstream_error',
          outcome: 'failure',
          status: error.status,
          code: error.code,
          details: error.details,
        });

        return jsonResponse(
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
        requestLogger.warn('LiveRC import failed.', {
          event: 'liverc.import.failure',
          outcome: 'failure',
          code: error.code,
          message: error.message,
          details: error.details,
        });

        return jsonResponse(
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

      if (isPrismaUnavailableError(error)) {
        requestLogger.error('Database unavailable for LiveRC import.', {
          event: 'liverc.import.database_unavailable',
          outcome: 'failure',
        });

        return jsonResponse(
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

      requestLogger.error('Unexpected error occurred during LiveRC import.', {
        event: 'liverc.import.unexpected_error',
        outcome: 'failure',
        error,
      });

      return jsonResponse(
        500,
        {
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'Unexpected error while importing LiveRC data.',
          },
          requestId,
        },
        requestId,
      );
    }
  };

  const get = (request: Request) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    return jsonResponse(
      405,
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'LiveRC import only supports POST.',
        },
        requestId,
      },
      requestId,
    );
  };

  return { POST: post, GET: get };
};

const _handlers = createImportRouteHandlers({
  service: liveRcImportService,
  logger: applicationLogger,
});

export const POST = _handlers.POST;

export const GET = _handlers.GET;

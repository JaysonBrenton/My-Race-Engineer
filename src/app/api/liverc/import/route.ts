import { randomUUID } from 'node:crypto';

import { LiveRcImportError } from '@core/app';
import { LiveRcHttpError } from '@core/infra/http/liveRcClient';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isPrismaUnavailableError, liveRcImportService } from '@/dependencies/liverc';

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

/**
 * POST /api/liverc/import
 *
 * Triggers a LiveRC import job. When the upstream LiveRC APIs return an HTTP error,
 * we surface the same status code, error code, and details from the `LiveRcHttpError`
 * instance so API consumers can react to the precise upstream failure.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch (error) {
    console.warn('liverc.import.invalid_json', { requestId, error });
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
    console.warn('liverc.import.validation_failed', {
      requestId,
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
    const result = await liveRcImportService.importFromUrl(parsed.data.url, {
      includeOutlaps: parsed.data.includeOutlaps,
    });

    console.info('liverc.import.success', {
      requestId,
      url: parsed.data.url,
      entrantsProcessed: result.entrantsProcessed,
      lapsImported: result.lapsImported,
      skippedLapCount: result.skippedLapCount,
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
      console.warn('liverc.import.upstream_error', {
        requestId,
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
      console.warn('liverc.import.failure', {
        requestId,
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
      console.error('liverc.import.database_unavailable', {
        requestId,
        message: 'Database connection unavailable.',
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

    console.error('liverc.import.unexpected_error', { requestId, error });

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
}

export function GET(request: Request) {
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
}

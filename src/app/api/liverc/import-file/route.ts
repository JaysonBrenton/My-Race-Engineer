import { randomUUID } from 'node:crypto';

import { LiveRcImportError } from '@core/app';
import { NextResponse } from 'next/server';

import { isPrismaUnavailableError, liveRcImportService } from '@/dependencies/liverc';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

const jsonResponse = (status: number, payload: unknown, requestId: string) =>
  NextResponse.json(payload, {
    status,
    headers: {
      ...baseHeaders,
      'x-request-id': requestId,
    },
  });

const isImportFileEnabled =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_IMPORT_FILE === '1';

export async function POST(request: Request) {
  if (!isImportFileEnabled) {
    return new NextResponse(null, { status: 404, headers: baseHeaders });
  }

  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch (error) {
    console.warn('liverc.importFile.invalid_json', { requestId, error });
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

  try {
    const result = await liveRcImportService.importFromPayload(rawBody);

    console.info('liverc.importFile.success', {
      requestId,
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
    if (error instanceof LiveRcImportError) {
      console.warn('liverc.importFile.failure', {
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
      console.error('liverc.importFile.database_unavailable', {
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

    console.error('liverc.importFile.unexpected_error', { requestId, error });

    return jsonResponse(
      500,
      {
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Unexpected error while importing LiveRC data from file.',
        },
        requestId,
      },
      requestId,
    );
  }
}

export function GET(request: Request) {
  if (!isImportFileEnabled) {
    return new NextResponse(null, { status: 404, headers: baseHeaders });
  }

  const requestId = request.headers.get('x-request-id') ?? randomUUID();

  return jsonResponse(
    405,
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'LiveRC import file upload only supports POST.',
      },
      requestId,
    },
    requestId,
  );
}

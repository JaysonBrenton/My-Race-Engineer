import { randomUUID } from 'node:crypto';

import { LiveRcImportError } from '@core/app';
import { buildUploadNamespaceSeed } from '@core/app/liverc/uploadNamespace';
import { NextResponse } from 'next/server';

import { isPrismaUnavailableError, liveRcImportService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';

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
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/liverc/import-file',
  });
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch (error) {
    logger.warn('Failed to parse LiveRC import file payload as JSON.', {
      event: 'liverc.importFile.invalid_json',
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

  if (typeof rawBody !== 'object' || rawBody === null) {
    logger.warn('LiveRC import file body missing payload object.', {
      event: 'liverc.importFile.invalid_body',
      outcome: 'invalid-payload',
      bodyType: typeof rawBody,
    });
    return jsonResponse(
      400,
      {
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Request body must be an object containing a payload field.',
        },
        requestId,
      },
      requestId,
    );
  }

  const container = rawBody as Record<string, unknown>;

  if (!container || !('payload' in container)) {
    logger.warn('LiveRC import file body missing payload field.', {
      event: 'liverc.importFile.missing_payload',
      outcome: 'invalid-payload',
    });
    return jsonResponse(
      400,
      {
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Request body must include a payload field with LiveRC race data.',
        },
        requestId,
      },
      requestId,
    );
  }

  const payload = container.payload;
  const metadataRaw = container.metadata;

  let metadata:
    | {
        fileName?: string;
        fileSizeBytes?: number;
        lastModifiedEpochMs?: number;
        uploadedAtEpochMs?: number;
        fileHash?: string;
        uploadNamespace?: string;
      }
    | undefined;

  if (metadataRaw !== undefined) {
    if (typeof metadataRaw !== 'object' || metadataRaw === null) {
      return jsonResponse(
        400,
        {
          error: {
            code: 'INVALID_METADATA',
            message: 'metadata must be an object when provided.',
          },
          requestId,
        },
        requestId,
      );
    }

    const metadataRecord = metadataRaw as Record<string, unknown>;
    metadata = {};

    if (typeof metadataRecord.fileName === 'string') {
      metadata.fileName = metadataRecord.fileName;
    }

    if (typeof metadataRecord.fileHash === 'string') {
      metadata.fileHash = metadataRecord.fileHash;
    }

    if (typeof metadataRecord.uploadNamespace === 'string') {
      metadata.uploadNamespace = metadataRecord.uploadNamespace;
    }

    if (
      typeof metadataRecord.fileSizeBytes === 'number' &&
      Number.isFinite(metadataRecord.fileSizeBytes)
    ) {
      metadata.fileSizeBytes = metadataRecord.fileSizeBytes;
    }

    if (
      typeof metadataRecord.lastModifiedEpochMs === 'number' &&
      Number.isFinite(metadataRecord.lastModifiedEpochMs)
    ) {
      metadata.lastModifiedEpochMs = metadataRecord.lastModifiedEpochMs;
    }

    if (
      typeof metadataRecord.uploadedAtEpochMs === 'number' &&
      Number.isFinite(metadataRecord.uploadedAtEpochMs)
    ) {
      metadata.uploadedAtEpochMs = metadataRecord.uploadedAtEpochMs;
    }
  }

  const namespaceSeed = buildUploadNamespaceSeed({
    fileName: metadata?.fileName,
    fileSizeBytes: metadata?.fileSizeBytes,
    lastModifiedEpochMs: metadata?.lastModifiedEpochMs,
    uploadedAtEpochMs: metadata?.uploadedAtEpochMs,
    fileHash: metadata?.fileHash,
    explicitNamespace: metadata?.uploadNamespace,
    requestId,
  });

  try {
    const result = await liveRcImportService.importFromPayload(payload, {
      logger,
      uploadMetadata: {
        fileName: metadata?.fileName,
        fileSizeBytes: metadata?.fileSizeBytes,
        lastModifiedEpochMs: metadata?.lastModifiedEpochMs,
        uploadedAtEpochMs: metadata?.uploadedAtEpochMs,
        fileHash: metadata?.fileHash,
        requestId,
        explicitNamespace: metadata?.uploadNamespace,
        namespaceSeed,
      },
    });

    logger.info('LiveRC import file processed.', {
      event: 'liverc.importFile.success',
      outcome: 'success',
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
      logger.warn('LiveRC import file failed validation or processing.', {
        event: 'liverc.importFile.failure',
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
      logger.error('Database unavailable while persisting LiveRC import file.', {
        event: 'liverc.importFile.database_unavailable',
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

    logger.error('Unexpected error while ingesting LiveRC import file.', {
      event: 'liverc.importFile.unexpected_error',
      outcome: 'failure',
      error,
    });

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

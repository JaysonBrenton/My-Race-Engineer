import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveRcImportError, type LiveRcImportSummary } from '../src/core/app';
import { PrismaClientInitializationError } from '../src/core/infra/prisma/prismaClient';
import { liveRcImportService } from '../src/dependencies/liverc';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:memorydb?schema=public';
}

type ImportFromPayload = typeof liveRcImportService.importFromPayload;

type EnvOverrides = Partial<Record<keyof NodeJS.ProcessEnv, string | undefined>>;

type ImportFileRouteModule = typeof import('../src/app/api/liverc/import-file/route');

const importRouteModule = async (): Promise<ImportFileRouteModule> => {
  const specifier = `../src/app/api/liverc/import-file/route?cacheBust=${Date.now()}-${Math.random()}`;

  return import(specifier);
};

const withPatchedImport = async (
  stub: ImportFromPayload,
  run: () => Promise<void>,
) => {
  const original = liveRcImportService.importFromPayload.bind(liveRcImportService);

  Object.defineProperty(liveRcImportService, 'importFromPayload', {
    configurable: true,
    writable: true,
    value: stub,
  });

  try {
    await run();
  } finally {
    Object.defineProperty(liveRcImportService, 'importFromPayload', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
};

const withEnvironment = async (overrides: EnvOverrides, run: () => Promise<void>) => {
  const originalEntries = Object.entries(overrides).map(([key]) => [key, process.env[key]] as const);

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of originalEntries) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test('POST /api/liverc/import-file forwards payload metadata with deterministic namespace seed', async () => {
  const payload = { race: { id: 'race-123' } };
  const metadata = {
    fileName: 'LiveRC-Export.JSON',
    fileSizeBytes: 2048,
    lastModifiedEpochMs: 1_700_000_000_000,
    uploadedAtEpochMs: 1_700_000_005_000,
    fileHash: 'ABCDEF1234567890',
  };

  const requestId = 'Request-123';
  const expectedNamespaceSeed = [
    metadata.fileHash.toLowerCase(),
    `size-${metadata.fileSizeBytes}`,
    `modified-${metadata.lastModifiedEpochMs}`,
    `uploaded-${metadata.uploadedAtEpochMs}`,
    metadata.fileName.toLowerCase(),
    `req-${requestId.toLowerCase()}`,
  ].join('-');

  const summary: LiveRcImportSummary = {
    eventId: 'event-1',
    eventName: 'Test Event',
    raceClassId: 'class-1',
    raceClassName: 'Class 1',
    sessionId: 'session-1',
    sessionName: 'Session 1',
    raceId: 'race-1',
    roundId: 'round-1',
    entrantsProcessed: 10,
    lapsImported: 100,
    skippedLapCount: 5,
    skippedEntrantCount: 1,
    skippedOutlapCount: 0,
    sourceUrl: 'uploaded-file://Request-123',
    includeOutlaps: false,
  };

  await withEnvironment(
    { NODE_ENV: 'test', ENABLE_IMPORT_FILE: '1' },
    async () => {
      let receivedPayload: unknown;
      let receivedNamespaceSeed: string | undefined;

      await withPatchedImport(
        async (payloadArg, options) => {
          receivedPayload = payloadArg;
          receivedNamespaceSeed = options?.uploadMetadata?.namespaceSeed;

          assert.deepEqual(options?.uploadMetadata, {
            fileName: metadata.fileName,
            fileSizeBytes: metadata.fileSizeBytes,
            lastModifiedEpochMs: metadata.lastModifiedEpochMs,
            uploadedAtEpochMs: metadata.uploadedAtEpochMs,
            fileHash: metadata.fileHash,
            requestId,
            explicitNamespace: undefined,
            namespaceSeed: expectedNamespaceSeed,
          });

          return summary;
        },
        async () => {
          const { POST } = await importRouteModule();

          const request = new Request('http://localhost/api/liverc/import-file', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-request-id': requestId,
            },
            body: JSON.stringify({ payload, metadata }),
          });

          const response = await POST(request);

          assert.equal(response.status, 202);
          assert.equal(response.headers.get('x-request-id'), requestId);

          const body = (await response.json()) as Record<string, unknown>;
          assert.equal(body.requestId, requestId);
          assert.deepEqual(body.data, summary);
          assert.deepEqual(receivedPayload, payload);
          assert.equal(receivedNamespaceSeed, expectedNamespaceSeed);
        },
      );
    },
  );
});

test('POST /api/liverc/import-file returns 404 when feature flag disabled in production', async () => {
  await withEnvironment(
    { NODE_ENV: 'production', ENABLE_IMPORT_FILE: undefined },
    async () => {
      const { POST } = await importRouteModule();

      const request = new Request('http://localhost/api/liverc/import-file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: {} }),
      });

      const response = await POST(request);
      assert.equal(response.status, 404);
    },
  );
});

test('GET /api/liverc/import-file returns 405 with error envelope when enabled', async () => {
  const requestId = 'req-get-1';

  await withEnvironment(
    { NODE_ENV: 'test', ENABLE_IMPORT_FILE: '1' },
    async () => {
      const { GET } = await importRouteModule();

      const request = new Request('http://localhost/api/liverc/import-file', {
        method: 'GET',
        headers: { 'x-request-id': requestId },
      });

      const response = await GET(request);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-request-id'), requestId);

      const payload = (await response.json()) as Record<string, unknown>;
      assert.deepEqual(payload.error, {
        code: 'METHOD_NOT_ALLOWED',
        message: 'LiveRC import file upload only supports POST.',
      });
      assert.equal(payload.requestId, requestId);
    },
  );
});

test('POST /api/liverc/import-file surfaces LiveRcImportError responses', async () => {
  const error = new LiveRcImportError('Invalid LiveRC payload.', {
    status: 422,
    code: 'INVALID_LIVERC_PAYLOAD',
    details: { field: 'payload' },
  });

  await withEnvironment(
    { NODE_ENV: 'test', ENABLE_IMPORT_FILE: '1' },
    async () => {
      await withPatchedImport(
        async () => {
          throw error;
        },
        async () => {
          const { POST } = await importRouteModule();

          const request = new Request('http://localhost/api/liverc/import-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-request-id': 'req-error' },
            body: JSON.stringify({ payload: {} }),
          });

          const response = await POST(request);
          const payload = (await response.json()) as Record<string, unknown>;

          assert.equal(response.status, 422);
          assert.deepEqual(payload.error, {
            code: 'INVALID_LIVERC_PAYLOAD',
            message: 'Invalid LiveRC payload.',
            details: { field: 'payload' },
          });
          assert.equal(payload.requestId, 'req-error');
        },
      );
    },
  );
});

test('POST /api/liverc/import-file maps Prisma availability errors to 503', async () => {
  await withEnvironment(
    { NODE_ENV: 'test', ENABLE_IMPORT_FILE: '1' },
    async () => {
      await withPatchedImport(
        async () => {
          throw new PrismaClientInitializationError('Failed to connect to database.');
        },
        async () => {
          const { POST } = await importRouteModule();

          const request = new Request('http://localhost/api/liverc/import-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-request-id': 'req-db' },
            body: JSON.stringify({ payload: { sample: true } }),
          });

          const response = await POST(request);
          const payload = (await response.json()) as Record<string, unknown>;

          assert.equal(response.status, 503);
          assert.deepEqual(payload.error, {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database is not available to store LiveRC data.',
          });
          assert.equal(payload.requestId, 'req-db');
        },
      );
    },
  );
});

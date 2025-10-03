import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { LiveRcHttpError } from '../src/core/infra/http/liveRcClient';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:memorydb?schema=public';
}

import { POST } from '../src/app/api/liverc/import/route';
import { liveRcImportService } from '../src/dependencies/liverc';

type ImportFromUrl = typeof liveRcImportService.importFromUrl;

const withPatchedImport = async (
  stub: ImportFromUrl,
  run: () => Promise<void>,
) => {
  const original = liveRcImportService.importFromUrl.bind(liveRcImportService);

  Object.defineProperty(liveRcImportService, 'importFromUrl', {
    configurable: true,
    writable: true,
    value: stub,
  });

  try {
    await run();
  } finally {
    Object.defineProperty(liveRcImportService, 'importFromUrl', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
};

test('POST /api/liverc/import propagates LiveRC 404 responses', async () => {
  await withPatchedImport(async () => {
    throw new LiveRcHttpError('LiveRC resource missing.', {
      status: 404,
      code: 'ENTRY_LIST_FETCH_FAILED',
      details: { url: 'https://liverc.com/results/missing.json' },
    });
  }, async () => {
    const request = new Request('http://localhost/api/liverc/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-404',
      },
      body: JSON.stringify({
        url: 'https://liverc.com/results/missing',
        includeOutlaps: false,
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 404);
    assert.deepEqual(payload.error, {
      code: 'ENTRY_LIST_FETCH_FAILED',
      message: 'LiveRC resource missing.',
      details: { url: 'https://liverc.com/results/missing.json' },
    });
    assert.equal(payload.requestId, 'test-404');
  });
});

test('POST /api/liverc/import propagates LiveRC 500 responses', async () => {
  await withPatchedImport(async () => {
    throw new LiveRcHttpError('LiveRC returned a server error.', {
      status: 500,
      code: 'RACE_RESULT_FETCH_FAILED',
      details: { attempt: 1 },
    });
  }, async () => {
    const request = new Request('http://localhost/api/liverc/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-500',
      },
      body: JSON.stringify({
        url: 'https://liverc.com/results/server-error',
        includeOutlaps: true,
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 500);
    assert.deepEqual(payload.error, {
      code: 'RACE_RESULT_FETCH_FAILED',
      message: 'LiveRC returned a server error.',
      details: { attempt: 1 },
    });
    assert.equal(payload.requestId, 'test-500');
  });
});

test('sample LiveRC fixtures are loadable', async () => {
  const entryListFixture = new URL(
    '../fixtures/liverc/results/sample-event/sample-class/entry-list.json',
    import.meta.url,
  );
  const raceResultFixture = new URL(
    '../fixtures/liverc/results/sample-event/sample-class/race-result.json',
    import.meta.url,
  );

  const [entryListContents, raceResultContents] = await Promise.all([
    readFile(entryListFixture, 'utf-8'),
    readFile(raceResultFixture, 'utf-8'),
  ]);

  assert.doesNotThrow(() => {
    JSON.parse(entryListContents);
  });
  assert.doesNotThrow(() => {
    JSON.parse(raceResultContents);
  });
});

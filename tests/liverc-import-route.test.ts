import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import './helpers/test-env';
import { LiveRcHttpError } from '../src/core/infra/http/liveRcClient';

import { POST } from '../src/app/api/liverc/import/route';
import { liveRcImportService } from '../src/dependencies/liverc';
import { validateSessionTokenService } from '../src/dependencies/auth';
import { generateAuthFormToken } from '../src/lib/auth/formTokens';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants';
import { IMPORT_FORM_TOKEN_HEADER } from '../src/lib/liverc/importAuth';

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

const ensureSessionSecret = () => {
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = '12345678901234567890123456789012';
  }
};

const AUTH_COOKIE = `${SESSION_COOKIE_NAME}=session-token`;

const withAuthenticatedSession = async (run: () => Promise<void>) => {
  ensureSessionSecret();
  const originalValidate = validateSessionTokenService.validate;

  Object.defineProperty(validateSessionTokenService, 'validate', {
    configurable: true,
    writable: true,
    value: async () => ({ ok: true, user: {} as any, session: {} as any }),
  });

  try {
    await run();
  } finally {
    Object.defineProperty(validateSessionTokenService, 'validate', {
      configurable: true,
      writable: true,
      value: originalValidate,
    });
  }
};

const buildAuthHeaders = (overrides: Record<string, string> = {}) => ({
  ...overrides,
  cookie: AUTH_COOKIE,
  [IMPORT_FORM_TOKEN_HEADER]: generateAuthFormToken('liverc-import'),
});

test('POST /api/liverc/import propagates LiveRC 404 responses', async () => {
  await withAuthenticatedSession(async () => {
    await withPatchedImport(async () => {
      throw new LiveRcHttpError('LiveRC resource missing.', {
        status: 404,
        code: 'ENTRY_LIST_FETCH_FAILED',
        details: { url: 'https://liverc.com/results/missing.json' },
      });
    }, async () => {
      const request = new Request('http://localhost/api/liverc/import', {
        method: 'POST',
        headers: buildAuthHeaders({
          'content-type': 'application/json',
          'x-request-id': 'test-404',
        }),
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
});

test('POST /api/liverc/import propagates LiveRC 500 responses', async () => {
  await withAuthenticatedSession(async () => {
    await withPatchedImport(async () => {
      throw new LiveRcHttpError('LiveRC returned a server error.', {
        status: 500,
        code: 'RACE_RESULT_FETCH_FAILED',
        details: { attempt: 1 },
      });
    }, async () => {
      const request = new Request('http://localhost/api/liverc/import', {
        method: 'POST',
        headers: buildAuthHeaders({
          'content-type': 'application/json',
          'x-request-id': 'test-500',
        }),
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
});

test('POST /api/liverc/import rejects requests without a session cookie', async () => {
  const request = new Request('http://localhost/api/liverc/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://liverc.com/results/event',
      includeOutlaps: false,
    }),
  });

  const response = await POST(request);
  const payload = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 401);
  assert.equal((payload.error as { code: string }).code, 'UNAUTHENTICATED');
});

test('POST /api/liverc/import rejects requests missing the import token', async () => {
  await withAuthenticatedSession(async () => {
    const request = new Request('http://localhost/api/liverc/import', {
      method: 'POST',
      headers: {
        cookie: AUTH_COOKIE,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://liverc.com/results/missing-token',
        includeOutlaps: false,
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 403);
    assert.equal((payload.error as { code: string }).code, 'INVALID_FORM_TOKEN');
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

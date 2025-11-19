/**
 * Project: My Race Engineer
 * File: tests/web-vitals.test.ts
 * Summary: Route tests covering the web-vitals endpoint validation paths.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextRequest } from 'next/server';

import { POST } from '../src/app/api/web-vitals/route';

const endpoint = 'http://localhost/api/web-vitals';

const toNextRequest = (payload: string | Record<string, unknown>): NextRequest =>
  // Cast to NextRequest because these tests only rely on the underlying Fetch API interface.
  new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  }) as unknown as NextRequest;

void test('POST /api/web-vitals accepts a valid payload', async () => {
  const payload = {
    id: 'v1',
    name: 'CLS',
    label: 'web-vital',
    value: 0.1,
    page: '/homepage',
    timestamp: Date.now(),
  };

  const response = await POST(toNextRequest(payload));

  assert.equal(response.status, 204);
});

void test('POST /api/web-vitals rejects invalid JSON', async () => {
  const response = await POST(toNextRequest('{'));

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, 'Invalid JSON body.');
});

void test('POST /api/web-vitals rejects payloads missing required fields', async () => {
  const response = await POST(
    toNextRequest({
      name: 'CLS',
      label: 'web-vital',
      value: 0.2,
      page: '/homepage',
      timestamp: Date.now(),
    }),
  );

  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: string; details: string[] };
  assert.equal(body.error, 'Invalid payload.');
  assert.ok(Array.isArray(body.details));
  assert.ok(body.details.some((message: string) => message.includes('id')));
});

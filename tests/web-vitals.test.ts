import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../src/app/api/web-vitals/route';

const endpoint = 'http://localhost/api/web-vitals';

test('POST /api/web-vitals accepts a valid payload', async () => {
  const payload = {
    id: 'v1',
    name: 'CLS',
    label: 'web-vital',
    value: 0.1,
    page: '/homepage',
    timestamp: Date.now(),
  };

  const response = await POST(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );

  assert.equal(response.status, 204);
});

test('POST /api/web-vitals rejects invalid JSON', async () => {
  const response = await POST(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Invalid JSON body.');
});

test('POST /api/web-vitals rejects payloads missing required fields', async () => {
  const response = await POST(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'CLS',
        label: 'web-vital',
        value: 0.2,
        page: '/homepage',
        timestamp: Date.now(),
      }),
    }),
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, 'Invalid payload.');
  assert.ok(Array.isArray(body.details));
  assert.ok(body.details.some((message: string) => message.includes('id')));
});

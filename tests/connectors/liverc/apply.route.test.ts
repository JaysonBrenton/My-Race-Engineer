/**
 * Project: My Race Engineer
 * File: tests/connectors/liverc/apply.route.test.ts
 * Summary: Tests for applying LiveRC event plans via the connector route.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { POST, OPTIONS } from '../../../src/app/api/connectors/liverc/import/apply/route';
import { liveRcImportJobQueue, liveRcImportPlanService } from '../../../src/dependencies/liverc';
import { liveRcImportPlanStore } from '../../../src/app/api/connectors/liverc/import/planStore';

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/connectors/liverc/import/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---------------------------------------------------------------

void test('OPTIONS returns Allow header', async () => {
  const optionsHandler = OPTIONS;
  if (!optionsHandler) {
    throw new Error('OPTIONS handler missing for apply route');
  }
  const res = await optionsHandler(
    new Request('http://localhost/api/connectors/liverc/import/apply', {
      method: 'OPTIONS',
    }),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

void test('POST rejects missing planId', async () => {
  const res = await POST(makeRequest({}));
  assert.ok(res.status === 400 || res.status === 422);
});

void test('POST happy path returns 202 with jobId (and optional Location)', async () => {
  const planId = 'plan_test_123';
  const plan = {
    planId,
    generatedAt: new Date().toISOString(),
    items: [
      {
        eventRef: 'https://live.liverc.com/events/event-abc',
        status: 'NEW',
        counts: { sessions: 2, drivers: 24, estimatedLaps: 480 },
      },
    ],
  };

  const jobQueue = liveRcImportJobQueue as unknown as {
    enqueueJob: (payload: unknown) => Promise<{ jobId: string }>;
  };
  const planService = liveRcImportPlanService as unknown as {
    createPlan: (payload: unknown) => Promise<typeof plan>;
  };
  const planStore = liveRcImportPlanStore as unknown as {
    get: (id: string) => Promise<{
      planId: string;
      plan: typeof plan;
      request: { events: { eventRef: string }[] };
    } | null>;
  };

  const originalEnqueue = jobQueue.enqueueJob.bind(jobQueue);
  const originalCreatePlan = planService.createPlan.bind(planService);
  const originalGet = planStore.get.bind(planStore);
  jobQueue.enqueueJob = () => Promise.resolve({ jobId: 'job_test_123' });
  planService.createPlan = () => Promise.resolve(plan);
  planStore.get = (id: string) =>
    Promise.resolve(
      id === planId
        ? {
            planId,
            plan,
            request: { events: [{ eventRef: plan.items[0].eventRef }] },
          }
        : null,
    );

  try {
    const res = await POST(makeRequest({ planId }));
    assert.equal(res.status, 202);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');

    const location = res.headers.get('Location');
    if (location) {
      assert.ok(/^https?:\/\//.test(location) || location.startsWith('/'));
    }

    const payload = (await res.json()) as { data?: { jobId?: string } };
    assert.ok(payload.data?.jobId);
  } finally {
    jobQueue.enqueueJob = originalEnqueue;
    planService.createPlan = originalCreatePlan;
    planStore.get = originalGet;
  }
});

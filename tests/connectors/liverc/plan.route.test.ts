import assert from 'node:assert/strict';
import test from 'node:test';

import { POST, OPTIONS } from '../../../src/app/api/connectors/liverc/import/plan/route';
import { liveRcImportPlanService } from '../../../src/dependencies/liverc';
import { liveRcImportPlanStore } from '../../../src/app/api/connectors/liverc/import/planStore';

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/connectors/liverc/import/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---------------------------------------------------------------

void test('OPTIONS returns Allow header', async () => {
  const optionsHandler = OPTIONS;
  if (!optionsHandler) {
    throw new Error('OPTIONS handler missing for plan route');
  }
  const res = await optionsHandler(
    new Request('http://localhost/api/connectors/liverc/import/plan', {
      method: 'OPTIONS',
    }),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

void test('POST rejects missing events', async () => {
  const res = await POST(makeRequest({ events: [] }));
  assert.equal(res.status, 400);
});

type PlanItem = {
  eventRef: string;
  status: 'NEW' | 'PARTIAL' | 'EXISTING';
  counts: { sessions: number; drivers: number; estimatedLaps: number };
};

type PlanPayload = {
  data?: { planId: string; items: PlanItem[] };
};

void test('POST happy path returns planId and items', async () => {
  const plan = {
    planId: 'plan_test_123',
    generatedAt: new Date().toISOString(),
    items: [
      {
        eventRef: 'https://www.liverc.com/events/event-abc',
        status: 'NEW',
        counts: { sessions: 2, drivers: 24, estimatedLaps: 480 },
      },
    ],
  } satisfies { planId: string; generatedAt: string; items: PlanItem[] };

  const service = liveRcImportPlanService as unknown as {
    createPlan: (request: { events: { eventRef: string }[] }) => Promise<typeof plan>;
  };
  const planStore = liveRcImportPlanStore as unknown as {
    save: (entry: { planId: string; request: unknown; plan: typeof plan }) => Promise<void>;
  };

  const originalCreatePlan = service.createPlan.bind(service);
  const originalSave = planStore.save.bind(planStore);
  service.createPlan = () => Promise.resolve(plan);
  planStore.save = () => Promise.resolve();

  try {
    const res = await POST(
      makeRequest({ events: [{ eventRef: 'https://www.liverc.com/events/event-abc' }] }),
    );
    assert.ok(res.status === 200 || res.status === 201);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');

    const payload = (await res.json()) as PlanPayload;
    assert.ok(payload.data?.planId);
    assert.ok(Array.isArray(payload.data?.items));
  } finally {
    service.createPlan = originalCreatePlan;
    planStore.save = originalSave;
  }
});

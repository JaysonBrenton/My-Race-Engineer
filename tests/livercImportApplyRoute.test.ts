import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImportApplyRouteHandlers,
  MAX_EVENTS_PER_PLAN,
  MAX_TOTAL_ESTIMATED_LAPS,
} from '../src/app/api/connectors/liverc/import/apply/handlers';
import type { ImportApplyRouteDependencies } from '../src/app/api/connectors/liverc/import/apply/handlers';
import type { LiveRcImportPlan, LiveRcImportPlanRequest, Logger, LoggerContext, LogLevel } from '../src/core/app';
import type { LiveRcImportPlanStore, StoredImportPlan } from '../src/app/api/connectors/liverc/import/planStore';
import { liveRcImportJobQueue } from '../src/dependencies/liverc';

liveRcImportJobQueue.stop();

type CapturedLog = {
  level: LogLevel;
  message: string;
  context?: LoggerContext;
};

type StubLogger = {
  logger: Logger;
  logs: CapturedLog[];
  contexts: LoggerContext[];
};

const createStubLogger = (): StubLogger => {
  const logs: CapturedLog[] = [];
  const contexts: LoggerContext[] = [];

  const build = (baseContext: LoggerContext = {}): Logger => ({
    debug(message, context) {
      logs.push({ level: 'debug', message, context: { ...baseContext, ...(context ?? {}) } });
    },
    info(message, context) {
      logs.push({ level: 'info', message, context: { ...baseContext, ...(context ?? {}) } });
    },
    warn(message, context) {
      logs.push({ level: 'warn', message, context: { ...baseContext, ...(context ?? {}) } });
    },
    error(message, context) {
      logs.push({ level: 'error', message, context: { ...baseContext, ...(context ?? {}) } });
    },
    withContext(context) {
      contexts.push(context);
      return build({ ...baseContext, ...context });
    },
  });

  return { logger: build(), logs, contexts };
};

type StubPlanStore = {
  store: LiveRcImportPlanStore;
  saved: StoredImportPlan[];
  setPlan(planId: string, entry: Omit<StoredImportPlan, 'planId'> & { planId?: string }): void;
};

const createStubPlanStore = (): StubPlanStore => {
  const saved: StoredImportPlan[] = [];
  const entries = new Map<string, StoredImportPlan>();

  const store: LiveRcImportPlanStore = {
    async save(entry) {
      saved.push(entry);
      entries.set(entry.planId, entry);
    },
    async get(planId) {
      return entries.get(planId) ?? null;
    },
  };

  return {
    store,
    saved,
    setPlan(planId, entry) {
      entries.set(planId, { planId, request: entry.request, plan: entry.plan });
    },
  };
};

test('POST /api/connectors/liverc/import/apply enqueues job when guardrails pass', async () => {
  const stubLogger = createStubLogger();
  const stubPlanStore = createStubPlanStore();

  const plan: LiveRcImportPlan = {
    planId: 'plan-apply-1',
    generatedAt: new Date().toISOString(),
    items: [
      { eventRef: 'event-1', status: 'NEW', counts: { sessions: 2, drivers: 10, estimatedLaps: 320 } },
      { eventRef: 'event-2', status: 'PARTIAL', counts: { sessions: 3, drivers: 14, estimatedLaps: 450 } },
    ],
  };

  stubPlanStore.setPlan('plan-apply-1', { request: { events: [{ eventRef: 'event-1' }, { eventRef: 'event-2' }] }, plan });

  const enqueueCalls: { planId: string; items: { eventRef: string; counts?: unknown }[] }[] = [];

  const dependencies: ImportApplyRouteDependencies = {
    logger: stubLogger.logger,
    planStore: stubPlanStore.store,
    jobQueue: {
      async enqueueJob(planId, items) {
        enqueueCalls.push({ planId, items });
        return { jobId: 'job-789' };
      },
    },
  };

  const handlers = createImportApplyRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/apply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-apply-success',
    },
    body: JSON.stringify({ planId: 'plan-apply-1' }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('x-request-id'), 'req-apply-success');
  assert.equal(response.headers.get('location'), '/api/connectors/liverc/jobs/job-789');

  const payload = await response.json();
  assert.deepEqual(payload, { data: { jobId: 'job-789' }, requestId: 'req-apply-success' });

  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0]?.planId, 'plan-apply-1');
  assert.deepEqual(
    enqueueCalls[0]?.items,
    plan.items.map((item): { eventRef: string; counts?: unknown } => ({
      eventRef: item.eventRef,
      counts: item.counts,
    })),
  );

  const successLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importApply.success');
  assert.ok(successLog, 'expected success log');
  assert.equal(successLog?.context?.jobId, 'job-789');
});

test('POST /api/connectors/liverc/import/apply rejects plans that exceed guardrails', async () => {
  const stubLogger = createStubLogger();
  const stubPlanStore = createStubPlanStore();

  const overflowingPlan: LiveRcImportPlan = {
    planId: 'plan-big',
    generatedAt: new Date().toISOString(),
    items: Array.from({ length: MAX_EVENTS_PER_PLAN + 1 }, (_, index) => ({
      eventRef: `event-${index + 1}`,
      status: 'NEW',
      counts: { sessions: 1, drivers: 12, estimatedLaps: MAX_TOTAL_ESTIMATED_LAPS / MAX_EVENTS_PER_PLAN },
    })),
  };

  stubPlanStore.setPlan('plan-big', {
    request: {
      events: overflowingPlan.items.map((item): { eventRef: string } => ({ eventRef: item.eventRef })),
    },
    plan: overflowingPlan,
  });

  const dependencies: ImportApplyRouteDependencies = {
    logger: stubLogger.logger,
    planStore: stubPlanStore.store,
    jobQueue: {
      async enqueueJob() {
        assert.fail('enqueueJob should not be called when guardrails fail');
      },
    },
  };

  const handlers = createImportApplyRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'plan-big' }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.equal(payload.error.code, 'PLAN_GUARDRAILS_EXCEEDED');
  assert.equal(payload.error.details.limits.maxEvents, MAX_EVENTS_PER_PLAN);
  assert.equal(payload.error.details.limits.maxEstimatedLaps, MAX_TOTAL_ESTIMATED_LAPS);
  assert.equal(payload.error.details.suggestions.chunkCount, 2);
  assert.equal(payload.error.details.suggestions.trimEvents, 1);
  assert.equal(payload.error.details.suggestions.trimEstimatedLaps, 4000);
  assert.match(payload.error.message, /split the plan into 2 apply jobs/i);

  const guardrailLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importApply.guardrails_exceeded');
  assert.ok(guardrailLog, 'expected guardrail log');
});

test('POST /api/connectors/liverc/import/apply returns 404 when plan is missing', async () => {
  const stubLogger = createStubLogger();
  const dependencies: ImportApplyRouteDependencies = {
    logger: stubLogger.logger,
    planStore: {
      async save() {
        // no-op
      },
      async get() {
        return null;
      },
    },
    jobQueue: {
      async enqueueJob() {
        assert.fail('enqueueJob should not be called when plan is missing');
      },
    },
  };

  const handlers = createImportApplyRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'missing-plan' }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 404);

  const payload = await response.json();
  assert.equal(payload.error.code, 'PLAN_NOT_FOUND');

  const notFoundLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importApply.plan_not_found');
  assert.ok(notFoundLog, 'expected plan missing log');
});

test('POST /api/connectors/liverc/import/apply recomputes plan when only request is stored', async () => {
  const stubLogger = createStubLogger();
  const stubPlanStore = createStubPlanStore();

  const planRequest: LiveRcImportPlanRequest = {
    events: [{ eventRef: 'event-recompute' }],
  };

  stubPlanStore.setPlan('plan-recompute', { request: planRequest, plan: undefined });

  let recomputeCalled = 0;
  const planFromService: LiveRcImportPlan = {
    planId: 'fresh-plan-id',
    generatedAt: new Date().toISOString(),
    items: [
      {
        eventRef: 'event-recompute',
        status: 'NEW',
        counts: { sessions: 2, drivers: 8, estimatedLaps: 200 },
      },
    ],
  };

  const dependencies: ImportApplyRouteDependencies = {
    logger: stubLogger.logger,
    planStore: stubPlanStore.store,
    planService: {
      async createPlan(request) {
        recomputeCalled += 1;
        assert.deepEqual(request, planRequest);
        return planFromService;
      },
    },
    jobQueue: {
      async enqueueJob(planId, items) {
        assert.equal(planId, 'plan-recompute');
        assert.equal(items.length, 1);
        return { jobId: 'job-recompute' };
      },
    },
  };

  const handlers = createImportApplyRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'plan-recompute' }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.data.jobId, 'job-recompute');
  assert.equal(recomputeCalled, 1);

  assert.ok(stubPlanStore.saved.length > 0);
  const lastSaved = stubPlanStore.saved.at(-1);
  assert.equal(lastSaved?.planId, 'plan-recompute');
  assert.equal(lastSaved?.plan?.planId, 'plan-recompute');
});

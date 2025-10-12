import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveRcClientError } from '../src/core/app/connectors/liverc/client';
import { createImportPlanRouteHandlers } from '../src/app/api/connectors/liverc/import/plan/handlers';
import type { ImportPlanRouteDependencies } from '../src/app/api/connectors/liverc/import/plan/handlers';
import type { LiveRcImportPlanStore, StoredImportPlan } from '../src/app/api/connectors/liverc/import/planStore';
import { liveRcImportJobQueue } from '../src/dependencies/liverc';

liveRcImportJobQueue.stop();
import type { Logger, LoggerContext, LogLevel, LiveRcImportPlan } from '../src/core/app';

type CapturedLog = {
  level: LogLevel;
  message: string;
  context?: LoggerContext;
};

type StubLogger = {
  logger: Logger;
  logs: CapturedLog[];
  contexts: LoggerContext[];
  children: Logger[];
};

const createStubLogger = (): StubLogger => {
  const logs: CapturedLog[] = [];
  const contexts: LoggerContext[] = [];
  const children: Logger[] = [];

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
      const child = build({ ...baseContext, ...context });
      children.push(child);
      return child;
    },
  });

  return { logger: build(), logs, contexts, children };
};

const createStubPlanStore = () => {
  const saved: StoredImportPlan[] = [];

  const store: LiveRcImportPlanStore = {
    async save(entry) {
      saved.push(entry);
    },
    async get() {
      return null;
    },
  };

  return { store, saved };
};

test('POST /api/connectors/liverc/import/plan returns plan data and logs success', async () => {
  const stubLogger = createStubLogger();
  const plan: LiveRcImportPlan = {
    planId: 'plan-123',
    generatedAt: new Date().toISOString(),
    items: [
      {
        eventRef: 'sample-event',
        status: 'NEW',
        counts: { sessions: 3, drivers: 18, estimatedLaps: 540 },
      },
    ],
  };

  const { store, saved } = createStubPlanStore();

  const dependencies: ImportPlanRouteDependencies = {
    service: {
      async createPlan(request) {
        assert.deepEqual(request, { events: [{ eventRef: 'sample-event' }] });
        return plan;
      },
    },
    logger: stubLogger.logger,
    planStore: store,
  };

  const handlers = createImportPlanRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-plan-test',
    },
    body: JSON.stringify({ events: [{ eventRef: 'sample-event' }] }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'req-plan-test');

  const payload = await response.json();
  assert.deepEqual(payload, { data: plan, requestId: 'req-plan-test' });

  assert.deepEqual(stubLogger.contexts[0], {
    requestId: 'req-plan-test',
    route: '/api/connectors/liverc/import/plan',
  });

  const successLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importPlan.success');
  assert.ok(successLog, 'expected success log');
  assert.equal(successLog?.context?.planId, 'plan-123');
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.planId, 'plan-123');
  assert.deepEqual(saved[0]?.plan, plan);
  assert.deepEqual(saved[0]?.request, { events: [{ eventRef: 'sample-event' }] });
});

test('POST /api/connectors/liverc/import/plan validates payloads', async () => {
  const stubLogger = createStubLogger();
  const { store } = createStubPlanStore();
  const handlers = createImportPlanRouteHandlers({ logger: stubLogger.logger, planStore: store });

  const request = new Request('http://localhost/api/connectors/liverc/import/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [] }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.equal(payload.error.code, 'INVALID_REQUEST');
  assert.ok(Array.isArray(payload.error.details.issues));

  const invalidLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importPlan.invalid_request');
  assert.ok(invalidLog, 'expected validation log');
});

test('POST /api/connectors/liverc/import/plan maps LiveRC client failures', async () => {
  const stubLogger = createStubLogger();
  const { store } = createStubPlanStore();

  const dependencies: ImportPlanRouteDependencies = {
    service: {
      async createPlan() {
        throw new LiveRcClientError('Upstream error', {
          code: 'HTTP_404',
          status: 404,
          url: 'https://liverc.com/results/missing-event',
          details: { statusText: 'Not Found' },
        });
      },
    },
    logger: stubLogger.logger,
    planStore: store,
  };

  const handlers = createImportPlanRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/connectors/liverc/import/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [{ eventRef: 'missing-event' }] }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 404);

  const payload = await response.json();
  assert.equal(payload.error.code, 'HTTP_404');
  assert.equal(payload.error.details.url, 'https://liverc.com/results/missing-event');

  const failureLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.importPlan.upstream_failure');
  assert.ok(failureLog, 'expected upstream failure log');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createImportRouteHandlers } from '../src/app/api/liverc/import/handlers';
import type { ImportRouteDependencies } from '../src/app/api/liverc/import/handlers';
import type { Logger, LoggerContext, LogLevel } from '../src/core/app';

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

test('LiveRC import route attaches request context to logs', async () => {
  const stubLogger = createStubLogger();
  const summary = {
    eventId: 'event-1',
    eventName: 'Event',
    raceClassId: 'class-1',
    raceClassName: 'Class',
    sessionId: 'session-1',
    sessionName: 'Session',
    raceId: 'race-1',
    roundId: 'round-1',
    entrantsProcessed: 1,
    lapsImported: 10,
    skippedLapCount: 0,
    skippedEntrantCount: 0,
    skippedOutlapCount: 0,
    sourceUrl: 'https://liverc.com/results/event/class/round/race.json',
    includeOutlaps: false,
  };

  let receivedLogger: Logger | undefined;

  const dependencies: ImportRouteDependencies = {
    service: {
      async importFromUrl(url, options) {
        receivedLogger = options?.logger;
        assert.equal(url, 'https://liverc.com/results/event/class/round/race.json');
        return summary;
      },
    },
    logger: stubLogger.logger,
  };

  const handlers = createImportRouteHandlers(dependencies);
  const request = new Request('http://localhost/api/liverc/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-test',
    },
    body: JSON.stringify({ url: summary.sourceUrl }),
  });

  const response = await handlers.POST(request);
  assert.equal(response.status, 202);

  const payload = await response.json();
  assert.equal(payload.requestId, 'req-test');
  assert.equal(response.headers.get('x-request-id'), 'req-test');

  assert.deepEqual(stubLogger.contexts[0], { requestId: 'req-test', route: '/api/liverc/import' });
  assert.strictEqual(receivedLogger, stubLogger.children[0]);

  const successLog = stubLogger.logs.find((log) => log.context?.event === 'liverc.import.success');
  assert.ok(successLog, 'expected success log');
  assert.equal(successLog?.context?.requestId, 'req-test');
  assert.equal(successLog?.context?.route, '/api/liverc/import');
});

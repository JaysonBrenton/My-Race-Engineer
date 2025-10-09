import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createPinoLogger } from './pinoLogger';

type LogEntry = Record<string, unknown>;

const createTempDir = async () => mkdtemp(path.join(tmpdir(), 'pino-logger-test-'));

const waitForLogFile = async (filePath: string) => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await access(filePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await delay(100);
  }

  throw new Error(`Log file was not created: ${filePath}`);
};

const readLastLogEntry = async (filePath: string): Promise<LogEntry> => {
  await waitForLogFile(filePath);
  const contents = await readFile(filePath, 'utf8');
  const lines = contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastLine = lines.at(-1);
  if (!lastLine) {
    throw new Error(`No log entries found for ${filePath}`);
  }

  return JSON.parse(lastLine) as LogEntry;
};

const expectString = (entry: LogEntry, key: string) => {
  const value = entry[key];
  assert.equal(typeof value, 'string', `Expected ${key} to be a string`);
  return value as string;
};

const expectTimestamp = (entry: LogEntry) => {
  const timestamp = expectString(entry, 'timestamp');
  assert.match(
    timestamp,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} (UTC|[+-]\d{2}:\d{2})$/u,
    'Expected timestamp to be in human readable format.',
  );
  return timestamp;
};

const expectNumber = (entry: LogEntry, key: string) => {
  const value = entry[key];
  assert.equal(typeof value, 'number', `Expected ${key} to be a number`);
  return value as number;
};

const expectRecord = (entry: LogEntry, key: string) => {
  const value = entry[key];
  assert.equal(typeof value, 'object', `Expected ${key} to be an object`);
  assert.ok(value !== null, `Expected ${key} to be non-null`);
  return value as LogEntry;
};

void test('writes structured log entries to app log', async (t) => {
  const logDir = await createTempDir();
  void t.after(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  const logger = createPinoLogger({
    level: 'debug',
    logDirectory: logDir,
  });

  logger.info('LiveRC import accepted.', {
    event: 'tests.logger.app_log',
    requestId: 'req-123',
    route: '/api/example',
    outcome: 'success',
  });

  await delay(400);

  const entry = await readLastLogEntry(path.join(logDir, 'app.log'));
  assert.equal(expectString(entry, 'event'), 'tests.logger.app_log');
  assert.equal(expectString(entry, 'requestId'), 'req-123');
  assert.equal(expectString(entry, 'route'), '/api/example');
  assert.equal(expectString(entry, 'outcome'), 'success');
  assert.equal(expectString(entry, 'msg'), 'LiveRC import accepted.');
  expectTimestamp(entry);
});

void test('serialises error metadata for error log file', async (t) => {
  const logDir = await createTempDir();
  void t.after(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  const logger = createPinoLogger({ logDirectory: logDir });
  const error = new Error('boom');
  error.cause = new Error('root-cause');

  logger.error('Unexpected failure.', {
    event: 'tests.logger.error_log',
    requestId: 'req-456',
    outcome: 'failure',
    error,
  });

  await delay(400);

  const appEntry = await readLastLogEntry(path.join(logDir, 'app.log'));
  assert.equal(expectString(appEntry, 'event'), 'tests.logger.error_log');
  const errorRecord = expectRecord(appEntry, 'error');
  assert.equal(expectString(errorRecord, 'name'), 'Error');
  assert.equal(expectString(errorRecord, 'message'), 'boom');
  expectString(errorRecord, 'stack');
  const causeRecord = expectRecord(errorRecord, 'cause');
  assert.equal(expectString(causeRecord, 'name'), 'Error');

  const errorEntry = await readLastLogEntry(path.join(logDir, 'error.log'));
  assert.equal(expectString(errorEntry, 'event'), 'tests.logger.error_log');
  assert.equal(expectNumber(errorEntry, 'level'), 50); // Pino error level
  expectTimestamp(errorEntry);
});

void test('inherits context with withContext()', async (t) => {
  const logDir = await createTempDir();
  void t.after(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  const logger = createPinoLogger({ logDirectory: logDir });
  const requestLogger = logger.withContext({
    requestId: 'req-789',
    route: '/api/context-test',
  });

  requestLogger.info('Child logger entry.', {
    event: 'tests.logger.child',
    outcome: 'success',
    durationMs: 42,
  });

  await delay(400);

  const entry = await readLastLogEntry(path.join(logDir, 'app.log'));
  assert.equal(expectString(entry, 'requestId'), 'req-789');
  assert.equal(expectString(entry, 'route'), '/api/context-test');
  assert.equal(expectNumber(entry, 'durationMs'), 42);
  assert.equal(expectString(entry, 'event'), 'tests.logger.child');
  expectTimestamp(entry);
});

void test('writes to custom file name prefixes when provided', async (t) => {
  const logDir = await createTempDir();
  void t.after(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  const logger = createPinoLogger({
    logDirectory: logDir,
    fileNamePrefix: 'auth-login',
    disableConsoleLogs: true,
  });

  logger.info('Auth login flow start.', {
    event: 'tests.logger.custom_prefix',
    route: '/auth/login',
  });

  await delay(400);

  const entry = await readLastLogEntry(path.join(logDir, 'auth-login.log'));
  assert.equal(expectString(entry, 'event'), 'tests.logger.custom_prefix');
  assert.equal(expectString(entry, 'route'), '/auth/login');
  expectTimestamp(entry);

  logger.warn('Auth login anomaly detected.', {
    event: 'tests.logger.custom_prefix_warn',
    route: '/auth/login',
  });

  await delay(400);

  const warnEntry = await readLastLogEntry(path.join(logDir, 'auth-login-error.log'));
  assert.equal(expectString(warnEntry, 'event'), 'tests.logger.custom_prefix_warn');
  expectTimestamp(warnEntry);
});

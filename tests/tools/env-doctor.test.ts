import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runDoctor } from '../../tools/env-doctor';

const KEY_ORDER = [
  'APP_URL',
  'NEXT_PUBLIC_APP_ORIGIN',
  'ALLOWED_ORIGINS',
  'SESSION_SECRET',
  'COOKIE_SECURE_STRATEGY',
  'TRUST_PROXY',
  'TRACING_ENABLED',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_SERVICE_NAME',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'INGEST_RATE_LIMIT_WINDOW_MS',
  'INGEST_RATE_LIMIT_MAX_REQUESTS',
  'MAILER_DRIVER',
  'SMTP_URL',
  'MAIL_FROM_EMAIL',
  'MAIL_FROM_NAME',
  'ENABLE_IMPORT_WIZARD',
  'ENABLE_LIVERC_RESOLVER',
  'ENABLE_IMPORT_FILE',
  'ENABLE_LIVERC_FIXTURE_PROXY',
  'LIVERC_HTTP_BASE',
];

const baseExampleValues: Record<string, string> = {
  APP_URL: 'https://app.example.com',
  NEXT_PUBLIC_APP_ORIGIN: '',
  ALLOWED_ORIGINS: 'https://app.example.com',
  SESSION_SECRET: '<example-session-secret>',
  COOKIE_SECURE_STRATEGY: 'auto',
  TRUST_PROXY: 'false',
  TRACING_ENABLED: 'false',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
  OTEL_SERVICE_NAME: 'my-race-engineer',
  OTEL_EXPORTER_OTLP_HEADERS: '',
  INGEST_RATE_LIMIT_WINDOW_MS: '',
  INGEST_RATE_LIMIT_MAX_REQUESTS: '',
  MAILER_DRIVER: 'console',
  SMTP_URL: 'smtp://user:pass@smtp.example.com:587',
  MAIL_FROM_EMAIL: 'ops@example.com',
  MAIL_FROM_NAME: 'Ops Team',
  ENABLE_IMPORT_WIZARD: '1',
  ENABLE_LIVERC_RESOLVER: '0',
  ENABLE_IMPORT_FILE: '0',
  ENABLE_LIVERC_FIXTURE_PROXY: '0',
  LIVERC_HTTP_BASE: '',
};

const baseEnvValues: Record<string, string> = {
  APP_URL: 'https://app.example.com',
  NEXT_PUBLIC_APP_ORIGIN: 'https://app.example.com',
  ALLOWED_ORIGINS: 'https://app.example.com',
  SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyzABCDEF123456',
  COOKIE_SECURE_STRATEGY: 'auto',
  TRUST_PROXY: 'false',
  TRACING_ENABLED: 'false',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
  OTEL_SERVICE_NAME: 'my-race-engineer',
  OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=secret',
  INGEST_RATE_LIMIT_WINDOW_MS: '',
  INGEST_RATE_LIMIT_MAX_REQUESTS: '',
  MAILER_DRIVER: 'console',
  SMTP_URL: 'smtp://user:pass@smtp.example.com:587',
  MAIL_FROM_EMAIL: 'ops@example.com',
  MAIL_FROM_NAME: 'Ops Team',
  ENABLE_IMPORT_WIZARD: '0',
  ENABLE_LIVERC_RESOLVER: '0',
  ENABLE_IMPORT_FILE: '0',
  ENABLE_LIVERC_FIXTURE_PROXY: '0',
  LIVERC_HTTP_BASE: '',
};

test('passes with defaults when optional features disabled and surfaces applied defaults', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-default-'));

  await writeFile(join(cwd, '.env.example'), buildEnvFile(baseExampleValues), 'utf8');

  const envValues = {
    ...baseEnvValues,
    NEXT_PUBLIC_APP_ORIGIN: '',
    TRACING_ENABLED: '',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_EXPORTER_OTLP_HEADERS: '',
  } satisfies Record<string, string>;

  await writeFile(
    join(cwd, '.env'),
    buildEnvFile(envValues, {
      omit: ['MAILER_DRIVER'],
    }),
    'utf8',
  );

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctor({ cwd, json: true, output });
  assert.equal(result.exitCode, 0);

  const parsed = JSON.parse(printed.trim());
  assert.equal(parsed.isHealthy, true);
  assert.deepEqual(parsed.missingKeys, []);
  assert.equal(parsed.invalidKeys.length, 0);
  assert.deepEqual(
    parsed.appliedDefaults.sort(),
    ['MAILER_DRIVER=console', 'NEXT_PUBLIC_APP_ORIGIN=APP_URL', 'TRACING_ENABLED=false'],
  );
  assert.deepEqual(
    parsed.warnings.map((issue: { key: string }) => issue.key).sort(),
    ['MAILER_DRIVER', 'NEXT_PUBLIC_APP_ORIGIN', 'TRACING_ENABLED'],
  );
});

test('requires tracing exporters only when tracing is enabled', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-tracing-'));

  await writeFile(join(cwd, '.env.example'), buildEnvFile(baseExampleValues), 'utf8');

  const tracingEnabledValues = {
    ...baseEnvValues,
    TRACING_ENABLED: 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_EXPORTER_OTLP_HEADERS: '',
    MAILER_DRIVER: 'console',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(tracingEnabledValues), 'utf8');

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const failing = await runDoctor({ cwd, json: true, output });
  assert.equal(failing.exitCode, 1);

  const failingParsed = JSON.parse(printed.trim());
  assert.equal(failingParsed.isHealthy, false);
  assert.equal(failingParsed.invalidKeys[0]?.key, 'OTEL_EXPORTER_OTLP_ENDPOINT');

  const passingValues = {
    ...tracingEnabledValues,
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
    OTEL_EXPORTER_OTLP_HEADERS: 'x-otlp=1',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(passingValues), 'utf8');

  const passOutput = new PassThrough();
  passOutput.resume();
  const passing = await runDoctor({ cwd, json: true, output: passOutput });
  assert.equal(passing.exitCode, 0);
});

test('enforces paired rate limit values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-rate-limit-'));

  await writeFile(join(cwd, '.env.example'), buildEnvFile(baseExampleValues), 'utf8');

  const incompleteRateLimit = {
    ...baseEnvValues,
    INGEST_RATE_LIMIT_WINDOW_MS: '60000',
    INGEST_RATE_LIMIT_MAX_REQUESTS: '',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(incompleteRateLimit), 'utf8');

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const failing = await runDoctor({ cwd, json: true, output });
  assert.equal(failing.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.equal(parsed.invalidKeys[0]?.key, 'INGEST_RATE_LIMIT_MAX_REQUESTS');

  const validRateLimit = {
    ...baseEnvValues,
    INGEST_RATE_LIMIT_WINDOW_MS: '60000',
    INGEST_RATE_LIMIT_MAX_REQUESTS: '120',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(validRateLimit), 'utf8');
  const passOutput = new PassThrough();
  passOutput.resume();
  const passing = await runDoctor({ cwd, json: true, output: passOutput });
  assert.equal(passing.exitCode, 0);
});

test('requires SMTP credentials only when MAILER_DRIVER=smtp', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-mailer-'));

  await writeFile(join(cwd, '.env.example'), buildEnvFile(baseExampleValues), 'utf8');

  const smtpValues = {
    ...baseEnvValues,
    MAILER_DRIVER: 'smtp',
    SMTP_URL: '',
  } satisfies Record<string, string>;

  await writeFile(
    join(cwd, '.env'),
    buildEnvFile(smtpValues, { omit: ['SMTP_URL'] }),
    'utf8',
  );

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const failing = await runDoctor({ cwd, json: true, output });
  assert.equal(failing.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.ok(parsed.missingKeys.includes('SMTP_URL'));

  const consoleMailer = {
    ...baseEnvValues,
    MAILER_DRIVER: 'console',
    SMTP_URL: '',
    MAIL_FROM_EMAIL: '',
    MAIL_FROM_NAME: '',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(consoleMailer), 'utf8');
  const passOutput = new PassThrough();
  passOutput.resume();
  const passing = await runDoctor({ cwd, json: true, output: passOutput });
  assert.equal(passing.exitCode, 0);
});

test('requires LiveRC base URL only when any LiveRC feature toggle is enabled', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-liverc-'));

  await writeFile(join(cwd, '.env.example'), buildEnvFile(baseExampleValues), 'utf8');

  const toggledOn = {
    ...baseEnvValues,
    ENABLE_IMPORT_WIZARD: '1',
  } satisfies Record<string, string>;

  await writeFile(
    join(cwd, '.env'),
    buildEnvFile(toggledOn, { omit: ['LIVERC_HTTP_BASE'] }),
    'utf8',
  );

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const failing = await runDoctor({ cwd, json: true, output });
  assert.equal(failing.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.ok(parsed.missingKeys.includes('LIVERC_HTTP_BASE'));

  const toggledOff = {
    ...baseEnvValues,
    ENABLE_IMPORT_WIZARD: '1',
    LIVERC_HTTP_BASE: 'https://liverc.example.com',
  } satisfies Record<string, string>;

  await writeFile(join(cwd, '.env'), buildEnvFile(toggledOff), 'utf8');
  const passOutput = new PassThrough();
  passOutput.resume();
  const passing = await runDoctor({ cwd, json: true, output: passOutput });
  assert.equal(passing.exitCode, 0);
});

function buildEnvFile(
  values: Record<string, string>,
  options: { omit?: string[] } = {},
): string {
  const omit = new Set(options.omit ?? []);
  const lines = KEY_ORDER.filter((key) => !omit.has(key)).map((key) => `${key}=${values[key] ?? ''}`);
  lines.push('');
  return lines.join('\n');
}

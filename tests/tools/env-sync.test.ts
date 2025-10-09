import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runEnvSync } from '../../tools/env-sync';

const exampleTemplate = [
  '# Always required',
  'APP_URL=https://app.example.com',
  'NEXT_PUBLIC_APP_ORIGIN=',
  'ALLOWED_ORIGINS=https://app.example.com',
  'SESSION_SECRET=<example>',
  'COOKIE_SECURE_STRATEGY=auto',
  'TRUST_PROXY=false',
  '',
  '# Tracing',
  'TRACING_ENABLED=false',
  'OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com',
  'OTEL_SERVICE_NAME=my-service',
  'OTEL_EXPORTER_OTLP_HEADERS=x-test=1',
  '',
  '# Mailer',
  'MAILER_DRIVER=console',
  'SMTP_URL=smtp://user:pass@smtp.example.com:587',
  'MAIL_FROM_EMAIL=ops@example.com',
  'MAIL_FROM_NAME=Ops',
  '',
  '# Rate limiting',
  'INGEST_RATE_LIMIT_WINDOW_MS=60000',
  'INGEST_RATE_LIMIT_MAX_REQUESTS=120',
  '',
  '# LiveRC',
  'ENABLE_IMPORT_WIZARD=0',
  'ENABLE_LIVERC_RESOLVER=0',
  'ENABLE_IMPORT_FILE=0',
  'ENABLE_LIVERC_FIXTURE_PROXY=0',
  'LIVERC_HTTP_BASE=https://liverc.example.com',
  '',
].join('\n');

test('default sync appends only always-required and feature-enabled keys', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-sync-default-'));
  await writeFile(join(cwd, '.env.example'), exampleTemplate, 'utf8');

  const envContent = ['TRACING_ENABLED=true', 'MAILER_DRIVER=smtp', 'ENABLE_IMPORT_WIZARD=1', ''].join('\n');
  await writeFile(join(cwd, '.env'), envContent, 'utf8');

  const output = new PassThrough();
  output.resume();

  const result = await runEnvSync({ cwd, now: new Date('2024-01-02T03:04:05Z'), output });
  assert.deepEqual(
    result.addedKeys,
    [
      'APP_URL',
      'NEXT_PUBLIC_APP_ORIGIN',
      'ALLOWED_ORIGINS',
      'SESSION_SECRET',
      'COOKIE_SECURE_STRATEGY',
      'TRUST_PROXY',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'OTEL_SERVICE_NAME',
      'OTEL_EXPORTER_OTLP_HEADERS',
      'SMTP_URL',
      'MAIL_FROM_EMAIL',
      'MAIL_FROM_NAME',
      'LIVERC_HTTP_BASE',
    ],
  );
  assert.ok(result.backupPath.endsWith('.env.bak-20240102T030405'));

  const updated = await readFile(join(cwd, '.env'), 'utf8');
  assert.match(updated, /NEXT_PUBLIC_APP_ORIGIN=https:\/\/app\.example\.com/);
  assert.doesNotMatch(updated, /INGEST_RATE_LIMIT_WINDOW_MS=/);
});

test('sync --all appends every missing key', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-sync-all-'));
  await writeFile(join(cwd, '.env.example'), exampleTemplate, 'utf8');

  const envContent = ['APP_URL=https://app.example.com', ''].join('\n');
  await writeFile(join(cwd, '.env'), envContent, 'utf8');

  const output = new PassThrough();
  output.resume();

  const result = await runEnvSync({ cwd, now: new Date('2024-04-05T06:07:08Z'), output, all: true });
  assert.ok(result.addedKeys.length > 0);
  assert.equal(result.addedKeys.length, 20);

  const updated = await readFile(join(cwd, '.env'), 'utf8');
  assert.match(updated, /INGEST_RATE_LIMIT_MAX_REQUESTS=120/);
  assert.match(updated, /LIVERC_HTTP_BASE=https:\/\/liverc\.example\.com/);
});

test('sync sets NEXT_PUBLIC_APP_ORIGIN to APP_URL when available', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-sync-origin-'));
  await writeFile(join(cwd, '.env.example'), exampleTemplate, 'utf8');

  const envContent = ['APP_URL=https://app.example.com', ''].join('\n');
  await writeFile(join(cwd, '.env'), envContent, 'utf8');

  const output = new PassThrough();
  output.resume();

  await runEnvSync({ cwd, now: new Date('2024-08-09T10:11:12Z'), output });

  const updated = await readFile(join(cwd, '.env'), 'utf8');
  assert.match(updated, /NEXT_PUBLIC_APP_ORIGIN=https:\/\/app\.example\.com/);
});

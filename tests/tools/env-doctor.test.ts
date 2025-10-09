import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runDoctor } from '../../tools/env-doctor';

test('reports missing keys and exits with failure when .env lacks entries', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-missing-'));
  await writeFile(
    join(cwd, '.env.example'),
    ['A=1', 'B=2', 'C=3', ''].join('\n'),
    'utf8',
  );
  await writeFile(join(cwd, '.env'), ['A=1', ''].join('\n'), 'utf8');

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctor({ cwd, json: true, output });
  assert.equal(result.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.deepEqual(parsed.missingKeys.sort(), ['B', 'C']);
});

test('flags invalid APP_URL values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-app-url-'));
  await writeFile(
    join(cwd, '.env.example'),
    ['APP_URL=https://example.com', ''].join('\n'),
    'utf8',
  );
  await writeFile(join(cwd, '.env'), ['APP_URL=invalid-url', ''].join('\n'), 'utf8');

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctor({ cwd, json: true, output });
  assert.equal(result.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.equal(parsed.invalidKeys.length, 1);
  assert.equal(parsed.invalidKeys[0]?.key, 'APP_URL');
});

test('flags short SESSION_SECRET values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-doctor-session-secret-'));
  await writeFile(
    join(cwd, '.env.example'),
    ['SESSION_SECRET=placeholder-session-secret', ''].join('\n'),
    'utf8',
  );
  await writeFile(join(cwd, '.env'), ['SESSION_SECRET=short', ''].join('\n'), 'utf8');

  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctor({ cwd, json: true, output });
  assert.equal(result.exitCode, 1);

  const parsed = JSON.parse(printed.trim());
  assert.equal(parsed.invalidKeys[0]?.key, 'SESSION_SECRET');
});


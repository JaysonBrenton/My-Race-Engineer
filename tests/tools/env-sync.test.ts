import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runDoctor } from '../../tools/env-doctor';
import { runEnvSync } from '../../tools/env-sync';

test('appends missing keys without overwriting existing values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'env-sync-'));

  await writeFile(
    join(cwd, '.env.example'),
    [
      'A=example-a',
      '# Comment for B',
      '# Second comment line',
      'B=example-b',
      '# Comment for C',
      'C=example-c',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(cwd, '.env'), ['A=actual-a', ''].join('\n'), 'utf8');

  const output = new PassThrough();
  output.resume();

  const result = await runEnvSync({ cwd, now: new Date('2024-01-02T03:04:05Z'), output });
  assert.deepEqual(result.addedKeys, ['B', 'C']);
  assert.ok(result.backupPath.endsWith('.env.bak-20240102T030405'));

  const backup = await readFile(result.backupPath, 'utf8');
  assert.equal(backup, ['A=actual-a', ''].join('\n'));

  const updated = await readFile(join(cwd, '.env'), 'utf8');
  assert.equal(
    updated,
    [
      'A=actual-a',
      '',
      '# Comment for B',
      '# Second comment line',
      'B=example-b',
      '',
      '# Comment for C',
      'C=example-c',
      '',
    ].join('\n'),
  );

  const doctorOutput = new PassThrough();
  doctorOutput.resume();
  const doctor = await runDoctor({ cwd, json: true, output: doctorOutput });
  assert.equal(doctor.exitCode, 0);
});


import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { enumerateSessionsFromEventHtml } from '../../../src/core/app/connectors/liverc/parse';

test('enumerateSessionsFromEventHtml returns sessions grouped by section metadata', async () => {
  const fixtureUrl = new URL('../../../fixtures/liverc/html/sample-event-overview.html', import.meta.url);
  const html = await readFile(fixtureUrl, 'utf-8');

  const sessions = enumerateSessionsFromEventHtml(html);

  assert.equal(sessions.length, 5, 'expected five sessions in the sample fixture');

  const proBuggyMain = sessions.find((session) => session.sessionRef.includes('pro-buggy/main'));
  assert.ok(proBuggyMain, 'expected to find pro buggy main event');
  assert.equal(proBuggyMain?.type, 'MAIN');
  assert.equal(proBuggyMain?.className, 'Pro Buggy');
  assert.equal(proBuggyMain?.heatLabel, 'A Main');
  assert.equal(proBuggyMain?.completedAt, '2024-05-12T01:05:00.000Z');

  const roundOneHeatTwo = sessions.find((session) => session.sessionRef.includes('round-1/heat-2'));
  assert.ok(roundOneHeatTwo, 'expected to find qualifier round 1 heat 2');
  assert.equal(roundOneHeatTwo?.type, 'QUAL');
  assert.equal(roundOneHeatTwo?.roundLabel, 'Round 1');
  assert.equal(roundOneHeatTwo?.heatLabel, 'Heat 2');
  assert.equal(roundOneHeatTwo?.completedAt, '2024-05-11T16:45:00.000Z');

  const roundTwoHeatOne = sessions.find((session) => session.sessionRef.includes('round-2/heat-1'));
  assert.ok(roundTwoHeatOne, 'expected to find qualifier round 2 heat 1');
  assert.equal(roundTwoHeatOne?.roundLabel, 'Round 2');
  assert.equal(roundTwoHeatOne?.completedAt, '2024-05-11T18:00:00.000Z');
});

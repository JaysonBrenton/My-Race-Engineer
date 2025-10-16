import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLapId } from '../../../src/core/app/connectors/liverc/lapId';

test('buildLapId produces stable hashes for identical lap descriptors', () => {
  const parts = {
    eventId: 'evt-123',
    sessionId: 'ses-456',
    raceId: 'race-789',
    driverId: 'drv-999',
    lapNumber: 7,
  };

  const first = buildLapId(parts);
  const second = buildLapId({ ...parts });

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test('buildLapId changes when any part of the lap descriptor differs', () => {
  const base = {
    eventId: 'evt-123',
    sessionId: 'ses-456',
    raceId: 'race-789',
    driverId: 'drv-999',
    lapNumber: 7,
  } as const;

  const variants = [
    buildLapId({ ...base, lapNumber: 8 }),
    buildLapId({ ...base, driverId: 'drv-123' }),
    buildLapId({ ...base, raceId: 'race-000' }),
    buildLapId({ ...base, sessionId: 'ses-000' }),
    buildLapId({ ...base, eventId: 'evt-000' }),
  ];

  const unique = new Set(variants);

  assert.equal(variants.length, unique.size);
  for (const hash of variants) {
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});

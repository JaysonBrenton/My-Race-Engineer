import { createHash } from 'node:crypto';

export type LapIdParts = {
  eventId: string;
  sessionId: string;
  raceId: string;
  driverId: string;
  lapNumber: number;
};

export const buildLapId = (parts: LapIdParts) =>
  createHash('sha256')
    .update(
      `${parts.eventId}|${parts.sessionId}|${parts.raceId}|${parts.driverId}|${parts.lapNumber}`,
    )
    .digest('hex');


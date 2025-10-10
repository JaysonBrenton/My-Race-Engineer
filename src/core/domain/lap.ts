import type { Entrant } from './entrant';

export type LapTime = {
  milliseconds: number;
};

export type Lap = {
  id: string;
  entrantId: string;
  sessionId: string;
  lapNumber: number;
  lapTime: LapTime;
  createdAt: Date;
  updatedAt: Date;
};

export type LapSummary = {
  entrantId: string;
  entrantDisplayName: string;
  lapsCompleted: number;
  bestLapMs: number;
  averageLapMs: number;
};

export const calculateLapSummary = (entrant: Entrant, laps: Lap[]): LapSummary => {
  if (laps.length === 0) {
    return {
      entrantId: entrant.id,
      entrantDisplayName: entrant.displayName,
      lapsCompleted: 0,
      bestLapMs: 0,
      averageLapMs: 0,
    };
  }

  let bestLapMs = Infinity;
  let total = 0;

  for (const { lapTime } of laps) {
    const { milliseconds } = lapTime;
    total += milliseconds;

    if (milliseconds < bestLapMs) {
      bestLapMs = milliseconds;
    }
  }

  return {
    entrantId: entrant.id,
    entrantDisplayName: entrant.displayName,
    lapsCompleted: laps.length,
    bestLapMs: bestLapMs === Infinity ? 0 : bestLapMs,
    averageLapMs: Math.round(total / laps.length),
  };
};

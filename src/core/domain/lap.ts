export type LapTime = {
  milliseconds: number;
};

export type Lap = {
  id: string;
  driverName: string;
  lapNumber: number;
  lapTime: LapTime;
  createdAt: Date;
  updatedAt: Date;
};

export type LapSummary = {
  driverName: string;
  lapsCompleted: number;
  bestLapMs: number;
  averageLapMs: number;
};

export const calculateLapSummary = (driverName: string, laps: Lap[]): LapSummary => {
  if (laps.length === 0) {
    return {
      driverName,
      lapsCompleted: 0,
      bestLapMs: 0,
      averageLapMs: 0,
    };
  }

  const sorted = [...laps].sort((a, b) => a.lapTime.milliseconds - b.lapTime.milliseconds);
  const total = laps.reduce((acc, lap) => acc + lap.lapTime.milliseconds, 0);

  return {
    driverName,
    lapsCompleted: laps.length,
    bestLapMs: sorted[0]?.lapTime.milliseconds ?? 0,
    averageLapMs: Math.round(total / laps.length),
  };
};

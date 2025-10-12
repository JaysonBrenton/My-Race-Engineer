import type { ResultRow } from '@core/domain';

export type ResultRowUpsertInput = {
  sessionId: string;
  driverId: string;
  position?: number | null;
  carNumber?: string | null;
  laps?: number | null;
  totalTimeMs?: number | null;
  behindMs?: number | null;
  fastestLapMs?: number | null;
  fastestLapNum?: number | null;
  avgLapMs?: number | null;
  avgTop5Ms?: number | null;
  avgTop10Ms?: number | null;
  avgTop15Ms?: number | null;
  top3ConsecMs?: number | null;
  stdDevMs?: number | null;
  consistencyPct?: number | null;
};

export interface ResultRowRepository {
  upsertBySessionAndDriver(input: ResultRowUpsertInput): Promise<ResultRow>;
}

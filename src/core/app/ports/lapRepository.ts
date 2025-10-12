import type { Lap } from '@core/domain';

export type LapUpsertInput = {
  id: string;
  entrantId: string;
  sessionId: string;
  driverId?: string | null;
  lapNumber: number;
  lapTimeMs: number;
};

export interface LapRepository {
  listByEntrant(entrantId: string): Promise<Lap[]>;
  replaceForEntrant(
    entrantId: string,
    sessionId: string,
    laps: ReadonlyArray<LapUpsertInput>,
  ): Promise<void>;
}

import type { Lap } from '@core/domain';

export interface LapRepository {
  listByEntrant(entrantId: string): Promise<Lap[]>;
}

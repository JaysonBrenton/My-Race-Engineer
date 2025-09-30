import type { Lap } from '@core/domain';

export interface LapRepository {
  listByDriver(driverName: string): Promise<Lap[]>;
}

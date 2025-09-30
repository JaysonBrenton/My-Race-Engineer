import { calculateLapSummary } from '@core/domain';
import type { LapRepository } from '../ports/lapRepository';

export class LapSummaryService {
  constructor(private readonly lapRepository: LapRepository) {}

  async getSummaryForDriver(driverName: string) {
    const laps = await this.lapRepository.listByDriver(driverName);
    return calculateLapSummary(driverName, laps);
  }
}

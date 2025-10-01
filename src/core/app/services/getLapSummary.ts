import { calculateLapSummary } from '@core/domain';

import type { EntrantRepository } from '../ports/entrantRepository';
import type { LapRepository } from '../ports/lapRepository';

export class LapSummaryService {
  constructor(
    private readonly lapRepository: LapRepository,
    private readonly entrantRepository: EntrantRepository,
  ) {}

  async getSummaryForEntrant(entrantId: string) {
    const entrant = await this.entrantRepository.getById(entrantId);

    if (!entrant) {
      throw new Error(`Entrant not found for id ${entrantId}`);
    }

    const laps = await this.lapRepository.listByEntrant(entrantId);
    return calculateLapSummary(entrant, laps);
  }
}

import type { RaceClass } from '@core/domain';

export type RaceClassUpsertInput = {
  eventId: string;
  classCode: string;
  sourceUrl: string;
  name: string;
};

export interface RaceClassRepository {
  findByEventAndCode(eventId: string, classCode: string): Promise<RaceClass | null>;
  upsertBySource(input: RaceClassUpsertInput): Promise<RaceClass>;
}

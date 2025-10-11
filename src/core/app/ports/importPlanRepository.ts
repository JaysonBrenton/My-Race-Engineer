import type { Event } from '@core/domain';

export type ImportPlanEventState = {
  event: Pick<Event, 'id' | 'source'> & {
    entriesCount?: number | null;
    driversCount?: number | null;
  };
  sessionCount: number;
  sessionsWithLaps: number;
  lapCount: number;
  entrantCount: number;
};

export interface ImportPlanRepository {
  getEventStateByRef(eventRef: string): Promise<ImportPlanEventState | null>;
}

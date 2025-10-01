import type { Entrant } from '@core/domain';

export interface EntrantRepository {
  getById(id: string): Promise<Entrant | null>;
  findBySourceEntrantId(sourceEntrantId: string): Promise<Entrant | null>;
  listBySession(sessionId: string): Promise<Entrant[]>;
}

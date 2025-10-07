import type { Entrant } from '@core/domain';

export type EntrantUpsertInput = {
  eventId: string;
  raceClassId: string;
  sessionId: string;
  displayName: string;
  carNumber?: string | null;
  sourceEntrantId?: string | null;
  sourceTransponderId?: string | null;
};

export type EntrantSourceLookup = {
  eventId: string;
  raceClassId: string;
  sessionId: string;
  sourceEntrantId: string;
};

export interface EntrantRepository {
  getById(id: string): Promise<Entrant | null>;
  findBySourceEntrantId(params: EntrantSourceLookup): Promise<Entrant | null>;
  listBySession(sessionId: string): Promise<Entrant[]>;
  upsertBySource(input: EntrantUpsertInput): Promise<Entrant>;
}

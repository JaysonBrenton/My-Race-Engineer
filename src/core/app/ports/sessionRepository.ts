import type { Session } from '@core/domain';

export type SessionUpsertInput = {
  eventId: string;
  raceClassId: string;
  sourceSessionId: string;
  sourceUrl: string;
  name: string;
  scheduledStart?: Date | null;
};

export interface SessionRepository {
  getById(id: string): Promise<Session | null>;
  findBySourceId(sourceSessionId: string): Promise<Session | null>;
  findBySourceUrl(sourceUrl: string): Promise<Session | null>;
  listByEvent(eventId: string): Promise<Session[]>;
  listByRaceClass(raceClassId: string): Promise<Session[]>;
  upsertBySource(input: SessionUpsertInput): Promise<Session>;
}

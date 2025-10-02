import type { Event } from '@core/domain';

export type EventUpsertInput = {
  sourceEventId: string;
  sourceUrl: string;
  name: string;
};

export interface EventRepository {
  getById(id: string): Promise<Event | null>;
  findBySourceId(sourceEventId: string): Promise<Event | null>;
  findBySourceUrl(sourceUrl: string): Promise<Event | null>;
  upsertBySource(input: EventUpsertInput): Promise<Event>;
}

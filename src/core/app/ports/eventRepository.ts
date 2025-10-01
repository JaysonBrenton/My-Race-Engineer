import type { Event } from '@core/domain';

export interface EventRepository {
  getById(id: string): Promise<Event | null>;
  findBySourceId(sourceEventId: string): Promise<Event | null>;
  findBySourceUrl(sourceUrl: string): Promise<Event | null>;
}

/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/events.ts
 * Summary: Service for searching LiveRC club events with query filtering.
 */

import type { ClubRepository } from '@core/app/ports/clubRepository';
import type { Logger } from '@core/app/ports/logger';

import { LiveRcDiscoveryService, type LiveRcDiscoveryEvent } from './discovery';

export type EventSearchResult = {
  eventRef: string;
  title: string;
  whenIso: string;
  clubId: string;
  clubSubdomain: string;
};

type EventSearchDependencies = {
  discoveryService: Pick<LiveRcDiscoveryService, 'discoverByClubAndDateRange'>;
  clubRepository: Pick<ClubRepository, 'findById'>;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
};

/**
 * Calculates a default date range for event search when no range is provided.
 * Returns the last 6 months and next 6 months from today.
 */
const getDefaultDateRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 6);

  const formatDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
};

/**
 * Service for searching LiveRC club events by query term, similar to club search.
 * Filters events discovered from a club's events page by matching the query
 * against event titles.
 */
export class LiveRcEventSearchService {
  constructor(private readonly dependencies: EventSearchDependencies) {}

  async searchEvents(
    clubId: string,
    query: string,
    startDate?: string,
    endDate?: string,
    limit = 10,
  ): Promise<EventSearchResult[]> {
    const normalisedQuery = query.trim().toLowerCase();

    // Return early for blank search terms.
    if (!normalisedQuery) {
      return [];
    }

    // Require at least 2 characters for search to avoid overly broad results.
    if (normalisedQuery.length < 2) {
      return [];
    }

    // Bound the requested limit to a small, predictable range.
    const boundedLimit = Math.max(1, Math.min(limit, 25));

    // Use default date range if not provided (last 6 months and next 6 months).
    const dateRange = startDate && endDate
      ? { startDate, endDate }
      : getDefaultDateRange();

    // Fetch club to get subdomain.
    const club = await this.dependencies.clubRepository.findById(clubId);
    if (!club) {
      this.dependencies.logger?.warn?.('Club not found for event search.', {
        event: 'liverc.events.search.club_not_found',
        clubId,
        outcome: 'invalid-request',
      });
      return [];
    }

    // Discover events for the club in the specified date range.
    const discoveryResult = await this.dependencies.discoveryService.discoverByClubAndDateRange({
      clubId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 100, // Fetch more than needed to filter by query
    });

    // Filter events where the title contains the query term.
    const filteredEvents = discoveryResult.events
      .filter((event) => event.title.toLowerCase().includes(normalisedQuery))
      .sort((a, b) => {
        // Sort by date descending (most recent/upcoming first).
        const aDate = new Date(a.whenIso + 'T00:00:00Z').getTime();
        const bDate = new Date(b.whenIso + 'T00:00:00Z').getTime();
        return bDate - aDate;
      })
      .slice(0, boundedLimit)
      .map<EventSearchResult>((event) => ({
        eventRef: event.eventRef,
        title: event.title,
        whenIso: event.whenIso,
        clubId,
        clubSubdomain: club.liveRcSubdomain,
      }));

    this.dependencies.logger?.debug?.('LiveRC event search completed.', {
      event: 'liverc.events.search.complete',
      outcome: 'success',
      clubId,
      query: normalisedQuery,
      resultCount: filteredEvents.length,
    });

    return filteredEvents;
  }
}


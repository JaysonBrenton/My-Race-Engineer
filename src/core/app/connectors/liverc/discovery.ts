/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/discovery.ts
 * Summary: Service that discovers LiveRC club events by parsing club event listings.
 */

/**
 * Intended design guardrail:
 * - LiveRcDiscoveryService is club based (not track based) with inputs { clubId, startDate, endDate, limit? }.
 * - Resolve clubId to a Club record, use its subdomain, and call https://<club-subdomain>.liverc.com/events/ to discover.
 * - Free-text track fields and https://live.liverc.com/events/?date=... are legacy patterns that must not reappear now
 *   that the club-based refactor is complete. See ADR-20251120-liverc-club-based-discovery for the authoritative decision.
 */

import { HTMLElement as ParsedHTMLElement, parse } from 'node-html-parser';

import type { ClubRepository } from '@core/app/ports/clubRepository';
import type { Logger } from '@core/app/ports/logger';

import { LiveRcClientError, type LiveRcClient } from './client';

export type LiveRcDiscoveryEvent = {
  eventRef: string;
  title: string;
  // YYYY-MM-DD date string for stable comparisons and filtering.
  whenIso: string;
};

export type LiveRcDiscoveryRequest = {
  clubId: string;
  startDate: string;
  endDate: string;
  limit?: number;
};

type HtmlClient = Pick<LiveRcClient, 'getClubEventsPage'>;

type Dependencies = {
  client: HtmlClient;
  clubRepository: Pick<ClubRepository, 'findById'>;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
};

type ParsedClubEvent = {
  eventRef: string;
  title: string;
  whenIso: string;
  whenSortValue: number;
};

const DEFAULT_LIMIT = 40;

export class LiveRcDiscoveryService {
  constructor(private readonly dependencies: Dependencies) {}

  async discoverByClubAndDateRange(
    request: LiveRcDiscoveryRequest,
  ): Promise<{ events: LiveRcDiscoveryEvent[]; clubBaseOrigin: string }> {
    const { startDate, endDate, clubId } = request;
    const limit = clampLimit(request.limit);

    // Parse incoming dates defensively so the service fails fast on invalid input.
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end || end.getTime() < start.getTime()) {
      throw new Error('Invalid date range provided to LiveRc discovery.');
    }

    const club = await this.dependencies.clubRepository.findById(clubId);
    if (!club) {
      this.dependencies.logger?.warn?.('Requested club not found for LiveRC discovery.', {
        event: 'liverc.discovery.club_not_found',
        outcome: 'invalid-request',
        clubId,
      });
      throw new Error('Club not found for LiveRc discovery.');
    }

    const clubBaseOrigin = buildClubBaseOrigin(club.liveRcSubdomain);

    let html: string;
    try {
      html = await this.dependencies.client.getClubEventsPage(club.liveRcSubdomain);
    } catch (error) {
      if (error instanceof LiveRcClientError && error.status === 404) {
        // Treat a missing events page as an empty set instead of failing the
        // overall discovery request.
        this.dependencies.logger?.info?.(
          'LiveRC returned 404 for club events page; treating as empty.',
          {
            event: 'liverc.discovery.club_events_not_found',
            outcome: 'success',
            clubId,
            clubSubdomain: club.liveRcSubdomain,
            error,
          },
        );
        return { events: [], clubBaseOrigin };
      }

      this.dependencies.logger?.error?.('Failed to fetch LiveRC club events page.', {
        event: 'liverc.discovery.fetch_failed',
        outcome: 'failure',
        clubId,
        clubSubdomain: club.liveRcSubdomain,
        error,
      });
      throw error;
    }

    const parsedEvents = parseClubEventsFromHtml(html, clubBaseOrigin);
    const startMs = start.getTime();
    const endMs = end.getTime();

    const filteredEvents = parsedEvents
      // Keep events whose dates fall within the inclusive range.
      .filter((event) => event.whenSortValue >= startMs && event.whenSortValue <= endMs)
      // Sort chronologically (earliest first) to keep the order stable for consumers.
      .sort((a, b) => {
        if (a.whenSortValue !== b.whenSortValue) {
          return a.whenSortValue - b.whenSortValue;
        }
        return a.title.localeCompare(b.title);
      })
      .slice(0, limit)
      .map<LiveRcDiscoveryEvent>((event) => ({
        eventRef: event.eventRef,
        title: event.title,
        whenIso: event.whenIso,
      }));

    this.dependencies.logger?.debug?.('Parsed LiveRC club events for discovery.', {
      event: 'liverc.discovery.parsed',
      outcome: 'success',
      clubId,
      clubSubdomain: club.liveRcSubdomain,
      eventCount: filteredEvents.length,
    });

    return { events: filteredEvents, clubBaseOrigin };
  }
}

const clampLimit = (limit: number | undefined): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  if (limit < 1) {
    return 1;
  }

  if (limit > 100) {
    return 100;
  }

  return Math.floor(limit);
};

const parseClubEventsFromHtml = (html: string, baseOrigin: string): ParsedClubEvent[] => {
  const root = parse(html, {
    lowerCaseTagName: false,
    blockTextElements: {
      script: true,
      style: true,
    },
  });

  // Prefer structured table rows where event name and date sit alongside each other.
  const rows = root.querySelectorAll('table.events tbody tr, table.events tr');
  const events: ParsedClubEvent[] = [];

  for (const row of rows) {
    const anchor = row.querySelector('a[href]');
    if (!anchor) {
      continue;
    }

    const title = normaliseText(anchor.textContent ?? '');
    const href = anchor.getAttribute('href');
    const dateText = extractDateText(row);

    if (!href || !title || !dateText) {
      continue;
    }

    const eventRef = normaliseEventRef(href, baseOrigin);
    const whenIso = parseEventDate(dateText);
    const whenSortValue = parseIsoToMillis(whenIso);

    if (!eventRef || !whenIso || whenSortValue === null) {
      continue;
    }

    events.push({
      eventRef,
      title,
      whenIso,
      whenSortValue,
    });
  }

  // Fall back to scanning all anchors if no table rows were parsed to keep the
  // parser resilient to simplified fixtures.
  if (events.length === 0) {
    const anchors = root.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      const title = normaliseText(anchor.textContent ?? '');
      const dateText =
        anchor.parentNode instanceof ParsedHTMLElement ? extractDateText(anchor.parentNode) : '';

      if (!href || !title || !dateText) {
        continue;
      }

      const eventRef = normaliseEventRef(href, baseOrigin);
      const whenIso = parseEventDate(dateText);
      const whenSortValue = parseIsoToMillis(whenIso);

      if (!eventRef || !whenIso || whenSortValue === null) {
        continue;
      }

      events.push({ eventRef, title, whenIso, whenSortValue });
    }
  }

  return events;
};

const extractDateText = (node: ParsedHTMLElement): string => {
  const dateCell =
    node.querySelector('.event-date') ??
    node.querySelector('time') ??
    node.querySelector('td[data-date]') ??
    node.querySelector('td');

  if (!dateCell) {
    return '';
  }

  const attrValue = dateCell.getAttribute('data-date');
  if (attrValue) {
    return attrValue;
  }

  return normaliseText(dateCell.textContent ?? '');
};

const parseEventDate = (raw: string): string | undefined => {
  const cleaned = normaliseText(raw);
  if (!cleaned) {
    return undefined;
  }

  // If the page provides a YYYY-MM-DD value, treat it as a UTC date to stabilise filtering.
  const isoOnly = /^\d{4}-\d{2}-\d{2}$/.exec(cleaned);
  if (isoOnly) {
    const parsed = parseDateOnly(cleaned);
    return parsed ? formatDateOnly(parsed) : undefined;
  }

  const timestamp = Date.parse(cleaned);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return formatDateOnly(new Date(timestamp));
};

const parseDateOnly = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const parseIsoToMillis = (iso: string | undefined): number | null => {
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

const buildClubBaseOrigin = (liveRcSubdomain: string): string => {
  const trimmed = liveRcSubdomain.trim();
  if (!trimmed) {
    return 'https://liverc.com';
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const host = /\.liverc\.com$/i.test(withoutProtocol)
    ? withoutProtocol
    : `${withoutProtocol}.liverc.com`;

  return `https://${host}`;
};

const normaliseEventRef = (href: string, baseOrigin: string): string | null => {
  try {
    const url = new URL(href, baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`);
    url.hash = '';
    url.search = '';
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
};

const normaliseText = (value: string): string => value.replace(/\s+/g, ' ').trim();

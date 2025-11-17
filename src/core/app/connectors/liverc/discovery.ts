/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/discovery.ts
 * Summary: Service that discovers LiveRC events by parsing HTML listings.
 */

import { HTMLElement as ParsedHTMLElement, parse } from 'node-html-parser';

import type { Logger } from '@core/app/ports/logger';

import { LiveRcClientError, type LiveRcClient } from './client';

export type LiveRcDiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  score: number;
};

export type LiveRcDiscoveryRequest = {
  startDate: string;
  endDate: string;
  track: string;
  limit?: number;
};

type HtmlClient = Pick<LiveRcClient, 'getEventOverview'>;

type Dependencies = {
  client: HtmlClient;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
};

type ParsedDiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  whenSortValue: number | null;
  searchableValue: string;
};

type AggregatedDiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  whenSortValue: number | null;
  score: number;
};

const MAX_RANGE_DAYS = 7;
const DEFAULT_LIMIT = 40;
// Base origin for resolving relative event references returned by LiveRC.
const LIVERC_BASE_ORIGIN = 'https://live.liverc.com/';

export class LiveRcDiscoveryService {
  constructor(private readonly dependencies: Dependencies) {}

  async discoverByDateRangeAndTrack(
    request: LiveRcDiscoveryRequest,
  ): Promise<{ events: LiveRcDiscoveryEvent[] }> {
    const { startDate, endDate } = request;
    const limit = clampLimit(request.limit);
    const trackQuery = request.track.trim();

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end || end.getTime() < start.getTime()) {
      throw new Error('Invalid date range provided to LiveRc discovery.');
    }

    const totalDays = Math.min(MAX_RANGE_DAYS, daysBetweenInclusive(start, end));
    const dates = enumerateDateRange(start, totalDays);

    const aggregated = new Map<string, AggregatedDiscoveryEvent>();
    const trackNeedle = trackQuery.toLowerCase();

    for (const currentDate of dates) {
      const dateLabel = formatDate(currentDate);
      let html: string;

      try {
        html = await this.dependencies.client.getEventOverview(`/events/?date=${dateLabel}`);
      } catch (error) {
        if (error instanceof LiveRcClientError && error.status === 404) {
          // LiveRC returns 404 when no events exist for a date; treat this as
          // an empty listing so discovery can proceed instead of failing the
          // entire request.
          this.dependencies.logger?.info?.(
            'LiveRC reported no events for date; continuing discovery.',
            {
              event: 'liverc.discovery.fetch_not_found',
              outcome: 'success',
              date: dateLabel,
              error,
            },
          );
          continue;
        }

        this.dependencies.logger?.error?.('Failed to fetch LiveRC event listing.', {
          event: 'liverc.discovery.fetch_failed',
          outcome: 'failure',
          date: dateLabel,
          error,
        });
        throw error;
      }

      const parsedEvents = parseDiscoveryEventsFromHtml(html, currentDate);
      this.dependencies.logger?.debug?.('Parsed LiveRC events for discovery day.', {
        event: 'liverc.discovery.parsed',
        outcome: 'success',
        date: dateLabel,
        eventCount: parsedEvents.length,
      });

      for (const parsed of parsedEvents) {
        const score = computeSubstringScore(parsed.searchableValue, trackNeedle);
        const existing = aggregated.get(parsed.eventRef);

        if (!existing) {
          aggregated.set(parsed.eventRef, {
            eventRef: parsed.eventRef,
            title: parsed.title,
            whenIso: parsed.whenIso,
            whenSortValue: parsed.whenSortValue,
            score,
          });
          continue;
        }

        if (score > existing.score) {
          aggregated.set(parsed.eventRef, {
            eventRef: parsed.eventRef,
            title: parsed.title,
            whenIso: parsed.whenIso,
            whenSortValue: parsed.whenSortValue,
            score,
          });
          continue;
        }

        if (score === existing.score) {
          const comparison = compareWhenValues(parsed.whenSortValue, existing.whenSortValue);
          if (comparison < 0) {
            aggregated.set(parsed.eventRef, {
              eventRef: parsed.eventRef,
              title: parsed.title,
              whenIso: parsed.whenIso,
              whenSortValue: parsed.whenSortValue,
              score,
            });
          }
        }
      }
    }

    const events = Array.from(aggregated.values())
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        const whenComparison = compareWhenValues(a.whenSortValue, b.whenSortValue);
        if (whenComparison !== 0) {
          return whenComparison;
        }

        return a.title.localeCompare(b.title);
      })
      .slice(0, limit)
      .map<LiveRcDiscoveryEvent>((event) => ({
        eventRef: event.eventRef,
        title: event.title,
        whenIso: event.whenIso,
        score: event.score,
      }));

    return { events };
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

const parseDiscoveryEventsFromHtml = (html: string, fallbackDate: Date): ParsedDiscoveryEvent[] => {
  const root = parse(html, {
    lowerCaseTagName: false,
    blockTextElements: {
      script: true,
      style: true,
    },
  });

  const headingAnchors = root.querySelectorAll(
    'h1 a[href], h2 a[href], h3 a[href], h4 a[href], h5 a[href], h6 a[href]'.replace(/\s+/g, ' '),
  );

  const parsed: ParsedDiscoveryEvent[] = [];
  const fallbackIso = new Date(fallbackDate.getTime()).toISOString();

  for (const anchor of headingAnchors) {
    const href = anchor.getAttribute('href');
    const title = normaliseText(anchor.textContent ?? '');

    if (!href || !title) {
      continue;
    }

    const eventRef = normaliseEventRef(href);
    if (!eventRef || !eventRef.includes('/events/')) {
      continue;
    }

    const container = findEventContainer(anchor);
    const description = container?.querySelector('p')?.textContent ?? '';
    const whenText = extractWhenText(container, anchor);
    const searchableValue = buildSearchableValue(title, description, container);
    const whenIso = parseWhenToIso(whenText, fallbackDate) ?? fallbackIso;
    const whenSortValue = parseIsoToMillis(whenIso);

    parsed.push({
      eventRef,
      title,
      whenIso,
      whenSortValue,
      searchableValue,
    });
  }

  if (parsed.length > 0) {
    return parsed;
  }

  // Fallback: scan anchors directly if no heading-based cards were found.
  const anchors = root.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    const title = normaliseText(anchor.textContent ?? '');
    if (!href || !title) {
      continue;
    }

    const eventRef = normaliseEventRef(href);
    if (!eventRef || !eventRef.includes('/events/')) {
      continue;
    }

    if (title.length <= 3 || /\b(all coverage|results|watch live|video)\b/i.test(title)) {
      continue;
    }

    const containerCandidate =
      findEventContainer(anchor) ??
      (anchor.parentNode instanceof ParsedHTMLElement ? anchor.parentNode : null);
    const description = containerCandidate?.textContent ?? '';
    const whenText = extractWhenText(containerCandidate, anchor);
    const searchableValue = buildSearchableValue(title, description, containerCandidate);
    const whenIso = parseWhenToIso(whenText, fallbackDate) ?? fallbackIso;
    const whenSortValue = parseIsoToMillis(whenIso);

    parsed.push({
      eventRef,
      title,
      whenIso,
      whenSortValue,
      searchableValue,
    });
  }

  return parsed;
};

const findEventContainer = (node: ParsedHTMLElement): ParsedHTMLElement | null => {
  let current: ParsedHTMLElement | null = node;
  const maxDepth = 6;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (elementHasClass(current, 'portfolio-card') || elementHasClass(current, 'event-card')) {
      return current;
    }

    if (elementHasClass(current, 'card-body')) {
      return current.parentNode instanceof ParsedHTMLElement ? current.parentNode : current;
    }

    current = current.parentNode instanceof ParsedHTMLElement ? current.parentNode : null;
    depth += 1;
  }

  return null;
};

const extractWhenText = (
  container: ParsedHTMLElement | null,
  anchor: ParsedHTMLElement,
): string => {
  if (container) {
    const meta = container.querySelector('.portfolio-meta span');
    if (meta?.textContent) {
      return meta.textContent;
    }

    const timeElement = container.querySelector('time');
    if (timeElement) {
      const datetimeAttr = timeElement.getAttribute('datetime');
      if (datetimeAttr) {
        return datetimeAttr;
      }

      if (timeElement.textContent) {
        return timeElement.textContent;
      }
    }

    const dateElement = container.querySelector('[data-event-date], .event-date, .event-when');
    if (dateElement?.textContent) {
      return dateElement.textContent;
    }
  }

  const siblingTime =
    anchor.parentNode instanceof ParsedHTMLElement ? anchor.parentNode.querySelector('time') : null;
  if (siblingTime) {
    const datetimeAttr = siblingTime.getAttribute('datetime');
    if (datetimeAttr) {
      return datetimeAttr;
    }

    if (siblingTime.textContent) {
      return siblingTime.textContent;
    }
  }

  return '';
};

const buildSearchableValue = (
  title: string,
  description: string,
  container: ParsedHTMLElement | null,
): string => {
  const parts = new Set<string>();
  if (title) {
    parts.add(title);
  }

  const normalisedDescription = normaliseText(description);
  if (normalisedDescription) {
    parts.add(normalisedDescription);
  }

  if (container) {
    const trackElements = container.querySelectorAll(
      '[data-track], [data-track-name], .event-location, .event-track, .portfolio-meta',
    );
    for (const element of trackElements) {
      const text = normaliseText(element.textContent ?? '');
      if (text) {
        parts.add(text);
      }
    }
  }

  return Array.from(parts)
    .map((value) => value.toLowerCase())
    .join(' ');
};

const computeSubstringScore = (haystack: string, needle: string): number => {
  if (!needle) {
    return 0;
  }

  if (!haystack) {
    return 0;
  }

  const haystackValue = haystack.toLowerCase();
  const target = needle.toLowerCase();
  let best = 0;

  for (let start = 0; start < target.length; start += 1) {
    for (let end = target.length; end > start; end -= 1) {
      const length = end - start;
      if (length <= best) {
        break;
      }

      const slice = target.slice(start, end);
      if (haystackValue.includes(slice)) {
        best = length;
        break;
      }
    }
  }

  return best;
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

const daysBetweenInclusive = (start: Date, end: Date): number => {
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return days + 1;
};

const enumerateDateRange = (start: Date, totalDays: number): Date[] => {
  const dates: Date[] = [];

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = new Date(start.getTime());
    date.setUTCDate(start.getUTCDate() + offset);
    dates.push(date);
  }

  return dates;
};

const formatDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normaliseEventRef = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, LIVERC_BASE_ORIGIN);
    url.hash = '';
    url.search = '';
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
};

const normaliseText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const elementHasClass = (element: ParsedHTMLElement, className: string): boolean => {
  const classAttr = element.getAttribute('class');
  if (!classAttr) {
    return false;
  }

  return classAttr
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => token === className);
};

const parseWhenToIso = (raw: string, fallbackDate: Date): string | undefined => {
  const cleaned = normaliseText(raw);
  if (!cleaned) {
    return undefined;
  }

  const fallbackYear = fallbackDate.getUTCFullYear();
  const fallbackMonth = fallbackDate.getUTCMonth();
  const fallbackDay = fallbackDate.getUTCDate();
  const candidates: string[] = [];

  const sanitised = cleaned
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\bat\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  candidates.push(sanitised);

  if (!/\b\d{4}\b/.test(sanitised)) {
    candidates.push(`${sanitised} ${fallbackYear}`);
  }

  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const timeMatch = sanitised.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/i);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const meridiem = timeMatch[3]?.toLowerCase();

    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      let hours24 = hour % 24;

      if (meridiem === 'pm' && hours24 < 12) {
        hours24 += 12;
      } else if (meridiem === 'am' && hours24 === 12) {
        hours24 = 0;
      }

      const date = new Date(Date.UTC(fallbackYear, fallbackMonth, fallbackDay, hours24, minute));
      return date.toISOString();
    }
  }

  const simpleTime = sanitised.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (simpleTime) {
    const hour = Number(simpleTime[1]);
    const meridiem = simpleTime[2]?.toLowerCase();

    if (Number.isFinite(hour)) {
      let hours24 = hour % 12;
      if (meridiem === 'pm') {
        hours24 += 12;
      }

      const date = new Date(Date.UTC(fallbackYear, fallbackMonth, fallbackDay, hours24, 0));
      return date.toISOString();
    }
  }

  return undefined;
};

const parseIsoToMillis = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const compareWhenValues = (a: number | null, b: number | null): number => {
  if (a === null && b === null) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
};

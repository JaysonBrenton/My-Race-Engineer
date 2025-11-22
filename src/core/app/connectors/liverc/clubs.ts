/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/clubs.ts
 * Summary: Service that syncs LiveRC club catalogue data into persistent storage.
 */

import { HTMLElement as ParsedHTMLElement, parse } from 'node-html-parser';

// Ensure Node.js process.env is available for TypeScript
declare const process: {
  env: Record<string, string | undefined>;
};

import type { Logger } from '@core/app/ports/logger';
import type { ClubRepository, ClubSearchResult } from '@core/app/ports/clubRepository';

import type { LiveRcClient } from './client';

const LIVERC_HOST_SUFFIX = '.liverc.com';

type Dependencies = {
  client: Pick<LiveRcClient, 'getRootTrackList'>;
  repository: ClubRepository;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
  clock?: () => Date;
};

type ParsedClub = {
  liveRcSubdomain: string;
  displayName: string;
  country?: string | null;
  region?: string | null;
};

/**
 * Derives an optional per-sync club upsert limit from the environment so development
 * runs can cap the amount of work performed without altering discovery behaviour.
 * Returns null when the value is absent or invalid, preserving the default full sync.
 */
const getSyncLimitFromEnv = (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): number | null => {
  const rawLimit = process.env.LIVERC_SYNC_CLUB_LIMIT;
  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
    logger?.warn?.('Ignoring invalid LIVERC_SYNC_CLUB_LIMIT. Expected a positive integer.', {
      event: 'liverc.clubs.sync.limit_invalid',
      rawLimit,
    });
    return null;
  }

  return parsedLimit;
};

export class LiveRcClubCatalogueService {
  constructor(private readonly dependencies: Dependencies) {}

  async syncCatalogue(): Promise<{ upserted: number; deactivated: number }> {
    const startedAt = this.dependencies.clock?.() ?? new Date();
    this.dependencies.logger?.info?.('Starting LiveRC club catalogue sync.', {
      event: 'liverc.clubs.sync.start',
      outcome: 'in_progress',
      startedAt,
    });

    const limit = getSyncLimitFromEnv(this.dependencies.logger);
    let processedCount = 0;

    const html = await this.dependencies.client.getRootTrackList();
    // Parse the HTML directory into structured club records that we can
    // reconcile against the database.
    const parsedClubs = parseClubsFromHtml(html);
    const seenAt = this.dependencies.clock?.() ?? new Date();
    // Track which clubs appear in the latest sync so we can flag all other
    // records as inactive later.
    const seenSubdomains = new Set<string>();

    for (const club of parsedClubs) {
      if (limit !== null && processedCount >= limit) {
        this.dependencies.logger?.info?.('LiveRC club sync limit reached, stopping early.', {
          event: 'liverc.clubs.sync.limit_reached',
          outcome: 'partial',
          limit,
          processedCount,
        });
        break;
      }

      await this.dependencies.repository.upsertByLiveRcSubdomain({
        liveRcSubdomain: club.liveRcSubdomain,
        displayName: club.displayName,
        country: club.country ?? null,
        region: club.region ?? null,
        seenAt,
      });
      seenSubdomains.add(club.liveRcSubdomain);
      processedCount += 1;
    }

    let deactivatedCount = 0;
    if (limit === null) {
      deactivatedCount = await this.dependencies.repository.markInactiveClubsNotInSubdomains(
        Array.from(seenSubdomains),
      );
    } else {
      this.dependencies.logger?.info?.(
        'Skipping deactivation of clubs because a sync limit is in effect.',
        {
          event: 'liverc.clubs.sync.deactivate_skipped',
          outcome: 'partial',
          limit,
          processedCount,
        },
      );
    }

    this.dependencies.logger?.info?.('Completed LiveRC club catalogue sync.', {
      event: 'liverc.clubs.sync.complete',
      outcome: 'success',
      seenCount: seenSubdomains.size,
      upserted: processedCount,
      deactivatedCount,
      limit,
      durationMs: Date.now() - startedAt.getTime(),
    });

    return { upserted: processedCount, deactivated: deactivatedCount };
  }
}

type SearchDependencies = {
  repository: Pick<ClubRepository, 'searchByDisplayName'>;
};

export class LiveRcClubSearchService {
  constructor(private readonly dependencies: SearchDependencies) {}

  async search(query: string, limit = 10): Promise<ClubSearchResult[]> {
    const normalisedQuery = query.trim();
    // Return early for blank search terms so the repository is not asked to
    // issue unbounded queries that would only echo the entire catalogue.
    if (!normalisedQuery) {
      return [];
    }

    // Bound the requested limit to a small, predictable range to prevent
    // misuse from overwhelming the database while still giving the UI enough
    // results to power typeahead suggestions.
    const boundedLimit = Math.max(1, Math.min(limit, 25));

    return this.dependencies.repository.searchByDisplayName(normalisedQuery, boundedLimit);
  }
}

const parseClubsFromHtml = (html: string): ParsedClub[] => {
  const document = parse(html);
  // The live site uses <tr class="clickable-row"> rows in a table with class "track_list".
  // Fall back to the old selector for backward compatibility with fixtures.
  const primaryRows = document.querySelectorAll('table.track_list tbody tr.clickable-row');
  const rows =
    primaryRows.length > 0
      ? primaryRows
      : document.querySelectorAll('tr.clickable-row, [data-track-row]');
  // Use a map keyed by subdomain so duplicate rows (if any) collapse into a
  // single entry while preserving the latest parsed values.
  const clubs = new Map<string, ParsedClub>();

  for (const row of rows) {
    const link = findTrackLink(row);
    if (!link) {
      continue;
    }

    const href = link.getAttribute('href');
    const subdomain = extractSubdomainFromHref(href);
    if (!subdomain) {
      continue;
    }

    // Prefer the <strong> tag text if present (the new structure places club names there),
    // otherwise fall back to the link's textContent.
    const strongTag = link.querySelector('strong');
    let displayNameText = '';
    if (strongTag) {
      const strongTextRaw: unknown = strongTag.textContent;
      if (typeof strongTextRaw === 'string') {
        displayNameText = strongTextRaw;
      } else if (typeof strongTextRaw === 'number' || typeof strongTextRaw === 'boolean') {
        displayNameText = String(strongTextRaw);
      }
    }

    // If no <strong> text was found, fall back to the link's textContent.
    if (!displayNameText) {
      const linkTextRaw: unknown = link.textContent;
      if (typeof linkTextRaw === 'string') {
        displayNameText = linkTextRaw;
      } else if (typeof linkTextRaw === 'number' || typeof linkTextRaw === 'boolean') {
        displayNameText = String(linkTextRaw);
      }
    }

    const displayName = normaliseText(displayNameText);
    if (!displayName) {
      continue;
    }

    // The new HTML structure doesn't include location data in attributes.
    // Try the old structure for backward compatibility, but expect null values.
    const country = extractLocationAttribute(row, 'data-country');
    const region = extractLocationAttribute(row, 'data-region');

    clubs.set(subdomain, {
      liveRcSubdomain: subdomain,
      displayName,
      country,
      region,
    });
  }

  return Array.from(clubs.values());
};

const findTrackLink = (row: ParsedHTMLElement): ParsedHTMLElement | null => {
  // Prefer links with data-track-link attribute (old structure) or track-link class.
  const withDataAttr = row.querySelector('a[data-track-link]');
  if (withDataAttr) {
    return withDataAttr;
  }

  const withTrackLinkClass = row.querySelector('a.track-link');
  if (withTrackLinkClass) {
    return withTrackLinkClass;
  }

  // For the new structure, prefer links whose href points to a .liverc.com subdomain.
  const allLinks = row.querySelectorAll('a[href]');
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (href && extractSubdomainFromHref(href)) {
      return link;
    }
  }

  // Fall back to any anchor tag.
  return row.querySelector('a') ?? null;
};

const extractSubdomainFromHref = (href: string | null | undefined): string | null => {
  if (!href) {
    return null;
  }

  try {
    const resolved = new URL(href, 'https://live.liverc.com/');
    const host = resolved.hostname.toLowerCase();
    if (!host.endsWith(LIVERC_HOST_SUFFIX)) {
      return null;
    }

    // Strip the liverc.com suffix so only the subdomain remains. Nested
    // subdomains (e.g. region.club.liverc.com) are preserved as-is.
    const candidate = host.slice(0, host.length - LIVERC_HOST_SUFFIX.length);
    return candidate || null;
  } catch {
    return null;
  }
};

const extractLocationAttribute = (row: ParsedHTMLElement, attribute: string): string | null => {
  const direct = normaliseText(row.getAttribute(attribute));
  if (direct) {
    return direct;
  }

  const locationNode = row.querySelector('[data-track-location]');
  if (locationNode) {
    const fromLocation = normaliseText(locationNode.getAttribute(attribute));
    if (fromLocation) {
      return fromLocation;
    }

    // Some layouts nest attributes further down inside the location node, so
    // fall back to any descendant that exposes the requested data attribute.
    const nested = normaliseText(
      locationNode.querySelector(`[${attribute}]`)?.getAttribute(attribute),
    );
    if (nested) {
      return nested;
    }
  }

  return null;
};

const normaliseText = (value: string | undefined | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const __testing__ = {
  parseClubsFromHtml,
  extractSubdomainFromHref,
};

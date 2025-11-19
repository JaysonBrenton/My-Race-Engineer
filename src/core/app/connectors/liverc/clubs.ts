/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/clubs.ts
 * Summary: Service that syncs LiveRC club catalogue data into persistent storage.
 */

import { HTMLElement as ParsedHTMLElement, parse } from 'node-html-parser';

import type { Logger } from '@core/app/ports/logger';
import type { ClubRepository } from '@core/app/ports/clubRepository';

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

export class LiveRcClubCatalogueService {
  constructor(private readonly dependencies: Dependencies) {}

  async syncCatalogue(): Promise<{ upserted: number; deactivated: number }> {
    const startedAt = this.dependencies.clock?.() ?? new Date();
    this.dependencies.logger?.info?.('Starting LiveRC club catalogue sync.', {
      event: 'liverc.clubs.sync.start',
      outcome: 'in_progress',
      startedAt,
    });

    const html = await this.dependencies.client.getRootTrackList();
    // Parse the HTML directory into structured club records that we can
    // reconcile against the database.
    const parsedClubs = parseClubsFromHtml(html);
    const seenAt = this.dependencies.clock?.() ?? new Date();
    // Track which clubs appear in the latest sync so we can flag all other
    // records as inactive later.
    const seenSubdomains = new Set<string>();

    for (const club of parsedClubs) {
      seenSubdomains.add(club.liveRcSubdomain);
      await this.dependencies.repository.upsertByLiveRcSubdomain({
        liveRcSubdomain: club.liveRcSubdomain,
        displayName: club.displayName,
        country: club.country ?? null,
        region: club.region ?? null,
        seenAt,
      });
    }

    const deactivatedCount = await this.dependencies.repository.markInactiveClubsNotInSubdomains(
      Array.from(seenSubdomains),
    );

    this.dependencies.logger?.info?.('Completed LiveRC club catalogue sync.', {
      event: 'liverc.clubs.sync.complete',
      outcome: 'success',
      seenCount: seenSubdomains.size,
      deactivatedCount,
      durationMs: Date.now() - startedAt.getTime(),
    });

    return { upserted: seenSubdomains.size, deactivated: deactivatedCount };
  }
}

const parseClubsFromHtml = (html: string): ParsedClub[] => {
  const document = parse(html);
  const rows = document.querySelectorAll('[data-track-row]');
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

    // node-html-parser occasionally exposes text content as non-string values, so
    // coerce the node to a string before trimming.
    const linkTextRaw: unknown = link.text;
    let linkText = '';
    if (typeof linkTextRaw === 'string') {
      linkText = linkTextRaw;
    } else if (typeof linkTextRaw === 'number' || typeof linkTextRaw === 'boolean') {
      linkText = String(linkTextRaw);
    }
    const displayName = normaliseText(linkText);
    if (!displayName) {
      continue;
    }

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
  return (
    row.querySelector('a[data-track-link]') ??
    row.querySelector('a.track-link') ??
    row.querySelector('a')
  );
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

import { HTMLElement as ParsedHTMLElement, parse } from 'node-html-parser';

export type LiveRcEventSessionSummary = {
  sessionRef: string;
  title: string;
  className: string;
  roundLabel?: string;
  heatLabel?: string;
  type: 'QUAL' | 'MAIN';
  completedAt?: string;
};

export type LiveRcEventMetadata = {
  canonicalUrl: string;
  eventSlug: string;
  eventName: string;
};

export type LiveRcSessionResultRowSummary = {
  driverName: string;
  position?: number | null;
  carNumber?: string | null;
  laps?: number | null;
  totalTimeMs?: number | null;
  behindMs?: number | null;
  fastestLapMs?: number | null;
  fastestLapNum?: number | null;
  avgLapMs?: number | null;
  avgTop5Ms?: number | null;
  avgTop10Ms?: number | null;
  avgTop15Ms?: number | null;
  top3ConsecMs?: number | null;
  stdDevMs?: number | null;
  consistencyPct?: number | null;
};

export type LiveRcSessionResults = {
  sessionName: string;
  canonicalUrl: string | null;
  resultRows: LiveRcSessionResultRowSummary[];
};

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export function enumerateSessionsFromEventHtml(html: string): LiveRcEventSessionSummary[] {
  const root = parse(html, {
    lowerCaseTagName: false,
    blockTextElements: {
      script: true,
      style: true,
    },
  });

  const tables = root.querySelectorAll('table');
  if (tables.length === 0) {
    return [];
  }

  const sessions: LiveRcEventSessionSummary[] = [];

  for (const table of tables) {
    const heading = findNearestHeading(table);
    if (!heading) {
      continue;
    }

    const sectionMeta = deriveSectionMeta(heading.textContent ?? '');
    if (!sectionMeta) {
      continue;
    }

    const headers = readHeaderLabels(table);
    const bodyRows = table.querySelectorAll('tbody tr');

    for (const row of bodyRows) {
      if (!isDataRow(row)) {
        continue;
      }

      const link = row.querySelector('a[href]');
      if (!link) {
        continue;
      }

      const sessionRef = link.getAttribute('href')?.trim();
      if (!sessionRef) {
        continue;
      }

      const title = normaliseText(link.textContent ?? '');
      if (!title) {
        continue;
      }

      const cellInfos = collectCellInfos(row, headers);
      const className = cellInfos.get('class')?.text;
      if (!className) {
        continue;
      }

      const roundLabel = cellInfos.get('round')?.text ?? sectionMeta.roundLabel;
      const heatLabel = cellInfos.get('heat')?.text;
      const completedAt = extractCompletedAt(cellInfos.get('completed')?.element ?? null);

      sessions.push({
        sessionRef,
        title,
        className,
        roundLabel,
        heatLabel,
        type: sectionMeta.type,
        completedAt,
      });
    }
  }

  return sessions;
}

export function extractEventMetadataFromHtml(
  html: string,
  fallbackUrl: string,
): LiveRcEventMetadata {
  const root = parse(html, {
    lowerCaseTagName: false,
    blockTextElements: {
      script: true,
      style: true,
    },
  });

  const canonicalCandidate =
    root.querySelector("link[rel='canonical']")?.getAttribute('href') ??
    root.querySelector("meta[property='og:url']")?.getAttribute('content') ??
    fallbackUrl;

  const canonicalUrl = normaliseAbsoluteUrl(canonicalCandidate, fallbackUrl);
  const eventName = normaliseText(root.querySelector('h1')?.textContent ?? '') || canonicalUrl;
  const eventSlug = extractPathSegment(canonicalUrl, 1);

  return { canonicalUrl, eventSlug, eventName };
}

export function parseSessionResultsFromHtml(
  html: string,
  fallbackUrl?: string,
): LiveRcSessionResults {
  const root = parse(html, {
    lowerCaseTagName: false,
    blockTextElements: {
      script: true,
      style: true,
    },
  });

  const canonicalCandidate =
    root.querySelector("link[rel='canonical']")?.getAttribute('href') ??
    root.querySelector("meta[property='og:url']")?.getAttribute('content') ??
    null;

  const canonicalUrl = canonicalCandidate
    ? normaliseAbsoluteUrl(canonicalCandidate, fallbackUrl)
    : (fallbackUrl ?? null);
  const sessionName =
    normaliseText(root.querySelector('h1')?.textContent ?? '') || (canonicalUrl ?? '');

  const table = findResultsTable(root);
  if (!table) {
    return { sessionName, canonicalUrl, resultRows: [] };
  }

  const headers = readHeaderLabels(table);
  const bodyRows = table.querySelectorAll('tbody tr');
  const resultRows: LiveRcSessionResultRowSummary[] = [];

  for (const row of bodyRows) {
    if (!isDataRow(row)) {
      continue;
    }

    const infos = collectResultCellInfos(row, headers);
    const driverName = infos.get('driver')?.text ?? '';
    if (!driverName) {
      continue;
    }

    resultRows.push({
      driverName,
      position: parseInteger(infos.get('position')?.text),
      carNumber: normaliseOptionalText(infos.get('carNumber')?.text),
      laps: parseInteger(infos.get('laps')?.text),
      totalTimeMs: parseDurationToMilliseconds(infos.get('totalTime')?.text),
      behindMs: parseBehindToMilliseconds(infos.get('behind')?.text),
      fastestLapMs: parseDurationToMilliseconds(infos.get('fastestLap')?.text),
      fastestLapNum: parseInteger(infos.get('fastestLapNum')?.text),
      avgLapMs: parseDurationToMilliseconds(infos.get('avgLap')?.text),
      avgTop5Ms: parseDurationToMilliseconds(infos.get('avgTop5')?.text),
      avgTop10Ms: parseDurationToMilliseconds(infos.get('avgTop10')?.text),
      avgTop15Ms: parseDurationToMilliseconds(infos.get('avgTop15')?.text),
      top3ConsecMs: parseDurationToMilliseconds(infos.get('top3Consec')?.text),
      stdDevMs: parseDurationToMilliseconds(infos.get('stdDev')?.text),
      consistencyPct: parsePercentage(infos.get('consistency')?.text),
    });
  }

  return { sessionName, canonicalUrl, resultRows };
}

function findNearestHeading(element: ParsedHTMLElement): ParsedHTMLElement | null {
  let current: ParsedHTMLElement | null = element;
  while (current) {
    let sibling: ParsedHTMLElement | null | undefined = current.previousElementSibling;
    while (sibling) {
      if (sibling instanceof ParsedHTMLElement) {
        if (isHeading(sibling)) {
          return sibling;
        }

        const nested = sibling.querySelector(HEADING_SELECTOR);
        if (nested instanceof ParsedHTMLElement) {
          return nested;
        }
      }

      sibling = sibling.previousElementSibling;
    }

    const parentNode: unknown = current.parentNode;
    current = parentNode instanceof ParsedHTMLElement ? parentNode : null;
  }

  return null;
}

function isHeading(node: ParsedHTMLElement): boolean {
  return /^H[1-6]$/i.test(node.tagName);
}

type SectionMeta = {
  type: 'QUAL' | 'MAIN';
  roundLabel?: string;
};

function deriveSectionMeta(rawHeading: string): SectionMeta | null {
  const heading = normaliseText(rawHeading).toLowerCase();
  if (!heading) {
    return null;
  }

  if (heading.includes('main event')) {
    return { type: 'MAIN' };
  }

  if (heading.includes('qualifier')) {
    const roundMatch = /round\s+([\w-]+)/i.exec(rawHeading);
    const roundLabel = roundMatch ? `Round ${roundMatch[1]}` : undefined;
    return { type: 'QUAL', roundLabel };
  }

  return null;
}

function readHeaderLabels(table: ParsedHTMLElement): string[] {
  const headers = table.querySelectorAll('thead tr th');
  return headers.map((header) => normaliseText(header.textContent ?? ''));
}

type CellInfo = {
  key: string | null;
  text: string;
  element: ParsedHTMLElement;
};

function collectCellInfos(row: ParsedHTMLElement, headers: string[]): Map<string, CellInfo> {
  const infos = new Map<string, CellInfo>();
  const cells = row.querySelectorAll('td');

  cells.forEach((cell, index) => {
    const headerLabel = headers[index] ?? '';
    const key = normaliseHeaderKey(
      cell.getAttribute('data-label') ?? cell.getAttribute('aria-label') ?? headerLabel,
    );
    const text = normaliseText(cell.textContent ?? '');
    const info: CellInfo = { key, text, element: cell };

    if (!key) {
      return;
    }

    if (!infos.has(key)) {
      infos.set(key, info);
    }
  });

  return infos;
}

function normaliseHeaderKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const value = normaliseText(raw).toLowerCase();
  if (!value) {
    return null;
  }

  if (value.includes('class')) {
    return 'class';
  }

  if (value.includes('round')) {
    return 'round';
  }

  if (value.includes('heat')) {
    return 'heat';
  }

  if (
    value.includes('time') ||
    value.includes('finish') ||
    value.includes('completed') ||
    value.includes('done')
  ) {
    return 'completed';
  }

  if (
    value.includes('race') ||
    value.includes('event') ||
    value.includes('title') ||
    value.includes('session')
  ) {
    return 'title';
  }

  return value;
}

function extractCompletedAt(cell: ParsedHTMLElement | null): string | undefined {
  if (!cell) {
    return undefined;
  }

  const attributeCandidates = collectAttributeCandidates(cell, [
    'datetime',
    'data-datetime',
    'data-time',
    'data-utc',
    'data-timestamp',
    'data-value',
    'title',
  ]);

  for (const candidate of attributeCandidates) {
    const parsed = parseIsoCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const text = normaliseText(cell.textContent ?? '');
  const parsedText = parseIsoCandidate(text);
  if (parsedText) {
    return parsedText;
  }

  return undefined;
}

function collectAttributeCandidates(node: ParsedHTMLElement, attributeNames: string[]): string[] {
  const values: string[] = [];

  for (const attributeName of attributeNames) {
    const value = node.getAttribute(attributeName);
    if (value) {
      values.push(value);
    }
  }

  node.querySelectorAll('*').forEach((child) => {
    if (!(child instanceof ParsedHTMLElement)) {
      return;
    }

    for (const attributeName of attributeNames) {
      const value = child.getAttribute(attributeName);
      if (value) {
        values.push(value);
      }
    }
  });

  return values;
}

function parseIsoCandidate(candidate: string | undefined | null): string | undefined {
  if (!candidate) {
    return undefined;
  }

  const value = candidate.trim();
  if (!value) {
    return undefined;
  }

  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(value) && !/[tT]/.test(value)) {
    normalized = value.replace(' ', 'T');
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized = `${normalized}Z`;
    }
  }

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) ||
    /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
  ) {
    const timestamp = Date.parse(normalized);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return undefined;
}

function isDataRow(row: ParsedHTMLElement): boolean {
  const cells = row.querySelectorAll('td');
  if (cells.length === 0) {
    return false;
  }

  if (cells.length === 1) {
    const colspan = cells[0].getAttribute('colspan');
    if (colspan && Number.parseInt(colspan, 10) > 1) {
      return false;
    }
  }

  return true;
}

function normaliseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normaliseOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normaliseText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function findResultsTable(root: ParsedHTMLElement): ParsedHTMLElement | null {
  const tables = root.querySelectorAll('table');
  for (const table of tables) {
    const headers = readHeaderLabels(table).map((header) => header.toLowerCase());
    if (headers.some((header) => header.includes('driver'))) {
      return table;
    }
  }

  return null;
}

type ResultCellInfo = {
  key: string | null;
  text: string;
  element: ParsedHTMLElement;
};

function collectResultCellInfos(
  row: ParsedHTMLElement,
  headers: string[],
): Map<string, ResultCellInfo> {
  const infos = new Map<string, ResultCellInfo>();
  const cells = row.querySelectorAll('td');

  cells.forEach((cell, index) => {
    const headerLabel = headers[index] ?? '';
    const key = normaliseResultHeaderKey(
      cell.getAttribute('data-label') ?? cell.getAttribute('aria-label') ?? headerLabel,
    );
    const text = normaliseText(cell.textContent ?? '');
    const info: ResultCellInfo = { key, text, element: cell };

    if (!key) {
      return;
    }

    if (!infos.has(key)) {
      infos.set(key, info);
    }
  });

  return infos;
}

function normaliseResultHeaderKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const value = normaliseText(raw).toLowerCase();
  if (!value) {
    return null;
  }

  if (value.includes('pos')) {
    return 'position';
  }

  if (value.includes('driver')) {
    return 'driver';
  }

  if (value.includes('car')) {
    return 'carNumber';
  }

  if (value === 'laps' || value.includes('lap count')) {
    return 'laps';
  }

  if (value.includes('race') || value.includes('total')) {
    return 'totalTime';
  }

  if (value.includes('interval') || value.includes('behind')) {
    return 'behind';
  }

  if (value.includes('fast') && value.includes('#')) {
    return 'fastestLapNum';
  }

  if (value.includes('fast') && value.includes('lap')) {
    return 'fastestLap';
  }

  if (value.includes('avg') && value.includes('top 5')) {
    return 'avgTop5';
  }

  if (value.includes('avg') && value.includes('top 10')) {
    return 'avgTop10';
  }

  if (value.includes('avg') && value.includes('top 15')) {
    return 'avgTop15';
  }

  if (value.includes('avg') && value.includes('lap')) {
    return 'avgLap';
  }

  if (value.includes('top 3') && value.includes('con')) {
    return 'top3Consec';
  }

  if (value.includes('std') && value.includes('dev')) {
    return 'stdDev';
  }

  if (value.includes('consistency')) {
    return 'consistency';
  }

  return null;
}

function parseInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/-?\d+/);
  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[0] ?? '', 10);
  return Number.isNaN(value) ? undefined : value;
}

function parseDurationToMilliseconds(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = raw.replace(/[^0-9:+.\-]/g, '').trim();
  if (!value) {
    return undefined;
  }

  const segments = value.split(':');
  if (segments.length === 1) {
    const seconds = Number.parseFloat(segments[0] ?? '');
    return Number.isNaN(seconds) ? undefined : Math.round(seconds * 1000);
  }

  let totalSeconds = 0;
  let multiplier = 1;

  const lastSegment = segments.pop();
  const seconds = Number.parseFloat(lastSegment ?? '');
  if (Number.isNaN(seconds)) {
    return undefined;
  }

  totalSeconds += seconds;
  multiplier = 60;

  while (segments.length > 0) {
    const segment = segments.pop();
    const part = Number.parseInt(segment ?? '', 10);
    if (Number.isNaN(part)) {
      return undefined;
    }

    totalSeconds += part * multiplier;
    multiplier *= 60;
  }

  return Math.round(totalSeconds * 1000);
}

function parseBehindToMilliseconds(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  if (/lap/i.test(raw)) {
    return undefined;
  }

  const normalised = raw.replace(/^\+/, '').trim();
  return parseDurationToMilliseconds(normalised);
}

function parsePercentage(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  const value = Number.parseFloat(match[0] ?? '');
  return Number.isNaN(value) ? undefined : value;
}

function extractPathSegment(url: string, offsetFromResults: number): string {
  const segments = getResultPathSegments(url);
  const resultsIndex = segments.indexOf('results');

  if (resultsIndex === -1) {
    throw new Error('LiveRC URL is missing /results/ segment.');
  }

  const targetIndex = resultsIndex + offsetFromResults;
  const segment = segments[targetIndex];

  if (!segment) {
    throw new Error('LiveRC URL is missing expected path segment.');
  }

  return segment;
}

function getResultPathSegments(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

function normaliseAbsoluteUrl(candidate: string | null | undefined, fallbackUrl?: string): string {
  try {
    if (candidate) {
      return new URL(candidate, fallbackUrl).toString();
    }

    if (fallbackUrl) {
      return new URL(fallbackUrl).toString();
    }
  } catch {
    // ignore failures and fall back below
  }

  if (fallbackUrl) {
    return fallbackUrl;
  }

  throw new Error('LiveRC URL could not be normalised.');
}

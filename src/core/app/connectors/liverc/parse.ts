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

function findNearestHeading(element: ParsedHTMLElement): ParsedHTMLElement | null {
  let current: ParsedHTMLElement | null = element;
  while (current) {
    let sibling = current.previousElementSibling as ParsedHTMLElement | null;
    while (sibling) {
      if (isHeading(sibling)) {
        return sibling;
      }

      const nested = sibling.querySelector(HEADING_SELECTOR) as ParsedHTMLElement | null;
      if (nested) {
        return nested;
      }

      sibling = sibling.previousElementSibling as ParsedHTMLElement | null;
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

  if (value.includes('time') || value.includes('finish') || value.includes('completed') || value.includes('done')) {
    return 'completed';
  }

  if (value.includes('race') || value.includes('event') || value.includes('title') || value.includes('session')) {
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

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) || /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
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

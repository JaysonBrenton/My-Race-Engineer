export const LiveRcUrlInvalidReasons = {
  INVALID_ABSOLUTE_URL: 'LiveRC import requires an absolute URL.',
  INVALID_RESULTS_PATH: 'LiveRC URL must point to a JSON results endpoint under /results/.',
  INCOMPLETE_RESULTS_SEGMENTS:
    'LiveRC results URL must include event, class, round, and race segments.',
  EXTRA_SEGMENTS: 'LiveRC results URL must not include extra path segments after the race slug.',
  EMPTY_SEGMENT: 'LiveRC results URL must not include empty path segments.',
  EMPTY_SLUG: 'LiveRC results URL contains a segment that resolves to an empty slug.',
} as const;

export type LiveRcUrlInvalidReason =
  (typeof LiveRcUrlInvalidReasons)[keyof typeof LiveRcUrlInvalidReasons];

export type LiveRcJsonUrlParseResult = {
  type: 'json';
  slugs: [string, string, string, string];
  canonicalJsonPath: string;
  origin: string;
  resultsBaseUrl: string;
};

export type LiveRcHtmlUrlParseResult = {
  type: 'html';
};

export type LiveRcInvalidUrlParseResult = {
  type: 'invalid';
  reasonIfInvalid: LiveRcUrlInvalidReason;
};

export type LiveRcUrlParseResult =
  | LiveRcJsonUrlParseResult
  | LiveRcHtmlUrlParseResult
  | LiveRcInvalidUrlParseResult;

const normaliseSegment = (segment: string, { isRaceSegment }: { isRaceSegment: boolean }) => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return { ok: false as const, reason: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL };
  }

  const trimmed = decoded.trim();
  if (!trimmed) {
    return { ok: false as const, reason: LiveRcUrlInvalidReasons.EMPTY_SEGMENT };
  }

  const withoutJsonSuffix = isRaceSegment ? trimmed.replace(/\.json$/i, '') : trimmed;

  if (!withoutJsonSuffix.trim()) {
    return { ok: false as const, reason: LiveRcUrlInvalidReasons.EMPTY_SLUG };
  }

  return { ok: true as const, slug: withoutJsonSuffix.trim() };
};

export const parseLiveRcUrl = (input: string): LiveRcUrlParseResult => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(input);
  } catch {
    return { type: 'invalid', reasonIfInvalid: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL };
  }

  const legacyPage = parsedUrl.searchParams.get('p');
  if (legacyPage?.toLowerCase() === 'view_race_result') {
    const id = parsedUrl.searchParams.get('id');
    if (id && id.trim().length > 0) {
      return { type: 'html' };
    }
  }

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  const resultsIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'results');

  if (resultsIndex === -1) {
    return { type: 'invalid', reasonIfInvalid: LiveRcUrlInvalidReasons.INVALID_RESULTS_PATH };
  }

  const afterResults = pathSegments.slice(resultsIndex + 1);

  if (afterResults.length === 0) {
    return {
      type: 'invalid',
      reasonIfInvalid: LiveRcUrlInvalidReasons.INCOMPLETE_RESULTS_SEGMENTS,
    };
  }

  if (afterResults.length < 4) {
    return {
      type: 'invalid',
      reasonIfInvalid: LiveRcUrlInvalidReasons.INCOMPLETE_RESULTS_SEGMENTS,
    };
  }

  if (afterResults.length > 4) {
    return { type: 'invalid', reasonIfInvalid: LiveRcUrlInvalidReasons.EXTRA_SEGMENTS };
  }

  const normalisedSlugs: string[] = [];
  for (let index = 0; index < afterResults.length; index += 1) {
    const segment = afterResults[index];
    const normalised = normaliseSegment(segment, {
      isRaceSegment: index === afterResults.length - 1,
    });

    if (!normalised.ok) {
      return { type: 'invalid', reasonIfInvalid: normalised.reason };
    }

    normalisedSlugs.push(normalised.slug);
  }

  const slugs = normalisedSlugs as [string, string, string, string];
  const baseSegments = pathSegments.slice(0, resultsIndex + 1);
  const canonicalSegments = baseSegments.concat(
    slugs.map((slug, index) => (index === slugs.length - 1 ? `${slug}.json` : slug)),
  );

  const canonicalJsonPath = `/${canonicalSegments.join('/')}`;

  const resultsBaseUrl = `${parsedUrl.origin}/${baseSegments.join('/')}`.replace(/\/+$/, '');

  return {
    type: 'json',
    slugs,
    canonicalJsonPath,
    origin: parsedUrl.origin,
    resultsBaseUrl,
  };
};

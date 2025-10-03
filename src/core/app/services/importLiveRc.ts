import { createHash } from 'node:crypto';

import type {
  EntrantRepository,
  EntrantUpsertInput,
  EventRepository,
  EventUpsertInput,
  LapRepository,
  LapUpsertInput,
  LiveRcClient,
  LiveRcEntryListEntry,
  LiveRcEntryListResponse,
  LiveRcRaceResultResponse,
  RaceClassRepository,
  RaceClassUpsertInput,
  SessionRepository,
  SessionUpsertInput,
} from '@core/app';

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const toTitleFromSlug = (slug: string) =>
  normalizeWhitespace(
    slug
      .split(/[/-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' '),
  );

const hasExplicitTimezone = (value: string) =>
  /(Z|[+-]\d{2}:?\d{2})$/i.test(value.replace(/\s+/g, ''));

const normaliseIsoTimezone = (value: string) => {
  let normalised = value;

  if (!normalised.includes('T') && normalised.includes(' ')) {
    normalised = normalised.replace(' ', 'T');
  }

  const offsetMatch = normalised.match(/([+-])(\d{2})(\d{2})$/);
  if (offsetMatch) {
    const [, sign, hours, minutes] = offsetMatch;
    normalised = `${normalised.slice(0, -offsetMatch[0].length)}${sign}${hours}:${minutes}`;
  }

  return normalised;
};

const parseDateOrNull = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || !hasExplicitTimezone(trimmed)) {
    return null;
  }

  const normalised = normaliseIsoTimezone(trimmed);
  const parsed = new Date(normalised);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDisplayName = (value: string) => normalizeWhitespace(value.normalize('NFC'));

const buildLapId = (parts: {
  eventId: string;
  sessionId: string;
  raceId: string;
  driverId: string;
  lapNumber: number;
}) =>
  createHash('sha256')
    .update(
      `${parts.eventId}|${parts.sessionId}|${parts.raceId}|${parts.driverId}|${parts.lapNumber}`,
    )
    .digest('hex');

type ParsedLiveRcUrl = {
  eventSlug: string;
  classSlug: string;
  roundSlug: string;
  raceSlug: string;
};

export type LiveRcImportOptions = {
  includeOutlaps?: boolean;
};

export type LiveRcImportSummary = {
  eventId: string;
  eventName: string;
  raceClassId: string;
  raceClassName: string;
  sessionId: string;
  sessionName: string;
  raceId: string;
  roundId: string;
  entrantsProcessed: number;
  lapsImported: number;
  skippedLapCount: number;
  skippedEntrantCount: number;
  skippedOutlapCount: number;
  sourceUrl: string;
  includeOutlaps: boolean;
};

type ImportDependencies = {
  liveRcClient: LiveRcClient;
  eventRepository: EventRepository;
  raceClassRepository: RaceClassRepository;
  sessionRepository: SessionRepository;
  entrantRepository: EntrantRepository;
  lapRepository: LapRepository;
};

export class LiveRcImportError extends Error {
  readonly status: number;

  readonly code: string;

  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: { status: number; code: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'LiveRcImportError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class LiveRcImportService {
  private readonly liveRcClient: LiveRcClient;

  private readonly eventRepository: EventRepository;

  private readonly raceClassRepository: RaceClassRepository;

  private readonly sessionRepository: SessionRepository;

  private readonly entrantRepository: EntrantRepository;

  private readonly lapRepository: LapRepository;

  constructor(dependencies: ImportDependencies) {
    this.liveRcClient = dependencies.liveRcClient;
    this.eventRepository = dependencies.eventRepository;
    this.raceClassRepository = dependencies.raceClassRepository;
    this.sessionRepository = dependencies.sessionRepository;
    this.entrantRepository = dependencies.entrantRepository;
    this.lapRepository = dependencies.lapRepository;
  }

  async importFromUrl(
    url: string,
    options: LiveRcImportOptions = {},
  ): Promise<LiveRcImportSummary> {
    const includeOutlaps = options.includeOutlaps ?? false;
    const parsedUrl = this.parseLiveRcUrl(url);

    const [entryList, raceResult] = await Promise.all([
      this.liveRcClient.fetchEntryList({
        eventSlug: parsedUrl.eventSlug,
        classSlug: parsedUrl.classSlug,
      }),
      this.liveRcClient.fetchRaceResult({
        eventSlug: parsedUrl.eventSlug,
        classSlug: parsedUrl.classSlug,
        roundSlug: parsedUrl.roundSlug,
        raceSlug: parsedUrl.raceSlug,
      }),
    ]);

    const event = await this.persistEvent(entryList, raceResult, parsedUrl);
    const raceClass = await this.persistRaceClass(event.id, entryList, raceResult, parsedUrl);
    const session = await this.persistSession(event.id, raceClass.id, raceResult, parsedUrl, url);

    const entryMap = this.buildEntryMap(entryList.entries);

    let entrantsProcessed = 0;
    let lapsImported = 0;
    let skippedLapCount = 0;
    let skippedEntrantCount = 0;
    let skippedOutlapCount = 0;

    const groupedLaps = this.groupLapsByEntry(raceResult, includeOutlaps);
    skippedLapCount += groupedLaps.skipped;
    skippedOutlapCount += groupedLaps.skippedOutlaps;

    for (const [entryId, laps] of groupedLaps.lapsByEntry.entries()) {
      const entry = entryMap.get(entryId);
      if (!entry) {
        skippedEntrantCount += 1;
        skippedLapCount += laps.length;
        console.warn(
          '[LiveRcImportService] Skipping laps with no matching entry list row',
          {
            entryId,
            lapsSkipped: laps.length,
          },
        );
        continue;
      }
      if (entry.withdrawn) {
        continue;
      }

      const entrant = await this.persistEntrant({
        eventId: event.id,
        raceClassId: raceClass.id,
        sessionId: session.id,
        entryId,
        entry,
        representativeLap: laps[0],
      });

      const lapInputs: LapUpsertInput[] = laps
        .map((lap) =>
          this.mapLapToUpsert({
            lap,
            entrantId: entrant.id,
            sessionId: session.id,
            raceId: raceResult.raceId,
            upstreamSessionId: session.source.sessionId,
            upstreamEventId: raceResult.eventId,
          }),
        )
        .filter((lap): lap is LapUpsertInput => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);

      await this.lapRepository.replaceForEntrant(entrant.id, session.id, lapInputs);

      if (lapInputs.length > 0) {
        entrantsProcessed += 1;
        lapsImported += lapInputs.length;
      }
    }

    return {
      eventId: event.id,
      eventName: event.name,
      raceClassId: raceClass.id,
      raceClassName: raceClass.name,
      sessionId: session.id,
      sessionName: session.name,
      raceId: raceResult.raceId,
      roundId: raceResult.roundId ?? parsedUrl.roundSlug,
      entrantsProcessed,
      lapsImported,
      skippedLapCount,
      skippedEntrantCount,
      skippedOutlapCount,
      sourceUrl: url,
      includeOutlaps,
    };
  }

  private parseLiveRcUrl(url: string): ParsedLiveRcUrl {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch (error) {
      throw new LiveRcImportError('LiveRC import requires a valid URL.', {
        status: 400,
        code: 'INVALID_URL',
        details: { url },
      });
    }

    if (!parsed.pathname.includes('/results/')) {
      throw new LiveRcImportError('LiveRC URL must point to a results page.', {
        status: 400,
        code: 'UNSUPPORTED_URL',
        details: { url },
      });
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const resultsIndex = segments.indexOf('results');
    const relevant = segments.slice(resultsIndex + 1);

    if (relevant.length < 4) {
      throw new LiveRcImportError(
        'LiveRC URL must include event, class, round, and race segments.',
        {
          status: 400,
          code: 'INCOMPLETE_URL',
          details: { url },
        },
      );
    }

    const [eventSlug, classSlug, roundSlug, ...raceSegments] = relevant;

    if (!raceSegments.length) {
      throw new LiveRcImportError('LiveRC URL missing race segment.', {
        status: 400,
        code: 'INCOMPLETE_URL',
        details: { url },
      });
    }

    const raceSlugWithExtension = raceSegments.join('/');
    const raceSlug = this.normalizeSlug(raceSlugWithExtension);

    return { eventSlug, classSlug, roundSlug, raceSlug };
  }

  private normalizeSlug(slug: string) {
    if (slug.toLowerCase().endsWith('.json')) {
      return slug.slice(0, -'.json'.length);
    }

    return slug;
  }

  private async persistEvent(
    entryList: LiveRcEntryListResponse,
    raceResult: LiveRcRaceResultResponse,
    parsedUrl: ParsedLiveRcUrl,
  ) {
    const eventInput: EventUpsertInput = {
      sourceEventId: raceResult.eventId || entryList.eventId || parsedUrl.eventSlug,
      sourceUrl: `https://liverc.com/results/${parsedUrl.eventSlug}`,
      name: normalizeWhitespace(
        (raceResult.eventName ?? entryList.eventName ?? toTitleFromSlug(parsedUrl.eventSlug)) ||
          toTitleFromSlug(parsedUrl.eventSlug),
      ),
    };

    return this.eventRepository.upsertBySource(eventInput);
  }

  private async persistRaceClass(
    eventId: string,
    entryList: LiveRcEntryListResponse,
    raceResult: LiveRcRaceResultResponse,
    parsedUrl: ParsedLiveRcUrl,
  ) {
    const classCode = normalizeWhitespace(
      (entryList.classCode ?? raceResult.classCode ?? parsedUrl.classSlug).toUpperCase(),
    );

    const raceClassInput: RaceClassUpsertInput = {
      eventId,
      classCode,
      sourceUrl: `https://liverc.com/results/${parsedUrl.eventSlug}/${parsedUrl.classSlug}`,
      name: raceResult.className ?? entryList.className ?? toTitleFromSlug(parsedUrl.classSlug),
    };

    return this.raceClassRepository.upsertBySource(raceClassInput);
  }

  private async persistSession(
    eventId: string,
    raceClassId: string,
    raceResult: LiveRcRaceResultResponse,
    parsedUrl: ParsedLiveRcUrl,
    sourceUrl: string,
  ) {
    const upstreamSessionId = [raceResult.roundId ?? parsedUrl.roundSlug, raceResult.raceId]
      .filter(Boolean)
      .join(':');

    const sessionInput: SessionUpsertInput = {
      eventId,
      raceClassId,
      sourceSessionId: upstreamSessionId,
      sourceUrl,
      name: raceResult.raceName ?? toTitleFromSlug(parsedUrl.raceSlug),
      scheduledStart: parseDateOrNull(raceResult.startTimeUtc),
    };

    return this.sessionRepository.upsertBySource(sessionInput);
  }

  private async persistEntrant(params: {
    eventId: string;
    raceClassId: string;
    sessionId: string;
    entryId: string;
    entry?: LiveRcEntryListEntry;
    representativeLap: LiveRcRaceResultResponse['laps'][number];
  }) {
    const displayNameSource = params.entry?.displayName ?? params.representativeLap.driverName;
    const displayName = normalizeDisplayName(displayNameSource);

    const entrantInput: EntrantUpsertInput = {
      eventId: params.eventId,
      raceClassId: params.raceClassId,
      sessionId: params.sessionId,
      displayName,
      carNumber: params.entry?.carNumber ?? null,
      sourceEntrantId: params.entry?.entryId ?? params.entryId,
      sourceTransponderId: params.entry?.sourceTransponderId ?? null,
    };

    return this.entrantRepository.upsertBySource(entrantInput);
  }

  private buildEntryMap(entries: LiveRcEntryListEntry[]) {
    return new Map(entries.map((entry) => [entry.entryId, entry]));
  }

  private groupLapsByEntry(
    raceResult: LiveRcRaceResultResponse,
    includeOutlaps: boolean,
  ): {
    lapsByEntry: Map<string, LiveRcRaceResultResponse['laps']>;
    skipped: number;
    skippedOutlaps: number;
  } {
    const lapsByEntry = new Map<string, LiveRcRaceResultResponse['laps']>();
    let skipped = 0;
    let skippedOutlaps = 0;

    for (const lap of raceResult.laps) {
      if (!includeOutlaps && lap.isOutlap) {
        skippedOutlaps += 1;
        continue;
      }

      if (lap.lapTimeSeconds <= 0) {
        skipped += 1;
        continue;
      }

      if (!lapsByEntry.has(lap.entryId)) {
        lapsByEntry.set(lap.entryId, []);
      }

      lapsByEntry.get(lap.entryId)?.push(lap);
    }

    for (const lapList of lapsByEntry.values()) {
      lapList.sort((a, b) => a.lapNumber - b.lapNumber);
    }

    return { lapsByEntry, skipped, skippedOutlaps };
  }

  private mapLapToUpsert(params: {
    lap: LiveRcRaceResultResponse['laps'][number];
    entrantId: string;
    sessionId: string;
    raceId: string;
    upstreamSessionId: string;
    upstreamEventId: string;
  }): LapUpsertInput | null {
    const lapTimeMs = Math.round(params.lap.lapTimeSeconds * 1000);

    if (!Number.isFinite(lapTimeMs) || lapTimeMs <= 0) {
      return null;
    }

    return {
      id: buildLapId({
        eventId: params.upstreamEventId,
        sessionId: params.upstreamSessionId,
        raceId: params.raceId,
        driverId: params.lap.entryId,
        lapNumber: params.lap.lapNumber,
      }),
      entrantId: params.entrantId,
      sessionId: params.sessionId,
      lapNumber: params.lap.lapNumber,
      lapTimeMs,
    } satisfies LapUpsertInput;
  }
}

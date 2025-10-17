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
  Logger,
  RaceClassRepository,
  RaceClassUpsertInput,
  SessionRepository,
  SessionUpsertInput,
} from '@core/app';
import type { Entrant } from '@core/domain';
import { parseRaceResultPayload, type LiveRcRaceContext } from '../liverc/responseMappers';
import { buildLapId } from '../connectors/liverc/lapId';
import { buildUploadNamespaceSeed, type UploadNamespaceMetadata } from '../liverc/uploadNamespace';

import {
  LiveRcUrlInvalidReasons,
  type LiveRcUrlInvalidReason,
  parseLiveRcUrl,
} from '../../liverc/urlParser';

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const toTitleFromSlug = (slug: string) =>
  normalizeWhitespace(
    slug
      .split(/[/-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' '),
  );

const normaliseResultsBaseUrl = (value: string | undefined) => {
  if (!value || value.trim().length === 0) {
    return 'https://liverc.com/results';
  }

  return value.replace(/\/+$/, '');
};

const buildResultsUrl = (base: string | undefined, segments: string[]) => {
  const normalisedBase = normaliseResultsBaseUrl(base);
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `${normalisedBase}/${encodedSegments.join('/')}`;
};

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

export type UploadImportMetadata = UploadNamespaceMetadata & {
  namespaceSeed?: string;
};

export type LiveRcImportOptions = {
  includeOutlaps?: boolean;
  logger?: Logger;
  uploadMetadata?: UploadImportMetadata;
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
  logger: Logger;
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

  private readonly logger: Logger;

  constructor(dependencies: ImportDependencies) {
    this.liveRcClient = dependencies.liveRcClient;
    this.eventRepository = dependencies.eventRepository;
    this.raceClassRepository = dependencies.raceClassRepository;
    this.sessionRepository = dependencies.sessionRepository;
    this.entrantRepository = dependencies.entrantRepository;
    this.lapRepository = dependencies.lapRepository;
    this.logger = dependencies.logger;
  }

  async importFromUrl(
    url: string,
    options: LiveRcImportOptions = {},
  ): Promise<LiveRcImportSummary> {
    const includeOutlaps = options.includeOutlaps ?? false;
    const parsedUrl = this.ensureJsonResultsUrl(url);
    const resultsBaseUrl = normaliseResultsBaseUrl(parsedUrl.resultsBaseUrl);

    const [entryList, raceResult] = await Promise.all([
      this.liveRcClient.fetchEntryList({
        resultsBaseUrl,
        eventSlug: parsedUrl.eventSlug,
        classSlug: parsedUrl.classSlug,
      }),
      this.liveRcClient.fetchRaceResult({
        resultsBaseUrl,
        eventSlug: parsedUrl.eventSlug,
        classSlug: parsedUrl.classSlug,
        roundSlug: parsedUrl.roundSlug,
        raceSlug: parsedUrl.raceSlug,
      }),
    ]);

    const logger = options.logger ?? this.logger;

    return this.executeImport(
      {
        entryList,
        raceResult,
        parsedContext: parsedUrl,
        sourceUrl: url,
        includeOutlaps,
      },
      logger,
    );
  }

  async importFromPayload(
    payload: unknown,
    options: LiveRcImportOptions = {},
  ): Promise<LiveRcImportSummary> {
    const includeOutlaps = options.includeOutlaps ?? false;
    const namespaceSeed =
      options.uploadMetadata?.namespaceSeed ?? buildUploadNamespaceSeed(options.uploadMetadata);

    const parsed = parseRaceResultPayload(payload, {
      ...(namespaceSeed ? { fallbackContext: { uploadNamespace: namespaceSeed } } : {}),
    });

    const hasValidationIssues = parsed.missingIdentifiers.length > 0 || parsed.hasLapData === false;

    if (hasValidationIssues) {
      throw new LiveRcImportError('LiveRC race result payload is missing required fields.', {
        status: 422,
        code: 'INVALID_RACE_RESULT_PAYLOAD',
        details: {
          missingIdentifiers: parsed.missingIdentifiers,
          hasLapData: parsed.hasLapData,
        },
      });
    }

    const entryList = this.buildEntryListFromRaceResult(parsed.raceResult);
    const sourceUrl = this.buildUploadedSourceUrl(
      parsed.context,
      options.uploadMetadata,
      namespaceSeed,
    );

    const logger = options.logger ?? this.logger;

    return this.executeImport(
      {
        entryList,
        raceResult: parsed.raceResult,
        parsedContext: parsed.context,
        sourceUrl,
        includeOutlaps,
      },
      logger,
    );
  }

  private async executeImport(
    params: {
      entryList: LiveRcEntryListResponse;
      raceResult: LiveRcRaceResultResponse;
      parsedContext: LiveRcRaceContext;
      sourceUrl: string;
      includeOutlaps: boolean;
    },
    logger: Logger,
  ): Promise<LiveRcImportSummary> {
    const event = await this.persistEvent(
      params.entryList,
      params.raceResult,
      params.parsedContext,
    );
    const raceClass = await this.persistRaceClass(
      event.id,
      params.entryList,
      params.raceResult,
      params.parsedContext,
    );
    const session = await this.persistSession(
      event.id,
      raceClass.id,
      params.raceResult,
      params.parsedContext,
      params.sourceUrl,
    );

    const entryMap = this.buildEntryMap(params.entryList.entries);
    const entryIdsInList = new Set(params.entryList.entries.map((entry) => entry.entryId));
    const processedEntrantSourceIds = new Set<string>();
    const clearedEntrantSourceIds = new Set<string>();

    const entrantBySourceCache = new Map<string, Entrant | null>();

    const resolveEntrantBySource = async (sourceEntrantId: string) => {
      if (!sourceEntrantId) {
        return null;
      }

      if (entrantBySourceCache.has(sourceEntrantId)) {
        return entrantBySourceCache.get(sourceEntrantId) ?? null;
      }

      const entrant = await this.entrantRepository.findBySourceEntrantId({
        eventId: event.id,
        raceClassId: raceClass.id,
        sessionId: session.id,
        sourceEntrantId,
      });

      entrantBySourceCache.set(sourceEntrantId, entrant);
      return entrant ?? null;
    };

    const clearEntrantLaps = async (
      sourceEntrantId: string,
      reason: 'withdrawn' | 'missing_entry' | 'removed_from_entry_list',
      context: Record<string, unknown>,
    ) => {
      if (!sourceEntrantId || clearedEntrantSourceIds.has(sourceEntrantId)) {
        return;
      }

      const entrant = await resolveEntrantBySource(sourceEntrantId);
      if (!entrant) {
        return;
      }

      await this.lapRepository.replaceForEntrant(entrant.id, session.id, []);
      clearedEntrantSourceIds.add(sourceEntrantId);

      logger.info('Cleared laps for entrant removed from LiveRC dataset.', {
        event: 'liverc.import.entrant_laps_cleared',
        reason,
        entryId: sourceEntrantId,
        sessionId: session.id,
        outcome: 'laps_cleared',
        ...context,
      });
    };

    let entrantsProcessed = 0;
    let lapsImported = 0;
    let skippedLapCount = 0;
    let skippedEntrantCount = 0;
    let skippedOutlapCount = 0;

    const groupedLaps = this.groupLapsByEntry(params.raceResult, params.includeOutlaps);
    skippedLapCount += groupedLaps.skipped;
    skippedOutlapCount += groupedLaps.skippedOutlaps;

    for (const [entryId, laps] of groupedLaps.lapsByEntry.entries()) {
      const entry = entryMap.get(entryId);
      if (!entry) {
        skippedEntrantCount += 1;
        skippedLapCount += laps.length;
        logger.warn('Skipping laps with no matching entry list row.', {
          event: 'liverc.import.skipped_entry',
          entryId,
          lapsSkipped: laps.length,
          outcome: 'skipped',
        });
        await clearEntrantLaps(entryId, 'missing_entry', { lapsSkipped: laps.length });
        continue;
      }
      if (entry.withdrawn) {
        skippedEntrantCount += 1;
        skippedLapCount += laps.length;
        logger.info('Skipping withdrawn entrant from import.', {
          event: 'liverc.import.withdrawn_entry',
          entryId,
          lapsSkipped: laps.length,
          outcome: 'skipped',
        });
        await clearEntrantLaps(entry.entryId, 'withdrawn', { lapsSkipped: laps.length });
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
            raceId: params.raceResult.raceId,
            upstreamSessionId: session.source.sessionId,
            upstreamEventId: params.raceResult.eventId,
          }),
        )
        .filter((lap): lap is LapUpsertInput => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);

      await this.lapRepository.replaceForEntrant(entrant.id, session.id, lapInputs);

      if (lapInputs.length > 0) {
        entrantsProcessed += 1;
        lapsImported += lapInputs.length;
      }

      const sourceEntrantId = entrant.source.entrantId ?? entry.entryId;
      if (sourceEntrantId) {
        processedEntrantSourceIds.add(sourceEntrantId);
        entrantBySourceCache.set(sourceEntrantId, entrant);
      }
    }

    for (const entry of params.entryList.entries) {
      if (entry.withdrawn) {
        await clearEntrantLaps(entry.entryId, 'withdrawn', { lapsSkipped: 0 });
      }
    }

    const existingEntrants = await this.entrantRepository.listBySession(session.id);
    for (const existing of existingEntrants) {
      const sourceEntrantId = existing.source.entrantId;
      if (!sourceEntrantId || clearedEntrantSourceIds.has(sourceEntrantId)) {
        continue;
      }

      if (entryIdsInList.has(sourceEntrantId) || processedEntrantSourceIds.has(sourceEntrantId)) {
        entrantBySourceCache.set(sourceEntrantId, existing);
        continue;
      }

      entrantBySourceCache.set(sourceEntrantId, existing);
      await clearEntrantLaps(sourceEntrantId, 'removed_from_entry_list', {});
    }

    return {
      eventId: event.id,
      eventName: event.name,
      raceClassId: raceClass.id,
      raceClassName: raceClass.name,
      sessionId: session.id,
      sessionName: session.name,
      raceId: params.raceResult.raceId,
      roundId: params.raceResult.roundId ?? params.parsedContext.roundSlug,
      entrantsProcessed,
      lapsImported,
      skippedLapCount,
      skippedEntrantCount,
      skippedOutlapCount,
      sourceUrl: params.sourceUrl,
      includeOutlaps: params.includeOutlaps,
    };
  }

  private ensureJsonResultsUrl(url: string): LiveRcRaceContext {
    const result = parseLiveRcUrl(url);

    if (result.type === 'json') {
      const [eventSlug, classSlug, roundSlug, raceSlug] = result.slugs;
      return {
        resultsBaseUrl: result.resultsBaseUrl,
        origin: result.origin,
        eventSlug,
        classSlug,
        roundSlug,
        raceSlug,
      };
    }

    if (result.type === 'html') {
      throw new LiveRcImportError(
        'LiveRC HTML results URLs are not supported. Please use the JSON results link.',
        {
          status: 400,
          code: 'UNSUPPORTED_URL',
          details: { url, detectedType: 'html' },
        },
      );
    }

    throw new LiveRcImportError(result.reasonIfInvalid, {
      status: 400,
      code: this.mapInvalidReasonToErrorCode(result.reasonIfInvalid),
      details: { url, reason: result.reasonIfInvalid },
    });
  }

  private mapInvalidReasonToErrorCode(reason: LiveRcUrlInvalidReason) {
    switch (reason) {
      case LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL:
      case LiveRcUrlInvalidReasons.UNTRUSTED_HOST:
      case LiveRcUrlInvalidReasons.EXTRA_SEGMENTS:
      case LiveRcUrlInvalidReasons.EMPTY_SEGMENT:
      case LiveRcUrlInvalidReasons.EMPTY_SLUG:
        return 'INVALID_URL';
      case LiveRcUrlInvalidReasons.INVALID_RESULTS_PATH:
        return 'UNSUPPORTED_URL';
      case LiveRcUrlInvalidReasons.INCOMPLETE_RESULTS_SEGMENTS:
        return 'INCOMPLETE_URL';
      default:
        return 'INVALID_URL';
    }
  }

  private async persistEvent(
    entryList: LiveRcEntryListResponse,
    raceResult: LiveRcRaceResultResponse,
    context: LiveRcRaceContext,
  ) {
    const eventInput: EventUpsertInput = {
      sourceEventId: raceResult.eventId || entryList.eventId || context.eventSlug,
      sourceUrl: buildResultsUrl(context.resultsBaseUrl, [context.eventSlug]),
      name: normalizeWhitespace(
        (raceResult.eventName ?? entryList.eventName ?? toTitleFromSlug(context.eventSlug)) ||
          toTitleFromSlug(context.eventSlug),
      ),
    };

    return this.eventRepository.upsertBySource(eventInput);
  }

  private async persistRaceClass(
    eventId: string,
    entryList: LiveRcEntryListResponse,
    raceResult: LiveRcRaceResultResponse,
    context: LiveRcRaceContext,
  ) {
    const classCode = normalizeWhitespace(
      (entryList.classCode ?? raceResult.classCode ?? context.classSlug).toUpperCase(),
    );

    const raceClassInput: RaceClassUpsertInput = {
      eventId,
      classCode,
      sourceUrl: buildResultsUrl(context.resultsBaseUrl, [context.eventSlug, context.classSlug]),
      name: raceResult.className ?? entryList.className ?? toTitleFromSlug(context.classSlug),
    };

    return this.raceClassRepository.upsertBySource(raceClassInput);
  }

  private async persistSession(
    eventId: string,
    raceClassId: string,
    raceResult: LiveRcRaceResultResponse,
    context: LiveRcRaceContext,
    sourceUrl: string,
  ) {
    const upstreamSessionIdSegments = [
      raceResult.eventId ?? context.eventSlug,
      raceResult.classId ?? raceResult.classCode ?? context.classSlug,
      raceResult.roundId ?? context.roundSlug,
      raceResult.raceId ?? context.raceSlug,
    ].filter((segment): segment is string => typeof segment === 'string' && segment.length > 0);

    const upstreamSessionId = upstreamSessionIdSegments.join(':') || sourceUrl;

    const sessionInput: SessionUpsertInput = {
      eventId,
      raceClassId,
      sourceSessionId: upstreamSessionId,
      sourceUrl,
      name: raceResult.raceName ?? toTitleFromSlug(context.raceSlug),
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

  private buildEntryListFromRaceResult(
    raceResult: LiveRcRaceResultResponse,
  ): LiveRcEntryListResponse {
    const entries = new Map<string, LiveRcEntryListEntry>();

    for (const lap of raceResult.laps) {
      if (!entries.has(lap.entryId)) {
        entries.set(lap.entryId, {
          entryId: lap.entryId,
          displayName: lap.driverName,
          carNumber: null,
          sourceTransponderId: null,
        });
      }
    }

    return {
      eventId: raceResult.eventId,
      eventName: raceResult.eventName,
      classId: raceResult.classId,
      className: raceResult.className,
      classCode: raceResult.classCode,
      entries: Array.from(entries.values()),
    };
  }

  private buildUploadedSourceUrl(
    context: LiveRcRaceContext,
    metadata?: UploadImportMetadata,
    namespaceSeed?: string,
  ) {
    const pathSegments = [
      ...(namespaceSeed ? [encodeURIComponent(namespaceSeed)] : []),
      encodeURIComponent(context.eventSlug),
      encodeURIComponent(context.classSlug),
      encodeURIComponent(context.roundSlug),
      encodeURIComponent(context.raceSlug),
    ];

    let url = `uploaded-file://${pathSegments.join('/')}`;

    const queryEntries: [string, string][] = [];

    if (metadata?.fileName) {
      queryEntries.push(['name', metadata.fileName]);
    }

    if (metadata?.fileHash) {
      queryEntries.push(['hash', metadata.fileHash]);
    }

    if (metadata?.fileSizeBytes !== undefined) {
      queryEntries.push(['size', metadata.fileSizeBytes.toString()]);
    }

    if (metadata?.uploadedAtEpochMs !== undefined) {
      queryEntries.push(['uploaded', metadata.uploadedAtEpochMs.toString()]);
    }

    if (metadata?.lastModifiedEpochMs !== undefined) {
      queryEntries.push(['modified', metadata.lastModifiedEpochMs.toString()]);
    }

    if (queryEntries.length > 0) {
      const params = new URLSearchParams(queryEntries);
      url = `${url}?${params.toString()}`;
    }

    return url;
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

import type {
  LiveRcEntryListEntry,
  LiveRcEntryListResponse,
  LiveRcLapPenalty,
  LiveRcRaceResultLap,
  LiveRcRaceResultResponse,
} from '../ports/liveRcClient';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  return undefined;
};

const slugifySegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

const generateRandomSegment = () => {
  const global = globalThis as typeof globalThis & { crypto?: Crypto };
  const cryptoObj = global.crypto;
  if (cryptoObj) {
    if (typeof cryptoObj.randomUUID === 'function') {
      return cryptoObj
        .randomUUID()
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    }

    if (typeof cryptoObj.getRandomValues === 'function') {
      const values = cryptoObj.getRandomValues(new Uint32Array(3));
      return Array.from(values, (value) => value.toString(36)).join('');
    }
  }

  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

const generateUploadNamespace = (seed?: string) => {
  const seedSegment = seed ? slugifySegment(seed) : '';
  const timestampSegment = Date.now().toString(36);
  const randomSegment = slugifySegment(generateRandomSegment());
  const combined = [seedSegment, timestampSegment, randomSegment]
    .filter((segment) => segment && segment.length > 0)
    .join('-');

  if (combined) {
    return combined;
  }

  return slugifySegment(`${timestampSegment}-${Math.random().toString(36).slice(2, 10)}`);
};

export type LiveRcRaceContext = {
  resultsBaseUrl?: string;
  origin?: string;
  eventSlug: string;
  classSlug: string;
  roundSlug: string;
  raceSlug: string;
};

export type RaceResultParseOutcome = {
  context: LiveRcRaceContext;
  raceResult: LiveRcRaceResultResponse;
  missingIdentifiers: Array<'eventId' | 'classId' | 'raceId'>;
  hasLapData: boolean;
};

export const mapEntryListResponse = (
  raw: unknown,
  context: { eventSlug: string; classSlug: string },
): LiveRcEntryListResponse => {
  const root = asObject(raw);
  const meta = asObject(root.meta);
  const event = asObject(root.event ?? root.event_info ?? meta.event);
  const raceClass = asObject(root.class ?? root.class_info ?? meta.class);

  const eventId =
    asString(event.event_id ?? event.id ?? root.event_id ?? root.id) ?? context.eventSlug;
  const classId =
    asString(raceClass.class_id ?? raceClass.id ?? root.class_id ?? root.id) ?? context.classSlug;

  const entriesRaw = asArray(root.entries ?? root.entry_list ?? root.data);

  const entries: LiveRcEntryListEntry[] = [];
  for (const entryRaw of entriesRaw) {
    const entry = asObject(entryRaw);
    const entryId = asString(entry.entry_id ?? entry.id ?? entry.entryId);
    const displayName = asString(entry.display_name ?? entry.name ?? entry.displayName);

    if (!entryId || !displayName) {
      continue;
    }

    const carNumber = asString(entry.car_number ?? entry.carNumber);
    const withdrawn = asBoolean(entry.withdrawn);
    const sourceTransponderId = asString(entry.transponder_id ?? entry.transponderId);

    entries.push({
      entryId,
      displayName,
      carNumber: carNumber ?? null,
      withdrawn,
      sourceTransponderId: sourceTransponderId ?? null,
    });
  }

  return {
    eventId,
    eventName: asString(event.event_name ?? event.name ?? root.event_name),
    classId,
    className: asString(raceClass.class_name ?? raceClass.name ?? root.class_name),
    classCode: asString(raceClass.class_code ?? raceClass.code ?? root.class_code),
    entries,
  };
};

export const mapRaceResultResponse = (
  raw: unknown,
  context: LiveRcRaceContext,
): LiveRcRaceResultResponse => {
  const root = asObject(raw);
  const event = asObject(root.event);
  const raceClass = asObject(root.class);
  const round = asObject(root.round);
  const race = asObject(root.race);

  const eventId =
    asString(root.event_id ?? root.eventId ?? event.event_id ?? event.eventId ?? event.id) ??
    context.eventSlug;
  const classId =
    asString(
      root.class_id ?? root.classId ?? raceClass.class_id ?? raceClass.classId ?? raceClass.id,
    ) ?? context.classSlug;
  const roundId =
    asString(root.round_id ?? root.roundId ?? round.round_id ?? round.roundId ?? round.id) ??
    context.roundSlug;
  const raceId =
    asString(root.race_id ?? root.raceId ?? race.race_id ?? race.raceId ?? race.id) ??
    context.raceSlug;

  const lapsRaw = asArray(root.laps ?? root.results ?? root.lap_data);

  const laps: LiveRcRaceResultLap[] = [];
  for (const lapRaw of lapsRaw) {
    const lap = asObject(lapRaw);
    const entryId = asString(lap.entry_id ?? lap.driver_id ?? lap.entryId);
    const driverName = asString(lap.driver_name ?? lap.name ?? lap.driverName);
    const lapNumber = asNumber(lap.lap ?? lap.lap_number ?? lap.number);
    const lapTimeSeconds = asNumber(lap.lap_time ?? lap.lapTime ?? lap.time ?? lap.seconds);

    if (!entryId || !driverName || lapNumber === undefined || lapTimeSeconds === undefined) {
      continue;
    }

    const isOutlap = asBoolean(lap.is_outlap ?? lap.outlap ?? lap.isOutlap);
    const penaltiesRaw = asArray(lap.penalties);
    const penalties: LiveRcLapPenalty[] = [];

    for (const penaltyRaw of penaltiesRaw) {
      const penalty = asObject(penaltyRaw);
      const durationSeconds = asNumber(
        penalty.seconds ?? penalty.duration ?? penalty.duration_seconds,
      );
      const reason = asString(penalty.reason ?? penalty.description);

      if (durationSeconds === undefined && !reason) {
        continue;
      }

      penalties.push({
        durationSeconds,
        reason: reason ?? undefined,
      });
    }

    laps.push({
      entryId,
      driverName,
      lapNumber,
      lapTimeSeconds,
      isOutlap,
      penalties,
    });
  }

  return {
    eventId,
    eventName: asString(root.event_name ?? event.name),
    classId,
    className: asString(root.class_name ?? raceClass.name),
    classCode: asString(root.class_code ?? raceClass.code),
    roundId,
    roundName: asString(root.round_name ?? round.name),
    raceId,
    raceName: asString(root.race_name ?? race.name) ?? context.raceSlug,
    sessionType: asString(root.session_type ?? root.type ?? root.sessionType),
    startTimeUtc: asString(root.start_time ?? root.startTime ?? root.scheduled_start),
    laps,
  };
};

const normaliseFallback = (value: string | undefined, fallback: string) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback;
};

export const parseRaceResultPayload = (
  raw: unknown,
  options?: { fallbackContext?: Partial<LiveRcRaceContext> & { uploadNamespace?: string } },
): RaceResultParseOutcome => {
  const root = asObject(raw);
  const event = asObject(root.event);
  const raceClass = asObject(root.class);
  const round = asObject(root.round);
  const race = asObject(root.race);

  const fallbackNamespaceSource =
    options?.fallbackContext?.uploadNamespace ??
    options?.fallbackContext?.eventSlug ??
    options?.fallbackContext?.classSlug ??
    options?.fallbackContext?.raceSlug;
  const uploadNamespace = generateUploadNamespace(fallbackNamespaceSource);
  const fallbackEventSlug = `upload-${uploadNamespace}-event`;
  const fallbackClassSlug = `upload-${uploadNamespace}-class`;
  const fallbackRoundSlug = `upload-${uploadNamespace}-round`;
  const fallbackRaceSlug = `upload-${uploadNamespace}-race`;

  const eventId = asString(
    root.event_id ?? root.eventId ?? event.event_id ?? event.eventId ?? event.id,
  );
  const classId = asString(
    root.class_id ?? root.classId ?? raceClass.class_id ?? raceClass.classId ?? raceClass.id,
  );
  const roundId = asString(
    root.round_id ?? root.roundId ?? round.round_id ?? round.roundId ?? round.id,
  );
  const raceId = asString(root.race_id ?? root.raceId ?? race.race_id ?? race.raceId ?? race.id);

  const context: LiveRcRaceContext = {
    resultsBaseUrl: options?.fallbackContext?.resultsBaseUrl,
    origin: options?.fallbackContext?.origin,
    eventSlug: normaliseFallback(eventId, options?.fallbackContext?.eventSlug ?? fallbackEventSlug),
    classSlug: normaliseFallback(classId, options?.fallbackContext?.classSlug ?? fallbackClassSlug),
    roundSlug: normaliseFallback(roundId, options?.fallbackContext?.roundSlug ?? fallbackRoundSlug),
    raceSlug: normaliseFallback(raceId, options?.fallbackContext?.raceSlug ?? fallbackRaceSlug),
  };

  const lapsSource = root.laps ?? root.results ?? root.lap_data;
  const hasLapData = Array.isArray(lapsSource);

  const raceResult = mapRaceResultResponse(raw, context);
  const missingIdentifiers: Array<'eventId' | 'classId' | 'raceId'> = [];

  if (!eventId) {
    missingIdentifiers.push('eventId');
  }

  if (!classId) {
    missingIdentifiers.push('classId');
  }

  if (!raceId) {
    missingIdentifiers.push('raceId');
  }

  return {
    context,
    raceResult,
    missingIdentifiers,
    hasLapData,
  };
};

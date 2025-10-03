import type {
  LiveRcClient,
  LiveRcEntryListEntry,
  LiveRcEntryListResponse,
  LiveRcLapPenalty,
  LiveRcRaceResultLap,
  LiveRcRaceResultResponse,
} from '@core/app';

type FetchFn = typeof fetch;

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

export class LiveRcHttpError extends Error {
  readonly status: number;

  readonly code: string;

  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: { status: number; code: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'LiveRcHttpError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class LiveRcHttpClient implements LiveRcClient {
  private readonly fetchImpl: FetchFn;

  constructor(fetchImpl: FetchFn = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async fetchEntryList(params: {
    eventSlug: string;
    classSlug: string;
  }): Promise<LiveRcEntryListResponse> {
    const url = this.buildEntryListUrl(params);
    const payload = await this.fetchJson(url, {
      failureCode: 'ENTRY_LIST_FETCH_FAILED',
      failureMessage: 'Failed to fetch LiveRC entry list.',
      invalidResponseCode: 'ENTRY_LIST_INVALID_RESPONSE',
      invalidResponseMessage: 'LiveRC entry list response was not valid JSON.',
    });

    return this.mapEntryListResponse(payload, { ...params, url });
  }

  async fetchRaceResult(params: {
    eventSlug: string;
    classSlug: string;
    roundSlug: string;
    raceSlug: string;
  }): Promise<LiveRcRaceResultResponse> {
    const url = this.buildRaceResultUrl(params);
    const payload = await this.fetchJson(url, {
      failureCode: 'RACE_RESULT_FETCH_FAILED',
      failureMessage: 'Failed to fetch LiveRC race result.',
      invalidResponseCode: 'RACE_RESULT_INVALID_RESPONSE',
      invalidResponseMessage: 'LiveRC race result response was not valid JSON.',
    });

    return this.mapRaceResultResponse(payload, { ...params, url });
  }

  private async fetchJson(
    url: string,
    options: {
      failureCode: string;
      failureMessage: string;
      invalidResponseCode: string;
      invalidResponseMessage: string;
    },
  ) {
    const headers = { Accept: 'application/json' } as const;

    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers });
    } catch (error) {
      throw new LiveRcHttpError(options.failureMessage, {
        status: 502,
        code: options.failureCode,
        details: { url, cause: this.serializeError(error) },
      });
    }

    if (!response.ok) {
      throw new LiveRcHttpError(options.failureMessage, {
        status: response.status,
        code: options.failureCode,
        details: { url, statusText: response.statusText },
      });
    }

    try {
      const payload = (await response.json()) as unknown;
      return payload;
    } catch (error) {
      throw new LiveRcHttpError(options.invalidResponseMessage, {
        status: 502,
        code: options.invalidResponseCode,
        details: { url, cause: this.serializeError(error) },
      });
    }
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return { message: error.message, name: error.name };
    }

    return { message: String(error) };
  }

  private buildEntryListUrl(params: { eventSlug: string; classSlug: string }) {
    return `https://liverc.com/results/${params.eventSlug}/${params.classSlug}/entry-list.json`;
  }

  private buildRaceResultUrl(params: {
    eventSlug: string;
    classSlug: string;
    roundSlug: string;
    raceSlug: string;
  }) {
    return `https://liverc.com/results/${params.eventSlug}/${params.classSlug}/${params.roundSlug}/${params.raceSlug}.json`;
  }

  private mapEntryListResponse(
    raw: unknown,
    context: { eventSlug: string; classSlug: string; url: string },
  ): LiveRcEntryListResponse {
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
  }

  private mapRaceResultResponse(
    raw: unknown,
    context: {
      eventSlug: string;
      classSlug: string;
      roundSlug: string;
      raceSlug: string;
      url: string;
    },
  ): LiveRcRaceResultResponse {
    const root = asObject(raw);
    const event = asObject(root.event);
    const raceClass = asObject(root.class);
    const round = asObject(root.round);
    const race = asObject(root.race);

    const eventId =
      asString(
        root.event_id ?? root.eventId ?? event.event_id ?? event.eventId ?? event.id,
      ) ?? context.eventSlug;
    const classId =
      asString(
        root.class_id ?? root.classId ?? raceClass.class_id ?? raceClass.classId ?? raceClass.id,
      ) ?? context.classSlug;
    const roundId =
      asString(
        root.round_id ?? root.roundId ?? round.round_id ?? round.roundId ?? round.id,
      ) ?? context.roundSlug;
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
  }
}

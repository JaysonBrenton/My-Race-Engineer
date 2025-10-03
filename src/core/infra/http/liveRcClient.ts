import type { LiveRcClient, LiveRcEntryListResponse, LiveRcRaceResultResponse } from '@core/app';
import { mapEntryListResponse, mapRaceResultResponse } from '@core/app';

type FetchFn = typeof fetch;

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
    resultsBaseUrl: string;
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

    return mapEntryListResponse(payload, params);
  }

  async fetchRaceResult(params: {
    resultsBaseUrl: string;
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

    return mapRaceResultResponse(payload, params);
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

  private buildEntryListUrl(params: {
    resultsBaseUrl: string;
    eventSlug: string;
    classSlug: string;
  }) {
    const base = this.normaliseResultsBaseUrl(params.resultsBaseUrl);
    const encodedSegments = [params.eventSlug, params.classSlug].map(encodeURIComponent);
    return `${base}/${encodedSegments.join('/')}/entry-list.json`;
  }

  private buildRaceResultUrl(params: {
    resultsBaseUrl: string;
    eventSlug: string;
    classSlug: string;
    roundSlug: string;
    raceSlug: string;
  }) {
    const base = this.normaliseResultsBaseUrl(params.resultsBaseUrl);
    const encodedSegments = [
      params.eventSlug,
      params.classSlug,
      params.roundSlug,
      params.raceSlug,
    ].map(encodeURIComponent);
    return `${base}/${encodedSegments.join('/')}.json`;
  }

  private normaliseResultsBaseUrl(resultsBaseUrl: string) {
    if (!resultsBaseUrl) {
      return 'https://liverc.com/results';
    }

    return resultsBaseUrl.replace(/\/+$/, '');
  }
}

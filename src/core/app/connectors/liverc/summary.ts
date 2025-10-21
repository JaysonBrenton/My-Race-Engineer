/**
 * Author: Jayson Brenton
 * Date: 2025-10-12
 * Purpose: Permit debug-level logging in LiveRC job pipeline without behavior change.
 */

import type {
  DriverRepository,
  EntrantRepository,
  EventRepository,
  LapRepository,
  LapUpsertInput,
  LiveRcRaceResultLap,
  RaceClassRepository,
  ResultRowRepository,
  SessionRepository,
} from '@core/app';
import type { Logger } from '@core/app/ports/logger';
import type { LiveRcTelemetry } from '../../ports/telemetry';

import type { Driver, RaceClass, Session } from '@core/domain';
import { mapRaceResultResponse } from '../../liverc/responseMappers';
import { appendJsonSuffix } from './client';
import { buildLapId } from './lapId';

import {
  enumerateSessionsFromEventHtml,
  extractEventMetadataFromHtml,
  parseSessionResultsFromHtml,
  type LiveRcEventSessionSummary,
  type LiveRcSessionResultRowSummary,
} from './parse';

export type LiveRcSummaryImportCounts = {
  sessionsImported: number;
  resultRowsImported: number;
  lapsImported: number;
  driversWithLaps: number;
  lapsSkipped: number;
};

type HtmlLiveRcClient = {
  getEventOverview(urlOrRef: string): Promise<string>;
  getSessionPage(urlOrRef: string): Promise<string>;
  resolveJsonUrlFromHtml(html: string): string | null;
  fetchJson<T>(jsonUrl: string): Promise<T>;
};

type Dependencies = {
  client: HtmlLiveRcClient;
  eventRepository: EventRepository;
  raceClassRepository: RaceClassRepository;
  sessionRepository: SessionRepository;
  driverRepository: DriverRepository;
  resultRowRepository: ResultRowRepository;
  entrantRepository: EntrantRepository;
  lapRepository: LapRepository;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
  telemetry?: LiveRcTelemetry;
};

type DriverSummaryDetail = {
  driver: Driver;
  summary: LiveRcSessionResultRowSummary;
  sourceDriverId: string;
};

type PendingDriverSummary = {
  summary: LiveRcSessionResultRowSummary;
  rowKey: string;
};

const LIVERC_DRIVER_PROVIDER = 'LiveRC';

const normaliseDriverNameKey = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

export class LiveRcSummaryImporter {
  constructor(private readonly dependencies: Dependencies) {}

  async ingestEventSummary(eventRef: string): Promise<LiveRcSummaryImportCounts> {
    const eventHtml = await this.dependencies.client.getEventOverview(eventRef);
    const eventMeta = extractEventMetadataFromHtml(eventHtml, eventRef);
    const event = await this.dependencies.eventRepository.upsertBySource({
      sourceEventId: eventMeta.eventSlug,
      sourceUrl: eventMeta.canonicalUrl,
      name: eventMeta.eventName,
    });

    const baseUrl = new URL(eventMeta.canonicalUrl);
    const baseOrigin = `${baseUrl.protocol}//${baseUrl.host}`;

    const sessionSummaries = enumerateSessionsFromEventHtml(eventHtml);
    let sessionsImported = 0;
    let resultRowsImported = 0;
    let lapsImported = 0;
    let driversWithLaps = 0;
    let lapsSkipped = 0;

    for (const summary of sessionSummaries) {
      const sessionRef = this.resolveSessionUrl(summary, baseOrigin);

      try {
        const result = await this.processSession({
          summary,
          sessionRef,
          eventMeta,
          eventId: event.id,
        });
        sessionsImported += result.sessionImported ? 1 : 0;
        resultRowsImported += result.resultRowsImported;
        lapsImported += result.lapsImported;
        driversWithLaps += result.driversWithLaps;
        lapsSkipped += result.lapsSkipped;
      } catch (error) {
        this.dependencies.logger?.warn?.('LiveRC session summary ingestion failed.', {
          event: 'liverc.summary.session_failed',
          outcome: 'skipped',
          sessionRef,
          error,
        });
      }
    }

    return { sessionsImported, resultRowsImported, lapsImported, driversWithLaps, lapsSkipped };
  }

  private resolveSessionUrl(summary: LiveRcEventSessionSummary, baseOrigin: string): string {
    try {
      return new URL(summary.sessionRef, baseOrigin).toString();
    } catch {
      return summary.sessionRef;
    }
  }

  private async processSession(input: {
    summary: LiveRcEventSessionSummary;
    sessionRef: string;
    eventMeta: { canonicalUrl: string; eventSlug: string };
    eventId: string;
  }): Promise<{
    sessionImported: boolean;
    resultRowsImported: number;
    lapsImported: number;
    driversWithLaps: number;
    lapsSkipped: number;
  }> {
    const { summary, sessionRef, eventMeta, eventId } = input;
    const sessionStartedAt = Date.now();

    try {
      const sessionHtml = await this.dependencies.client.getSessionPage(sessionRef);
      const sessionResults = parseSessionResultsFromHtml(sessionHtml, sessionRef);
      const resolvedSessionUrl = sessionResults.canonicalUrl ?? sessionRef;

      const sessionUrl = new URL(resolvedSessionUrl, eventMeta.canonicalUrl);
      const pathSegments = sessionUrl.pathname.split('/').filter(Boolean);
      const resultsIndex = pathSegments.indexOf('results');

      if (resultsIndex === -1 || pathSegments.length <= resultsIndex + 2) {
        throw new Error('LiveRC session URL is missing expected segments.');
      }

      const eventSlug = pathSegments[resultsIndex + 1] ?? eventMeta.eventSlug;
      const classSlug = pathSegments[resultsIndex + 2];
      const sessionSlugSegments = pathSegments.slice(resultsIndex + 1);
      const sourceSessionId = sessionSlugSegments.join('/');

      const raceClass = await this.dependencies.raceClassRepository.upsertBySource({
        eventId,
        classCode: classSlug,
        sourceUrl: `${sessionUrl.origin}/results/${eventSlug}/${classSlug}`,
        name: summary.className,
      });

      const session = await this.dependencies.sessionRepository.upsertBySource({
        eventId,
        raceClassId: raceClass.id,
        sourceSessionId,
        sourceUrl: sessionUrl.toString(),
        name: summary.title || sessionResults.sessionName,
        scheduledStart: parseOptionalDate(summary.completedAt),
      });

      const pendingSummariesByName = new Map<string, PendingDriverSummary[]>();
      const allSummaries: PendingDriverSummary[] = [];

      sessionResults.resultRows.forEach((row, index) => {
        const driverName = row.driverName.trim();
        if (!driverName) {
          return;
        }

        const pending: PendingDriverSummary = {
          summary: { ...row, driverName },
          rowKey: `${index}`,
        };

        allSummaries.push(pending);

        const key = normaliseDriverNameKey(driverName);
        const bucket = pendingSummariesByName.get(key);
        if (bucket) {
          bucket.push(pending);
        } else {
          pendingSummariesByName.set(key, [pending]);
        }
      });

      const { roundSlug, raceSlug } = this.deriveSessionSlugContext(sessionSlugSegments);

      const lapImport = await this.importSessionLaps({
        sessionHtml,
        sessionUrl,
        session,
        raceClass,
        summaryRowsByName: pendingSummariesByName,
        eventSlug,
        classSlug,
        roundSlug,
        raceSlug,
      });

      const driverDetailsById = new Map(lapImport.driverDetailsById);
      const driverLapCounts = lapImport.driverLapCounts;

      for (const pending of allSummaries) {
        if (lapImport.consumedSummaryRowKeys.has(pending.rowKey)) {
          continue;
        }

        const sourceDriverId = buildLiveRcFallbackDriverSourceId({
          eventSlug,
          classSlug,
          sessionSourceId: session.source.sessionId,
          rowKey: pending.rowKey,
        });

        const driver = await this.dependencies.driverRepository.upsertBySource({
          provider: LIVERC_DRIVER_PROVIDER,
          sourceDriverId,
          displayName: pending.summary.driverName,
        });

        const detail: DriverSummaryDetail = {
          driver,
          summary: pending.summary,
          sourceDriverId,
        };

        driverDetailsById.set(driver.id, detail);
      }

      for (const detail of driverDetailsById.values()) {
        const hasLapOverride = driverLapCounts.has(detail.driver.id);
        const lapsValue = hasLapOverride
          ? (driverLapCounts.get(detail.driver.id) ?? 0)
          : (detail.summary.laps ?? null);

        await this.dependencies.resultRowRepository.upsertBySessionAndDriver({
          sessionId: session.id,
          driverId: detail.driver.id,
          position: detail.summary.position ?? null,
          carNumber: detail.summary.carNumber ?? null,
          laps: lapsValue,
          totalTimeMs: detail.summary.totalTimeMs ?? null,
          behindMs: detail.summary.behindMs ?? null,
          fastestLapMs: detail.summary.fastestLapMs ?? null,
          fastestLapNum: detail.summary.fastestLapNum ?? null,
          avgLapMs: detail.summary.avgLapMs ?? null,
          avgTop5Ms: detail.summary.avgTop5Ms ?? null,
          avgTop10Ms: detail.summary.avgTop10Ms ?? null,
          avgTop15Ms: detail.summary.avgTop15Ms ?? null,
          top3ConsecMs: detail.summary.top3ConsecMs ?? null,
          stdDevMs: detail.summary.stdDevMs ?? null,
          consistencyPct: detail.summary.consistencyPct ?? null,
        });
      }

      const result = {
        sessionImported: true,
        resultRowsImported: driverDetailsById.size,
        lapsImported: lapImport.lapsImported,
        driversWithLaps: lapImport.driversWithLaps,
        lapsSkipped: lapImport.lapsSkipped,
      };

      const telemetry: LiveRcTelemetry | undefined = this.dependencies.telemetry;
      if (telemetry) {
        telemetry.recordSessionIngestion({
          outcome: 'success',
          durationMs: Date.now() - sessionStartedAt,
          sessionRef,
          eventId,
          className: summary.className,
          sessionType: summary.type ?? null,
          counts: {
            resultRowsImported: result.resultRowsImported,
            lapsImported: result.lapsImported,
            driversWithLaps: result.driversWithLaps,
            lapsSkipped: result.lapsSkipped,
          },
        });
      }

      return result;
    } catch (error) {
      const telemetry: LiveRcTelemetry | undefined = this.dependencies.telemetry;
      if (telemetry) {
        telemetry.recordSessionIngestion({
          outcome: 'failure',
          durationMs: Date.now() - sessionStartedAt,
          sessionRef,
          eventId,
          className: summary.className,
          sessionType: summary.type ?? null,
          reason: 'error',
        });
      }

      throw error;
    }
  }

  private deriveSessionSlugContext(sessionSlugSegments: string[]): {
    roundSlug: string;
    raceSlug: string;
  } {
    if (sessionSlugSegments.length <= 2) {
      const fallback = sessionSlugSegments[sessionSlugSegments.length - 1] ?? 'race';
      return { roundSlug: 'main', raceSlug: fallback };
    }

    const tail = sessionSlugSegments.slice(2);
    const raceSlug =
      tail[tail.length - 1] ?? sessionSlugSegments[sessionSlugSegments.length - 1] ?? 'race';
    const roundSlugSource = tail.length > 1 ? tail.slice(0, -1).join('/') : tail[0];

    return {
      roundSlug: roundSlugSource && roundSlugSource.length > 0 ? roundSlugSource : 'main',
      raceSlug,
    };
  }

  private async importSessionLaps(params: {
    sessionHtml: string;
    sessionUrl: URL;
    session: Session;
    raceClass: RaceClass;
    summaryRowsByName: Map<string, PendingDriverSummary[]>;
    eventSlug: string;
    classSlug: string;
    roundSlug: string;
    raceSlug: string;
  }): Promise<{
    lapsImported: number;
    lapsSkipped: number;
    driversWithLaps: number;
    driverLapCounts: Map<string, number>;
    driverDetailsById: Map<string, DriverSummaryDetail>;
    consumedSummaryRowKeys: Set<string>;
  }> {
    if (params.summaryRowsByName.size === 0) {
      return {
        lapsImported: 0,
        lapsSkipped: 0,
        driversWithLaps: 0,
        driverLapCounts: new Map(),
        driverDetailsById: new Map(),
        consumedSummaryRowKeys: new Set(),
      };
    }

    let jsonUrl = this.dependencies.client.resolveJsonUrlFromHtml(params.sessionHtml);
    if (!jsonUrl) {
      jsonUrl = appendJsonSuffix(params.sessionUrl.toString());
    }

    let raceResultLaps: LiveRcRaceResultLap[] = [];
    let raceResultMeta: { eventId: string; raceId: string } | null = null;

    try {
      const raw = await this.dependencies.client.fetchJson<unknown>(jsonUrl);
      const result = mapRaceResultResponse(raw, {
        resultsBaseUrl: `${params.sessionUrl.origin}/results`,
        origin: params.sessionUrl.origin,
        eventSlug: params.eventSlug,
        classSlug: params.classSlug,
        roundSlug: params.roundSlug,
        raceSlug: params.raceSlug,
      });

      raceResultLaps = result.laps;
      raceResultMeta = { eventId: result.eventId, raceId: result.raceId };
    } catch (error) {
      this.dependencies.logger?.warn?.('LiveRC lap import failed for session.', {
        event: 'liverc.summary.laps_failed',
        outcome: 'skipped',
        sessionId: params.session.id,
        sessionUrl: params.session.source.url,
        jsonUrl,
        error,
      });

      return {
        lapsImported: 0,
        lapsSkipped: 0,
        driversWithLaps: 0,
        driverLapCounts: new Map(),
        driverDetailsById: new Map(),
        consumedSummaryRowKeys: new Set(),
      };
    }

    const grouped = new Map<string, { driverName: string; laps: LiveRcRaceResultLap[] }>();

    for (const lap of raceResultLaps) {
      const entryId = lap.entryId.trim();
      const driverName = lap.driverName.trim();

      if (!entryId || !driverName) {
        continue;
      }

      const group = grouped.get(entryId);
      if (group) {
        group.laps.push(lap);
      } else {
        grouped.set(entryId, { driverName, laps: [lap] });
      }
    }

    const driverLapCounts = new Map<string, number>();
    const driverDetailsById = new Map<string, DriverSummaryDetail>();
    const consumedSummaryRowKeys = new Set<string>();
    let lapsImported = 0;
    let driversWithLaps = 0;
    let lapsSkipped = 0;

    for (const [entryId, group] of grouped.entries()) {
      const normalizedName = normaliseDriverNameKey(group.driverName);
      const pendingList = params.summaryRowsByName.get(normalizedName);
      const pending = pendingList?.shift();

      if (pendingList && pendingList.length === 0) {
        params.summaryRowsByName.delete(normalizedName);
      }

      const detail = pending
        ? await this.resolveDriverDetail({
            pending,
            entryId,
            session: params.session,
            eventSlug: params.eventSlug,
            classSlug: params.classSlug,
          })
        : null;

      if (!detail) {
        this.dependencies.logger?.warn?.('Skipping LiveRC laps with no matching summary row.', {
          event: 'liverc.summary.laps_missing_driver',
          outcome: 'skipped',
          sessionId: params.session.id,
          entryId,
          driverName: group.driverName,
        });
        lapsSkipped += group.laps.length;
        continue;
      }

      driverDetailsById.set(detail.driver.id, detail);
      if (pending) {
        consumedSummaryRowKeys.add(pending.rowKey);
      }

      const entrant = await this.dependencies.entrantRepository.upsertBySource({
        eventId: params.session.eventId,
        raceClassId: params.raceClass.id,
        sessionId: params.session.id,
        displayName: detail.driver.displayName,
        carNumber: detail.summary.carNumber ?? null,
        sourceEntrantId: entryId,
        sourceTransponderId: null,
      });

      const lapInputs: LapUpsertInput[] = [];

      for (const lap of group.laps) {
        const upsert = this.mapLapToUpsert({
          lap,
          entrantId: entrant.id,
          sessionId: params.session.id,
          driverId: detail.driver.id,
          driverSourceId: detail.sourceDriverId,
          eventId: raceResultMeta?.eventId ?? params.session.eventId,
          raceId: raceResultMeta?.raceId ?? params.session.source.sessionId,
        });

        if (!upsert) {
          lapsSkipped += 1;
          continue;
        }

        lapInputs.push(upsert);
      }

      lapInputs.sort((a, b) => a.lapNumber - b.lapNumber);

      await this.dependencies.lapRepository.replaceForEntrant(
        entrant.id,
        params.session.id,
        lapInputs,
      );

      lapsImported += lapInputs.length;
      if (lapInputs.length > 0) {
        driversWithLaps += 1;
      }

      driverLapCounts.set(detail.driver.id, lapInputs.length);
    }

    return {
      lapsImported,
      lapsSkipped,
      driversWithLaps,
      driverLapCounts,
      driverDetailsById,
      consumedSummaryRowKeys,
    };
  }

  private async resolveDriverDetail(params: {
    pending: PendingDriverSummary;
    entryId: string;
    session: Session;
    eventSlug: string;
    classSlug: string;
  }): Promise<DriverSummaryDetail> {
    const sourceDriverId = buildLiveRcDriverSourceId({
      eventSlug: params.eventSlug,
      classSlug: params.classSlug,
      sessionSourceId: params.session.source.sessionId,
      entryId: params.entryId,
    });

    const driver = await this.dependencies.driverRepository.upsertBySource({
      provider: LIVERC_DRIVER_PROVIDER,
      sourceDriverId,
      displayName: params.pending.summary.driverName,
    });

    return {
      driver,
      summary: params.pending.summary,
      sourceDriverId,
    };
  }

  private mapLapToUpsert(params: {
    lap: LiveRcRaceResultLap;
    entrantId: string;
    sessionId: string;
    driverId: string;
    driverSourceId: string;
    eventId: string;
    raceId: string;
  }): LapUpsertInput | null {
    const lapTimeMs = Math.round(params.lap.lapTimeSeconds * 1000);

    if (!Number.isFinite(lapTimeMs) || lapTimeMs <= 0) {
      return null;
    }

    return {
      id: buildLapId({
        eventId: params.eventId,
        sessionId: params.sessionId,
        raceId: params.raceId,
        driverId: params.driverSourceId,
        lapNumber: params.lap.lapNumber,
      }),
      entrantId: params.entrantId,
      sessionId: params.sessionId,
      driverId: params.driverId,
      lapNumber: params.lap.lapNumber,
      lapTimeMs,
    } satisfies LapUpsertInput;
  }
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildLiveRcDriverSourceId(params: {
  eventSlug: string;
  classSlug: string;
  sessionSourceId: string;
  entryId: string;
}): string {
  return [params.eventSlug, params.classSlug, params.sessionSourceId, params.entryId]
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('|');
}

function buildLiveRcFallbackDriverSourceId(params: {
  eventSlug: string;
  classSlug: string;
  sessionSourceId: string;
  rowKey: string;
}): string {
  return buildLiveRcDriverSourceId({
    eventSlug: params.eventSlug,
    classSlug: params.classSlug,
    sessionSourceId: params.sessionSourceId,
    entryId: `fallback:${params.rowKey}`,
  });
}

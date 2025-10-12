import type {
  DriverRepository,
  EventRepository,
  RaceClassRepository,
  ResultRowRepository,
  SessionRepository,
} from '@core/app';
import type { Logger } from '@core/app/ports/logger';

import {
  enumerateSessionsFromEventHtml,
  extractEventMetadataFromHtml,
  parseSessionResultsFromHtml,
  type LiveRcEventSessionSummary,
} from './parse';

export type LiveRcSummaryImportCounts = {
  sessionsImported: number;
  resultRowsImported: number;
};

type HtmlLiveRcClient = {
  getEventOverview(urlOrRef: string): Promise<string>;
  getSessionPage(urlOrRef: string): Promise<string>;
};

type Dependencies = {
  client: HtmlLiveRcClient;
  eventRepository: EventRepository;
  raceClassRepository: RaceClassRepository;
  sessionRepository: SessionRepository;
  driverRepository: DriverRepository;
  resultRowRepository: ResultRowRepository;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
};

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

    for (const summary of sessionSummaries) {
      const sessionRef = this.resolveSessionUrl(summary, baseOrigin);

      try {
        const result = await this.processSession({ summary, sessionRef, eventMeta, eventId: event.id });
        sessionsImported += result.sessionImported ? 1 : 0;
        resultRowsImported += result.resultRowsImported;
      } catch (error) {
        this.dependencies.logger?.warn?.('LiveRC session summary ingestion failed.', {
          event: 'liverc.summary.session_failed',
          outcome: 'skipped',
          sessionRef,
          error,
        });
      }
    }

    return { sessionsImported, resultRowsImported };
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
  }): Promise<{ sessionImported: boolean; resultRowsImported: number }> {
    const { summary, sessionRef, eventMeta, eventId } = input;
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

    let importedRows = 0;

    for (const row of sessionResults.resultRows) {
      const driverName = row.driverName.trim();
      if (!driverName) {
        continue;
      }

      const driver = await this.dependencies.driverRepository.upsertByDisplayName({
        displayName: driverName,
      });

      await this.dependencies.resultRowRepository.upsertBySessionAndDriver({
        sessionId: session.id,
        driverId: driver.id,
        position: row.position ?? null,
        carNumber: row.carNumber ?? null,
        laps: row.laps ?? null,
        totalTimeMs: row.totalTimeMs ?? null,
        behindMs: row.behindMs ?? null,
        fastestLapMs: row.fastestLapMs ?? null,
        fastestLapNum: row.fastestLapNum ?? null,
        avgLapMs: row.avgLapMs ?? null,
        avgTop5Ms: row.avgTop5Ms ?? null,
        avgTop10Ms: row.avgTop10Ms ?? null,
        avgTop15Ms: row.avgTop15Ms ?? null,
        top3ConsecMs: row.top3ConsecMs ?? null,
        stdDevMs: row.stdDevMs ?? null,
        consistencyPct: row.consistencyPct ?? null,
      });

      importedRows += 1;
    }

    return { sessionImported: true, resultRowsImported: importedRows };
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

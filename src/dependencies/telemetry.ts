import { metrics, type Attributes, type Histogram } from '@opentelemetry/api';

import type {
  LiveRcImportCountSummary,
  LiveRcTelemetry,
  LiveRcTelemetryApplyOutcome,
  LiveRcTelemetryIngestionOutcome,
  LiveRcTelemetryPlanOutcome,
} from '@core/app';

const meter = metrics.getMeter('my-race-engineer.liverc');

const planRequestCounter = meter.createCounter('liverc_import_plan_requests_total', {
  description: 'Count of LiveRC import plan requests processed by the API.',
});

const planDurationHistogram = meter.createHistogram('liverc_import_plan_duration_ms', {
  description: 'Latency for LiveRC import plan requests.',
  unit: 'ms',
});

const planRequestedEventsHistogram = meter.createHistogram('liverc_import_plan_requested_events', {
  description: 'Number of event references supplied to LiveRC plan requests.',
});

const planIncludedEventsHistogram = meter.createHistogram('liverc_import_plan_included_events', {
  description: 'Number of events included in generated LiveRC plans.',
});

const applyRequestCounter = meter.createCounter('liverc_import_apply_requests_total', {
  description: 'Count of LiveRC import apply submissions.',
});

const applyDurationHistogram = meter.createHistogram('liverc_import_apply_duration_ms', {
  description: 'Latency for LiveRC import apply requests.',
  unit: 'ms',
});

const applyEventCountHistogram = meter.createHistogram('liverc_import_apply_event_count', {
  description: 'Number of events queued per LiveRC import apply request.',
});

const applyEstimatedLapsHistogram = meter.createHistogram('liverc_import_apply_estimated_laps', {
  description: 'Estimated laps queued per LiveRC import apply request.',
});

const eventIngestionCounter = meter.createCounter('liverc_event_ingestion_total', {
  description: 'Count of LiveRC event ingestion executions.',
});

const eventIngestionDurationHistogram = meter.createHistogram(
  'liverc_event_ingestion_duration_ms',
  {
    description: 'Runtime for LiveRC event ingestion jobs.',
    unit: 'ms',
  },
);

const eventSessionsHistogram = meter.createHistogram('liverc_event_ingestion_sessions_imported', {
  description: 'Sessions imported per LiveRC event ingestion.',
});

const eventResultRowsHistogram = meter.createHistogram(
  'liverc_event_ingestion_result_rows_imported',
  {
    description: 'Result rows imported per LiveRC event ingestion.',
  },
);

const eventLapsHistogram = meter.createHistogram('liverc_event_ingestion_laps_imported', {
  description: 'Lap count imported per LiveRC event ingestion.',
});

const eventDriversHistogram = meter.createHistogram('liverc_event_ingestion_drivers_with_laps', {
  description: 'Drivers with laps recorded per LiveRC event ingestion.',
});

const eventLapsSkippedHistogram = meter.createHistogram('liverc_event_ingestion_laps_skipped', {
  description: 'Skipped lap count per LiveRC event ingestion.',
});

const sessionIngestionCounter = meter.createCounter('liverc_session_ingestion_total', {
  description: 'Count of LiveRC session ingestion executions.',
});

const sessionIngestionDurationHistogram = meter.createHistogram(
  'liverc_session_ingestion_duration_ms',
  {
    description: 'Runtime for LiveRC session processing.',
    unit: 'ms',
  },
);

const sessionResultRowsHistogram = meter.createHistogram(
  'liverc_session_ingestion_result_rows_imported',
  {
    description: 'Result rows imported per LiveRC session.',
  },
);

const sessionLapsHistogram = meter.createHistogram('liverc_session_ingestion_laps_imported', {
  description: 'Lap count imported per LiveRC session.',
});

const sessionDriversHistogram = meter.createHistogram(
  'liverc_session_ingestion_drivers_with_laps',
  {
    description: 'Drivers with laps recorded per LiveRC session.',
  },
);

const sessionLapsSkippedHistogram = meter.createHistogram('liverc_session_ingestion_laps_skipped', {
  description: 'Skipped lap count per LiveRC session.',
});

const buildAttributes = (
  base: Record<string, string | number | boolean | undefined>,
): Attributes => {
  const entries = Object.entries(base).filter(([, value]) => value !== undefined && value !== null);
  return Object.fromEntries(entries) as Attributes;
};

const recordHistogram = (
  histogram: Histogram,
  value: number | undefined,
  attributes: Attributes,
) => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return;
  }

  histogram.record(value, attributes);
};

const recordCountSummary = (
  counts: LiveRcImportCountSummary | undefined,
  attributes: Attributes,
) => {
  if (!counts) {
    return;
  }

  recordHistogram(eventSessionsHistogram, counts.sessionsImported, attributes);
  recordHistogram(eventResultRowsHistogram, counts.resultRowsImported, attributes);
  recordHistogram(eventLapsHistogram, counts.lapsImported, attributes);
  recordHistogram(eventDriversHistogram, counts.driversWithLaps, attributes);
  recordHistogram(eventLapsSkippedHistogram, counts.lapsSkipped, attributes);
};

const recordSessionCounts = (
  counts:
    | {
        resultRowsImported: number;
        lapsImported: number;
        driversWithLaps: number;
        lapsSkipped: number;
      }
    | undefined,
  attributes: Attributes,
) => {
  if (!counts) {
    return;
  }

  recordHistogram(sessionResultRowsHistogram, counts.resultRowsImported, attributes);
  recordHistogram(sessionLapsHistogram, counts.lapsImported, attributes);
  recordHistogram(sessionDriversHistogram, counts.driversWithLaps, attributes);
  recordHistogram(sessionLapsSkippedHistogram, counts.lapsSkipped, attributes);
};

const mapReason = (reason: string | undefined): string | undefined => {
  if (!reason) {
    return undefined;
  }

  return reason;
};

class OpenTelemetryLiveRcTelemetry implements LiveRcTelemetry {
  recordPlanRequest(input: {
    outcome: LiveRcTelemetryPlanOutcome;
    durationMs: number;
    planId?: string;
    requestedEvents?: number;
    includedEvents?: number;
    reason?: string;
  }): void {
    const attributes = buildAttributes({ outcome: input.outcome, reason: mapReason(input.reason) });
    planRequestCounter.add(1, attributes);
    recordHistogram(planDurationHistogram, input.durationMs, attributes);
    recordHistogram(planRequestedEventsHistogram, input.requestedEvents, attributes);
    recordHistogram(planIncludedEventsHistogram, input.includedEvents, attributes);
  }

  recordApplyRequest(input: {
    outcome: LiveRcTelemetryApplyOutcome;
    durationMs: number;
    planId: string;
    jobId?: string;
    eventCount?: number;
    estimatedLaps?: number;
    reason?: string;
  }): void {
    const attributes = buildAttributes({ outcome: input.outcome, reason: mapReason(input.reason) });
    applyRequestCounter.add(1, attributes);
    recordHistogram(applyDurationHistogram, input.durationMs, attributes);
    recordHistogram(applyEventCountHistogram, input.eventCount, attributes);
    recordHistogram(applyEstimatedLapsHistogram, input.estimatedLaps, attributes);
  }

  recordEventIngestion(input: {
    outcome: LiveRcTelemetryIngestionOutcome;
    durationMs: number;
    jobId: string;
    itemId: string;
    targetRef: string;
    counts?: LiveRcImportCountSummary;
    reason?: string;
  }): void {
    const attributes = buildAttributes({ outcome: input.outcome, reason: mapReason(input.reason) });
    eventIngestionCounter.add(1, attributes);
    recordHistogram(eventIngestionDurationHistogram, input.durationMs, attributes);
    recordCountSummary(input.counts, attributes);
  }

  recordSessionIngestion(input: {
    outcome: LiveRcTelemetryIngestionOutcome;
    durationMs: number;
    sessionRef: string;
    eventId: string;
    className?: string;
    sessionType?: string | null;
    counts?: {
      resultRowsImported: number;
      lapsImported: number;
      driversWithLaps: number;
      lapsSkipped: number;
    };
    reason?: string;
  }): void {
    const attributes = buildAttributes({
      outcome: input.outcome,
      reason: mapReason(input.reason),
      session_type: input.sessionType ?? undefined,
    });
    sessionIngestionCounter.add(1, attributes);
    recordHistogram(sessionIngestionDurationHistogram, input.durationMs, attributes);
    recordSessionCounts(input.counts, attributes);
  }
}

export const livercTelemetry: LiveRcTelemetry = new OpenTelemetryLiveRcTelemetry();

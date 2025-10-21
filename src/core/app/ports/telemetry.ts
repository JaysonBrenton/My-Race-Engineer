/**
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-10-24
 * Purpose: Define telemetry hooks used by LiveRC ingestion flows.
 */

export type LiveRcImportCountSummary = {
  sessionsImported: number;
  resultRowsImported: number;
  lapsImported: number;
  driversWithLaps: number;
  lapsSkipped: number;
};

export type LiveRcTelemetryPlanOutcome = 'success' | 'failure';

export type LiveRcTelemetryApplyOutcome = 'accepted' | 'rejected' | 'failure';

export type LiveRcTelemetryIngestionOutcome = 'success' | 'failure';

export interface LiveRcTelemetry {
  recordPlanRequest(input: {
    outcome: LiveRcTelemetryPlanOutcome;
    durationMs: number;
    planId?: string;
    requestedEvents?: number;
    includedEvents?: number;
    reason?: string;
  }): void;

  recordApplyRequest(input: {
    outcome: LiveRcTelemetryApplyOutcome;
    durationMs: number;
    planId: string;
    jobId?: string;
    eventCount?: number;
    estimatedLaps?: number;
    reason?: string;
  }): void;

  recordEventIngestion(input: {
    outcome: LiveRcTelemetryIngestionOutcome;
    durationMs: number;
    jobId: string;
    itemId: string;
    targetRef: string;
    counts?: LiveRcImportCountSummary;
    reason?: string;
  }): void;

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
  }): void;
}

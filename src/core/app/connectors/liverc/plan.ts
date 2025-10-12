import { randomUUID } from 'node:crypto';

import type { ImportPlanRepository, ImportPlanEventState } from '@core/app';

import type { LiveRcClient } from './client';
import { enumerateSessionsFromEventHtml, type LiveRcEventSessionSummary } from './parse';

type ImportPlanItemStatus = 'NEW' | 'PARTIAL' | 'EXISTING';

type PlanEventInput = {
  eventRef: string;
};

export type LiveRcImportPlanRequest = {
  events: PlanEventInput[];
};

export type LiveRcImportPlanItem = {
  eventRef: string;
  status: ImportPlanItemStatus;
  counts: {
    sessions: number;
    drivers: number;
    estimatedLaps: number;
  };
};

export type LiveRcImportPlan = {
  planId: string;
  generatedAt: string;
  items: LiveRcImportPlanItem[];
};

type Dependencies = {
  client: LiveRcClient;
  repository: ImportPlanRepository;
};

type PlanServiceOptions = {
  includeExistingEvents?: boolean;
};

type SessionHeuristic = {
  classKey: string;
  groupLabel: string;
  groupType: 'heat' | 'main' | 'default';
  driverEstimate: number;
  lapsPerDriver: number;
};

type HeuristicSummary = {
  sessions: SessionHeuristic[];
  driverTotal: number;
};

export class LiveRcImportPlanService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly options: PlanServiceOptions = {},
  ) {}

  async createPlan(request: LiveRcImportPlanRequest): Promise<LiveRcImportPlan> {
    const items: LiveRcImportPlanItem[] = [];

    for (const { eventRef } of request.events) {
      const [html, eventState] = await Promise.all([
        this.dependencies.client.getEventOverview(eventRef),
        this.dependencies.repository.getEventStateByRef(eventRef),
      ]);

      const sessionSummaries = enumerateSessionsFromEventHtml(html);
      const summary = buildHeuristicSummary(sessionSummaries);
      const catalogueDriverCount = Math.max(
        eventState?.event.driversCount ?? 0,
        eventState?.event.entriesCount ?? 0,
      );
      const actualEntrantCount = eventState?.entrantCount ?? 0;
      const targetDriverCount = Math.max(actualEntrantCount, catalogueDriverCount);
      const scaledTotals = computeScaledTotals(summary, targetDriverCount);
      const estimatedDrivers = scaledTotals.driverCount;
      const estimatedLaps = Math.max(eventState?.lapCount ?? 0, scaledTotals.totalLaps);

      items.push({
        eventRef,
        status: deriveStatus(sessionSummaries.length, eventState),
        counts: {
          sessions: sessionSummaries.length,
          drivers: estimatedDrivers,
          estimatedLaps,
        },
      });
    }

    const includeExisting = this.options.includeExistingEvents ?? false;
    const filteredItems = includeExisting ? items : items.filter((item) => item.status !== 'EXISTING');

    return {
      planId: randomUUID(),
      generatedAt: new Date().toISOString(),
      items: filteredItems,
    };
  }
}

const deriveStatus = (
  enumeratedSessionCount: number,
  eventState: ImportPlanEventState | null,
): ImportPlanItemStatus => {
  if (!eventState) {
    return 'NEW';
  }

  if (enumeratedSessionCount === 0) {
    if (eventState.sessionsWithLaps > 0) {
      return 'EXISTING';
    }

    return eventState.sessionCount > 0 || eventState.lapCount > 0 || eventState.entrantCount > 0
      ? 'PARTIAL'
      : 'NEW';
  }

  const hasSessions = eventState.sessionCount > 0;
  const coversAllSessions =
    eventState.sessionCount >= enumeratedSessionCount &&
    eventState.sessionsWithLaps >= enumeratedSessionCount &&
    eventState.sessionsWithLaps === eventState.sessionCount &&
    eventState.lapCount > 0;

  if (coversAllSessions) {
    return 'EXISTING';
  }

  return hasSessions || eventState.sessionsWithLaps > 0 || eventState.lapCount > 0 ? 'PARTIAL' : 'NEW';
};

const buildHeuristicSummary = (sessions: LiveRcEventSessionSummary[]): HeuristicSummary => {
  const heuristics: SessionHeuristic[] = [];
  const classGroupAggregates = new Map<
    string,
    {
      heat: Map<string, number>;
      main: Map<string, number>;
      default: Map<string, number>;
    }
  >();

  for (const session of sessions) {
    const classKey = normaliseClassKey(session.className);
    const { label: groupLabel, type: groupType } = normaliseGroup(session.heatLabel, session.type);
    const driverEstimate = estimateDriversPerSession(session);
    const lapsPerDriver = estimateLapsPerDriver(session);

    heuristics.push({ classKey, groupLabel, groupType, driverEstimate, lapsPerDriver });

    let aggregates = classGroupAggregates.get(classKey);
    if (!aggregates) {
      aggregates = { heat: new Map(), main: new Map(), default: new Map() };
      classGroupAggregates.set(classKey, aggregates);
    }

    const targetMap = aggregates[groupType];
    const existing = targetMap.get(groupLabel) ?? 0;
    targetMap.set(groupLabel, Math.max(existing, driverEstimate));
  }

  let driverTotal = 0;
  for (const aggregates of classGroupAggregates.values()) {
    const heatTotal = sumMapValues(aggregates.heat);
    const defaultTotal = sumMapValues(aggregates.default);
    const mainTotal = sumMapValues(aggregates.main);

    if (heatTotal > 0) {
      driverTotal += heatTotal;
    } else if (defaultTotal > 0) {
      driverTotal += defaultTotal;
    } else {
      driverTotal += mainTotal;
    }
  }

  return { sessions: heuristics, driverTotal };
};

const computeScaledTotals = (
  summary: HeuristicSummary,
  overrideDriverCount: number,
): { driverCount: number; totalLaps: number } => {
  const baseDriverTotal = summary.driverTotal;
  const targetDrivers = Math.max(baseDriverTotal, overrideDriverCount);

  if (baseDriverTotal === 0) {
    return {
      driverCount: Math.max(0, Math.round(targetDrivers)),
      totalLaps: 0,
    };
  }

  const scale = targetDrivers / baseDriverTotal;
  let totalLaps = 0;

  for (const session of summary.sessions) {
    totalLaps += session.driverEstimate * scale * session.lapsPerDriver;
  }

  return {
    driverCount: Math.max(0, Math.round(targetDrivers)),
    totalLaps: Math.max(0, Math.round(totalLaps)),
  };
};

const sumMapValues = (input: Map<string, number>) => {
  let total = 0;
  for (const value of input.values()) {
    total += value;
  }
  return total;
};

const normaliseClassKey = (className: string) => className.trim().toLowerCase();

const normaliseGroup = (
  heatLabel: string | undefined,
  type: LiveRcEventSessionSummary['type'],
): { label: string; type: SessionHeuristic['groupType'] } => {
  if (!heatLabel) {
    return { label: 'default', type: 'default' };
  }

  const normalised = heatLabel.trim().toLowerCase();

  if (/\bheat\b/.test(normalised)) {
    const match = /(heat\s*[a-z0-9]+)/.exec(normalised);
    const label = match ? match[1] : normalised;
    return { label, type: 'heat' };
  }

  if (/\bmain\b/.test(normalised)) {
    const match = /([a-z])\s*main/.exec(normalised) ?? /main\s*([a-z])/.exec(normalised);
    const label = match ? `main-${match[1]}` : normalised.replace(/\s+/g, '-');
    return { label, type: type === 'MAIN' ? 'main' : 'default' };
  }

  return { label: normalised.replace(/\s+/g, '-'), type: 'default' };
};

const estimateDriversPerSession = (session: LiveRcEventSessionSummary): number => {
  const classKey = normaliseClassKey(session.className);
  let base = session.type === 'MAIN' ? 12 : 10;

  if (session.heatLabel && /\bheat\b/i.test(session.heatLabel)) {
    base = Math.max(base, 10);
  }

  if (session.type === 'MAIN' && session.heatLabel && /\b[b-z]\s*main\b/i.test(session.heatLabel)) {
    base = Math.max(10, base - 1);
  }

  if (classKey.includes('truggy')) {
    base = Math.max(9, base - 1);
  }

  if (classKey.includes('novice') || classKey.includes('beginner')) {
    base = Math.max(6, base - 2);
  }

  if (classKey.includes('pro') || classKey.includes('open')) {
    base = base + 1;
  }

  return Math.max(6, base);
};

const estimateSessionDurationSeconds = (session: LiveRcEventSessionSummary): number => {
  if (session.type === 'MAIN') {
    if (session.heatLabel && /\b[b-z]\s*main\b/i.test(session.heatLabel)) {
      return 15 * 60;
    }

    return 20 * 60;
  }

  return 6 * 60;
};

const estimateBaselineLapSeconds = (session: LiveRcEventSessionSummary): number => {
  const classKey = normaliseClassKey(session.className);
  let baseline = 34;

  if (classKey.includes('buggy')) {
    baseline = 32;
  }

  if (classKey.includes('truggy')) {
    baseline = 36;
  }

  if (classKey.includes('short course') || classKey.includes('sct')) {
    baseline = 40;
  }

  if (classKey.includes('oval')) {
    baseline = 28;
  }

  if (classKey.includes('touring') || classKey.includes('on-road') || classKey.includes('onroad')) {
    baseline = 27;
  }

  if (classKey.includes('stock') || classKey.includes('17.5') || classKey.includes('13.5')) {
    baseline = Math.max(26, baseline - 2);
  }

  if (classKey.includes('nitro')) {
    baseline = Math.max(baseline, 35);
  }

  return Math.max(20, baseline);
};

const estimateLapsPerDriver = (session: LiveRcEventSessionSummary): number => {
  const durationSeconds = estimateSessionDurationSeconds(session);
  const baselineSeconds = estimateBaselineLapSeconds(session);
  return Math.max(1, Math.round(durationSeconds / baselineSeconds));
};

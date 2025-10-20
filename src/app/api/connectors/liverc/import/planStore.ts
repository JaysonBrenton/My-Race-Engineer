import type { LiveRcImportPlan, LiveRcImportPlanRequest } from '@core/app';

export type StoredImportPlan = {
  planId: string;
  request: LiveRcImportPlanRequest;
  plan?: LiveRcImportPlan;
};

export interface LiveRcImportPlanStore {
  save(entry: StoredImportPlan): Promise<void>;
  get(planId: string): Promise<StoredImportPlan | null>;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_STORED_PLANS = 200;

type PlanRecord = StoredImportPlan & { expiresAt: number };

class EphemeralLiveRcImportPlanStore implements LiveRcImportPlanStore {
  private readonly plans = new Map<string, PlanRecord>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = MAX_STORED_PLANS,
  ) {}

  private pruneExpiredEntries(referenceTime: number = Date.now()): void {
    for (const [planId, record] of this.plans) {
      if (record.expiresAt <= referenceTime) {
        this.plans.delete(planId);
      }
    }
  }

  private enforceSizeLimit(): void {
    while (this.plans.size > this.maxEntries) {
      const oldest = this.plans.keys().next();
      if (oldest.done) {
        break;
      }
      this.plans.delete(oldest.value);
    }
  }

  save(entry: StoredImportPlan): Promise<void> {
    const trimmedPlanId = entry.planId.trim();
    if (!trimmedPlanId) {
      return Promise.resolve();
    }

    const now = Date.now();
    this.pruneExpiredEntries(now);
    this.plans.delete(trimmedPlanId);
    this.plans.set(trimmedPlanId, {
      planId: trimmedPlanId,
      request: entry.request,
      plan: entry.plan,
      expiresAt: now + this.ttlMs,
    });
    this.enforceSizeLimit();
    return Promise.resolve();
  }

  get(planId: string): Promise<StoredImportPlan | null> {
    const trimmedPlanId = planId.trim();
    if (!trimmedPlanId) {
      return Promise.resolve(null);
    }

    const now = Date.now();
    this.pruneExpiredEntries(now);

    const record = this.plans.get(trimmedPlanId);
    if (!record) {
      return Promise.resolve(null);
    }

    if (record.expiresAt <= now) {
      this.plans.delete(trimmedPlanId);
      return Promise.resolve(null);
    }

    return Promise.resolve({
      planId: record.planId,
      request: record.request,
      plan: record.plan,
    });
  }
}

export const liveRcImportPlanStore: LiveRcImportPlanStore = new EphemeralLiveRcImportPlanStore();

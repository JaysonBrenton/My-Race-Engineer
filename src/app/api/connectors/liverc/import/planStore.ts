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

class InMemoryLiveRcImportPlanStore implements LiveRcImportPlanStore {
  private plans = new Map<string, StoredImportPlan>();

  save(entry: StoredImportPlan): Promise<void> {
    const trimmedPlanId = entry.planId.trim();
    if (!trimmedPlanId) {
      return Promise.resolve();
    }

    this.plans.set(trimmedPlanId, {
      planId: trimmedPlanId,
      request: entry.request,
      plan: entry.plan,
    });
    return Promise.resolve();
  }

  get(planId: string): Promise<StoredImportPlan | null> {
    const trimmedPlanId = planId.trim();
    if (!trimmedPlanId) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.plans.get(trimmedPlanId) ?? null);
  }
}

export const liveRcImportPlanStore: LiveRcImportPlanStore = new InMemoryLiveRcImportPlanStore();

import type { Driver } from '@core/domain';

export type DriverUpsertInput = {
  displayName: string;
  transponder?: string | null;
};

export interface DriverRepository {
  findByDisplayName(displayName: string): Promise<Driver | null>;
  upsertByDisplayName(input: DriverUpsertInput): Promise<Driver>;
}

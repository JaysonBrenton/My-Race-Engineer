/**
 * Project: My Race Engineer
 * File: src/core/app/ports/clubRepository.ts
 * Summary: Port definition for persisting LiveRC club catalogue records.
 */

export type ClubUpsertInput = {
  liveRcSubdomain: string;
  displayName: string;
  country?: string | null;
  region?: string | null;
  seenAt: Date;
};

export interface ClubRepository {
  upsertByLiveRcSubdomain(input: ClubUpsertInput): Promise<void>;
  markInactiveClubsNotInSubdomains(subdomains: readonly string[]): Promise<number>;
}

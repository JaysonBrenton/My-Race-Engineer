/**
 * Project: My Race Engineer
 * File: src/core/app/ports/clubRepository.ts
 * Summary: Port definition for persisting LiveRC club catalogue records.
 */

import type { Club } from '@core/domain/club';

export type ClubUpsertInput = {
  liveRcSubdomain: string;
  displayName: string;
  country?: string | null;
  region?: string | null;
  seenAt: Date;
};

export type ClubSearchResult = {
  id: string;
  liveRcSubdomain: string;
  displayName: string;
  country: string | null;
  region: string | null;
};

export interface ClubRepository {
  upsertByLiveRcSubdomain(input: ClubUpsertInput): Promise<void>;
  markInactiveClubsNotInSubdomains(subdomains: readonly string[]): Promise<number>;
  searchByDisplayName(query: string, limit: number): Promise<ClubSearchResult[]>;
  findById(clubId: string): Promise<Club | null>;
}

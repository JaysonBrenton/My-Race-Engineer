/**
 * Project: My Race Engineer
 * File: src/core/domain/club.ts
 * Summary: Domain type describing LiveRC clubs independent of Prisma persistence models.
 * Author: Jayson Brenton
 * Date: 2025-11-19
 */

export type Club = {
  id: string;
  liveRcSubdomain: string;
  displayName: string;
  country?: string | null;
  region?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

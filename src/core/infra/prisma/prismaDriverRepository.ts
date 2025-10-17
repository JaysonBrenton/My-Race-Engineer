import type { DriverRepository, DriverSourceUpsertInput, DriverUpsertInput } from '@core/app';
import type { Driver } from '@core/domain';
import type { Driver as PrismaDriver } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (driver: PrismaDriver): Driver => ({
  id: driver.id,
  displayName: driver.displayName,
  provider: driver.provider,
  sourceDriverId: driver.sourceDriverId,
  transponder: driver.transponder,
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

export class PrismaDriverRepository implements DriverRepository {
  async findByDisplayName(displayName: string): Promise<Driver | null> {
    const prisma = getPrismaClient();
    const driver = await prisma.driver.findFirst({
      where: { displayName },
    });

    return driver ? toDomain(driver) : null;
  }

  async upsertByDisplayName(input: DriverUpsertInput): Promise<Driver> {
    const prisma = getPrismaClient();
    const existing = await prisma.driver.findFirst({
      where: { displayName: input.displayName },
    });

    if (existing) {
      if (input.transponder && existing.transponder !== input.transponder) {
        const updated = await prisma.driver.update({
          where: { id: existing.id },
          data: { transponder: input.transponder },
        });

        return toDomain(updated);
      }

      return toDomain(existing);
    }

    const created = await prisma.driver.create({
      data: {
        displayName: input.displayName,
        transponder: input.transponder ?? null,
      },
    });

    return toDomain(created);
  }

  async upsertBySource(input: DriverSourceUpsertInput): Promise<Driver> {
    const prisma = getPrismaClient();
    const provider = input.provider.trim();
    const sourceDriverId = input.sourceDriverId.trim();
    const displayName = input.displayName.trim();

    if (!provider) {
      throw new Error('Driver provider cannot be empty.');
    }

    if (!sourceDriverId) {
      throw new Error('Driver source identifier cannot be empty.');
    }

    const existing = await prisma.driver.findFirst({
      where: { provider, sourceDriverId },
    });

    const transponder = input.transponder ?? null;

    if (existing) {
      const requiresUpdate =
        existing.displayName !== displayName || existing.transponder !== transponder;

      if (!requiresUpdate) {
        return toDomain(existing);
      }

      const updated = await prisma.driver.update({
        where: { id: existing.id },
        data: { displayName, transponder },
      });

      return toDomain(updated);
    }

    const created = await prisma.driver.create({
      data: {
        displayName,
        provider,
        sourceDriverId,
        transponder,
      },
    });

    return toDomain(created);
  }
}

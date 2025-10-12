import type { DriverRepository, DriverUpsertInput } from '@core/app';
import type { Driver } from '@core/domain';
import type { Driver as PrismaDriver } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (driver: PrismaDriver): Driver => ({
  id: driver.id,
  displayName: driver.displayName,
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
}

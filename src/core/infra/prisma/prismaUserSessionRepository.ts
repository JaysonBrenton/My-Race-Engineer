import type { UserSessionRepository } from '@core/app';
import type { CreateUserSessionInput, UserSession } from '@core/domain';
import type { UserSession as PrismaUserSession } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (session: PrismaUserSession): UserSession => ({
  id: session.id,
  userId: session.userId,
  sessionToken: session.sessionToken,
  expiresAt: session.expiresAt,
  ipAddress: session.ipAddress ?? null,
  userAgent: session.userAgent ?? null,
  deviceName: session.deviceName ?? null,
  lastUsedAt: session.lastUsedAt ?? null,
  revokedAt: session.revokedAt ?? null,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

export class PrismaUserSessionRepository implements UserSessionRepository {
  async create(input: CreateUserSessionInput): Promise<UserSession> {
    const prisma = getPrismaClient();
    const session = await prisma.userSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        sessionToken: input.sessionToken,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceName: input.deviceName ?? null,
      },
    });

    return toDomain(session);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

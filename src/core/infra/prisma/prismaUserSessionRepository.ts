import type { UserSessionRepository } from '@core/app';
import type { CreateUserSessionInput, UserSession } from '@core/domain';
import type { Prisma, PrismaClient, UserSession as PrismaUserSession } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (session: PrismaUserSession): UserSession => ({
  id: session.id,
  userId: session.userId,
  sessionTokenHash: session.sessionToken,
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
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient = getPrismaClient(),
  ) {}

  async create(input: CreateUserSessionInput): Promise<UserSession> {
    const session = await this.prisma.userSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        sessionToken: input.sessionTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceName: input.deviceName ?? null,
      },
    });

    return toDomain(session);
  }

  async findByTokenHash(tokenHash: string): Promise<UserSession | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { sessionToken: tokenHash },
    });

    return session ? toDomain(session) : null;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

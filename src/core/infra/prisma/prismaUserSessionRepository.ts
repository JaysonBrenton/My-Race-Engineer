import type { UserSessionRepository } from '@core/app';
import type { CreateUserSessionInput, UserSession } from '@core/domain';
import type { UserSession as PrismaUserSession } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (session: PrismaUserSession): UserSession => ({
  id: session.id,
  userId: session.userId,
  sessionToken: session.sessionToken,
  expiresAt: session.expiresAt,
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
      },
    });

    return toDomain(session);
  }
}

import type { PasswordResetTokenRepository } from '@core/app';
import type { CreatePasswordResetTokenInput, PasswordResetToken } from '@core/domain';
import type { PasswordResetToken as PrismaPasswordResetToken } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (token: PrismaPasswordResetToken): PasswordResetToken => ({
  id: token.id,
  userId: token.userId,
  tokenHash: token.tokenHash,
  expiresAt: token.expiresAt,
  consumedAt: token.consumedAt ?? null,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
});

export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    const prisma = getPrismaClient();
    const token = await prisma.passwordResetToken.create({
      data: {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });

    return toDomain(token);
  }

  async findActiveByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const prisma = getPrismaClient();
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return token ? toDomain(token) : null;
  }

  async markConsumed(id: string, consumedAt: Date): Promise<PasswordResetToken> {
    const prisma = getPrismaClient();
    const token = await prisma.passwordResetToken.update({
      where: { id },
      data: { consumedAt },
    });

    return toDomain(token);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  }
}

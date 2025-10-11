import type { UserEmailVerificationTokenRepository } from '@core/app';
import type {
  CreateUserEmailVerificationTokenInput,
  UserEmailVerificationToken,
} from '@core/domain';
import type { UserEmailVerificationToken as PrismaUserEmailVerificationToken } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (token: PrismaUserEmailVerificationToken): UserEmailVerificationToken => ({
  id: token.id,
  userId: token.userId,
  tokenHash: token.tokenHash,
  expiresAt: token.expiresAt,
  consumedAt: token.consumedAt ?? null,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
});

export class PrismaUserEmailVerificationTokenRepository
  implements UserEmailVerificationTokenRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateUserEmailVerificationTokenInput): Promise<UserEmailVerificationToken> {
    const token = await this.prisma.userEmailVerificationToken.create({
      data: {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });

    return toDomain(token);
  }

  async findActiveByTokenHash(tokenHash: string): Promise<UserEmailVerificationToken | null> {
    const token = await this.prisma.userEmailVerificationToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
    });

    return token ? toDomain(token) : null;
  }

  async markConsumed(id: string, consumedAt: Date): Promise<UserEmailVerificationToken> {
    const token = await this.prisma.userEmailVerificationToken.update({
      where: { id },
      data: { consumedAt },
    });

    return toDomain(token);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.userEmailVerificationToken.deleteMany({ where: { userId } });
  }
}

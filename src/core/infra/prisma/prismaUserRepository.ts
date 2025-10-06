import type { UserRepository } from '@core/app';
import type { CreateUserInput, User } from '@core/domain';
/*
 * Prisma's generated client returns fully typed objects, but `@typescript-eslint`
 * currently reports them as `any` when accessed through helper mappers. We
 * intentionally suppress the false positives around these mappings.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { $Enums } from '@prisma/client';
import type { PrismaClient, User as PrismaUser } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (user: PrismaUser): User => ({
  id: user.id,
  name: user.name,
  email: user.email,
  passwordHash: user.passwordHash,
  status: user.status.toLowerCase() as User['status'],
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export class PrismaUserRepository implements UserRepository {
  private toPrismaStatus(status: User['status']): $Enums.UserStatus {
    switch (status) {
      case 'active':
        return $Enums.UserStatus.ACTIVE;
      case 'suspended':
        return $Enums.UserStatus.SUSPENDED;
      default:
        return $Enums.UserStatus.PENDING;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const prisma: PrismaClient = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    return user ? toDomain(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const prisma: PrismaClient = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { id } });

    return user ? toDomain(user) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const prisma: PrismaClient = getPrismaClient();

    return toDomain(
      await prisma.user.create({
        data: {
          id: input.id,
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          status: this.toPrismaStatus(input.status),
          emailVerifiedAt: input.emailVerifiedAt ?? null,
        },
      }),
    );
  }

  async updateEmailVerification(userId: string, verifiedAt: Date | null): Promise<User> {
    const prisma: PrismaClient = getPrismaClient();
    return toDomain(
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: verifiedAt },
      }),
    );
  }

  async updateStatus(userId: string, status: User['status']): Promise<User> {
    const prisma = getPrismaClient();
    return toDomain(
      await prisma.user.update({
        where: { id: userId },
        data: { status: this.toPrismaStatus(status) },
      }),
    );
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    const prisma = getPrismaClient();
    return toDomain(
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
    );
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

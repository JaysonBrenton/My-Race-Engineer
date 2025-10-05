import type { UserRepository } from '@core/app';
import type { CreateUserInput, User } from '@core/domain';
import type { User as PrismaUser } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (user: PrismaUser): User => ({
  id: user.id,
  name: user.name,
  email: user.email,
  passwordHash: user.passwordHash,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    return user ? toDomain(user) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const prisma = getPrismaClient();
    const user = await prisma.user.create({
      data: {
        id: input.id,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
      },
    });

    return toDomain(user);
  }
}

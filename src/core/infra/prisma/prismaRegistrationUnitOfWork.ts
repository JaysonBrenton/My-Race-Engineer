import type { RegistrationPersistencePorts, RegistrationUnitOfWork } from '@core/app';
import type { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from './prismaUserRepository';
import { PrismaUserSessionRepository } from './prismaUserSessionRepository';
import { PrismaUserEmailVerificationTokenRepository } from './prismaUserEmailVerificationTokenRepository';
import { getPrismaClient } from './prismaClient';

export class PrismaRegistrationUnitOfWork implements RegistrationUnitOfWork {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async run<T>(work: (ports: RegistrationPersistencePorts) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as PrismaClient;

      return work({
        userRepository: new PrismaUserRepository(transaction),
        userSessionRepository: new PrismaUserSessionRepository(transaction),
        emailVerificationTokens: new PrismaUserEmailVerificationTokenRepository(transaction),
      });
    });
  }
}

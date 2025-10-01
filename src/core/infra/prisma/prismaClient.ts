import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prismaInstance: PrismaClient | undefined;

export class PrismaClientInitializationError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PrismaClientInitializationError';
    this.cause = cause;
  }
}

const createPrismaClient = (): PrismaClient => {
  if (!process.env.DATABASE_URL) {
    throw new PrismaClientInitializationError(
      'DATABASE_URL is not defined. PrismaClient cannot be initialised.',
    );
  }

  if (prismaInstance) {
    return prismaInstance;
  }

  const existingClient = globalForPrisma.prisma;

  if (existingClient) {
    prismaInstance = existingClient;
    return existingClient;
  }

  try {
    const client = new PrismaClient({
      log:
        process.env.PRISMA_LOG_LEVEL === 'query'
          ? ['query', 'info', 'warn', 'error']
          : ['info', 'warn', 'error'],
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = client;
    }

    prismaInstance = client;

    return client;
  } catch (error) {
    throw new PrismaClientInitializationError('Failed to create PrismaClient instance.', error);
  }
};

export const getPrismaClient = (): PrismaClient => {
  if (prismaInstance) {
    return prismaInstance;
  }

  return createPrismaClient();
};

export const isPrismaClientInitializationError = (
  error: unknown,
): error is PrismaClientInitializationError =>
  error instanceof PrismaClientInitializationError ||
  error instanceof Prisma.PrismaClientInitializationError;

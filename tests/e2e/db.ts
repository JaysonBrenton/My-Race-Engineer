import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const findUserByEmail = (email: string) =>
  prisma.user.findUnique({
    where: { email },
  });

export const deleteUserByEmail = (email: string) =>
  prisma.user.deleteMany({
    where: { email },
  });

export const closeDb = () => prisma.$disconnect();

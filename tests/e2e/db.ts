import { PrismaClient } from '@prisma/client';

import { Argon2PasswordHasher } from '@/lib/auth/passwordHasher';

const prisma = new PrismaClient();
const passwordHasher = new Argon2PasswordHasher();

export const findUserByEmail = (email: string) =>
  prisma.user.findUnique({
    where: { email },
  });

export const deleteUserByEmail = (email: string) =>
  prisma.user.deleteMany({
    where: { email },
  });

export const closeDb = () => prisma.$disconnect();

export const createActiveUser = async (params: {
  name: string;
  driverName: string;
  email: string;
  password: string;
}) => {
  const passwordHash = await passwordHasher.hash(params.password);
  return prisma.user.create({
    data: {
      name: params.name,
      driverName: params.driverName,
      email: params.email,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
};

export const USER_STATUSES = ['active', 'pending', 'suspended'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export type User = {
  id: string;
  name: string;
  driverName: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  id: string;
  name: string;
  driverName: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt?: Date | null;
};

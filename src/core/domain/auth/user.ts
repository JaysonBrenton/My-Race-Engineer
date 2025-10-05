export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: Date | null;
};

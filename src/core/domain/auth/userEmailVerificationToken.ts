export type UserEmailVerificationToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserEmailVerificationTokenInput = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

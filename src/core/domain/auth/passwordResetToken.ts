export type PasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePasswordResetTokenInput = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

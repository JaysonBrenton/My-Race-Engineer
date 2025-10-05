export type UserSession = {
  id: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserSessionInput = {
  id: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
};

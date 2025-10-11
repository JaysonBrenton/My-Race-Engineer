export type UserSession = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserSessionInput = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
};

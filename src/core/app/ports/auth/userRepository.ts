import type { CreateUserInput, User, UserStatus } from '@core/domain';

export type FindUserByEmailResult = User | null;
export type FindUserByDriverNameResult = User | null;

export interface UserRepository {
  findByEmail(email: string): Promise<FindUserByEmailResult>;
  findByDriverName(driverName: string): Promise<FindUserByDriverNameResult>;
  findById(id: string): Promise<User | null>;
  create(user: CreateUserInput): Promise<User>;
  updateEmailVerification(userId: string, verifiedAt: Date | null): Promise<User>;
  updateStatus(userId: string, status: UserStatus): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<User>;
  deleteById(userId: string): Promise<void>;
}

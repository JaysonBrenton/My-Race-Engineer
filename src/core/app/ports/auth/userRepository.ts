import type { CreateUserInput, User } from '@core/domain';

export type FindUserByEmailResult = User | null;

export interface UserRepository {
  findByEmail(email: string): Promise<FindUserByEmailResult>;
  create(user: CreateUserInput): Promise<User>;
}

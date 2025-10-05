import { randomUUID } from 'node:crypto';

import type { User } from '@core/domain';

import type { PasswordHasher } from '../../ports/auth/passwordHasher';
import type { UserRepository } from '../../ports/auth/userRepository';

export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
};

export type RegisterUserResult = { ok: true; user: User } | { ok: false; reason: 'email-taken' };

export class RegisterUserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(input: RegisterUserInput): Promise<RegisterUserResult> {
    const existing = await this.userRepository.findByEmail(input.email);

    if (existing) {
      return { ok: false, reason: 'email-taken' };
    }

    const user = await this.userRepository.create({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash: await this.passwordHasher.hash(input.password),
      emailVerifiedAt: null,
    });

    return { ok: true, user };
  }
}

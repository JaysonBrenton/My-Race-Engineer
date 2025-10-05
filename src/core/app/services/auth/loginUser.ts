import { randomUUID, randomBytes } from 'node:crypto';

import type { User } from '@core/domain';

import type { PasswordHasher } from '../../ports/auth/passwordHasher';
import type { UserRepository } from '../../ports/auth/userRepository';
import type { UserSessionRepository } from '../../ports/auth/userSessionRepository';

export type LoginUserInput = {
  email: string;
  password: string;
};

export type LoginUserResult =
  | { ok: true; user: User; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid-credentials' | 'email-not-verified' };

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export class LoginUserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly requireEmailVerification: boolean,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async login(input: LoginUserInput): Promise<LoginUserResult> {
    const user = await this.userRepository.findByEmail(input.email);

    if (!user) {
      return { ok: false, reason: 'invalid-credentials' };
    }

    if (!(await this.passwordHasher.verify(user.passwordHash, input.password))) {
      return { ok: false, reason: 'invalid-credentials' };
    }

    if (this.requireEmailVerification && !user.emailVerifiedAt) {
      return { ok: false, reason: 'email-not-verified' };
    }

    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(this.clock().getTime() + DEFAULT_SESSION_TTL_MS);

    await this.userSessionRepository.create({
      id: randomUUID(),
      userId: user.id,
      sessionToken,
      expiresAt,
    });

    return { ok: true, user, sessionToken, expiresAt };
  }

  private generateSessionToken() {
    return randomBytes(32).toString('base64url');
  }
}

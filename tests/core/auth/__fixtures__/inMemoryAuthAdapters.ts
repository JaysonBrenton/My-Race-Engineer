/**
 * Filename: tests/core/auth/__fixtures__/inMemoryAuthAdapters.ts
 * Purpose: Provide in-memory auth adapters and loggers for domain service testing.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import { createHash } from 'node:crypto';

import type {
  Logger,
  MailMessage,
  MailerPort,
  PasswordHasher,
  RegistrationPersistencePorts,
  RegistrationUnitOfWork,
  UserEmailVerificationTokenRepository,
  UserRepository,
  UserSessionRepository,
} from '../../../../src/core/app';
import { DuplicateUserEmailError } from '../../../../src/core/app';
import { LoginUserService } from '../../../../src/core/app/services/auth/loginUser';
import { RegisterUserService } from '../../../../src/core/app/services/auth/registerUser';
import type {
  CreateUserEmailVerificationTokenInput,
  CreateUserInput,
  CreateUserSessionInput,
  User,
  UserEmailVerificationToken,
  UserSession,
} from '../../../../src/core/domain';

export type TestClock = () => Date;

export const createFixedClock = (fixed: Date): TestClock => () => new Date(fixed.getTime());

export class InMemoryUserRepository implements UserRepository {
  public created: CreateUserInput | null = null;
  public usersByEmail = new Map<string, User>();
  public usersById = new Map<string, User>();

  constructor(private readonly clock: TestClock = () => new Date()) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    if (this.usersByEmail.has(input.email.toLowerCase())) {
      throw new DuplicateUserEmailError(input.email.toLowerCase());
    }

    const createdAt = this.clock();
    const user: User = {
      id: input.id,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      createdAt,
      updatedAt: createdAt,
    };
    this.created = input;
    this.usersByEmail.set(user.email, user);
    this.usersById.set(user.id, user);
    return user;
  }

  async updateEmailVerification(userId: string, verifiedAt: Date | null): Promise<User> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error('User not found');
    const updated: User = {
      ...user,
      emailVerifiedAt: verifiedAt,
      updatedAt: this.clock(),
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async updateStatus(userId: string, status: User['status']): Promise<User> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error('User not found');
    const updated: User = {
      ...user,
      status,
      updatedAt: this.clock(),
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error('User not found');
    const updated: User = {
      ...user,
      passwordHash,
      updatedAt: this.clock(),
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async deleteById(userId: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (!user) {
      return;
    }

    this.usersById.delete(userId);
    this.usersByEmail.delete(user.email);
  }

  seed(user: User) {
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.usersById.set(user.id, user);
  }
}

export class RecordingUserSessionRepository implements UserSessionRepository {
  public createdSessions: CreateUserSessionInput[] = [];

  constructor(private readonly clock: TestClock = () => new Date()) {}

  async create(input: CreateUserSessionInput): Promise<UserSession> {
    this.createdSessions.push(input);
    const createdAt = this.clock();
    return {
      id: input.id,
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      deviceName: input.deviceName ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  async revokeAllForUser(): Promise<void> {
    // Not required for tests.
  }
}

export class InMemoryRegistrationUnitOfWork implements RegistrationUnitOfWork {
  constructor(private readonly ports: RegistrationPersistencePorts) {}

  async run<T>(work: (ports: RegistrationPersistencePorts) => Promise<T>): Promise<T> {
    return work(this.ports);
  }
}

export class DeterministicPasswordHasher implements PasswordHasher {
  public hashed: string[] = [];

  async hash(plainText: string): Promise<string> {
    this.hashed.push(plainText);
    return createHash('sha256').update(plainText).digest('hex');
  }

  async verify(hash: string, plainText: string): Promise<boolean> {
    const expected = createHash('sha256').update(plainText).digest('hex');
    return hash === expected;
  }
}

export class InMemoryVerificationTokenRepository
  implements UserEmailVerificationTokenRepository
{
  public tokens: UserEmailVerificationToken[] = [];
  public deletedForUser: string[] = [];

  constructor(private readonly clock: TestClock = () => new Date()) {}

  async create(
    input: CreateUserEmailVerificationTokenInput,
  ): Promise<UserEmailVerificationToken> {
    const createdAt = this.clock();
    const token: UserEmailVerificationToken = {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    this.tokens.push(token);
    return token;
  }

  async findActiveByTokenHash(
    tokenHash: string,
  ): Promise<UserEmailVerificationToken | null> {
    return (
      this.tokens.find(
        (token) => token.tokenHash === tokenHash && token.consumedAt === null,
      ) ?? null
    );
  }

  async markConsumed(
    id: string,
    consumedAt: Date,
  ): Promise<UserEmailVerificationToken> {
    const token = this.tokens.find((entry) => entry.id === id);
    if (!token) {
      throw new Error('Token not found');
    }
    token.consumedAt = consumedAt;
    token.updatedAt = this.clock();
    return token;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    this.deletedForUser.push(userId);
    this.tokens = this.tokens.filter((token) => token.userId !== userId);
  }
}

export class RecordingMailer implements MailerPort {
  public sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class InMemoryLogger implements Logger {
  public entries: Array<{ level: string; message: string }> = [];

  debug(message: string): void {
    this.entries.push({ level: 'debug', message });
  }

  info(message: string): void {
    this.entries.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.entries.push({ level: 'warn', message });
  }

  error(message: string): void {
    this.entries.push({ level: 'error', message });
  }

  withContext(): Logger {
    return this;
  }
}

export type RegisterServiceOptions = ConstructorParameters<
  typeof RegisterUserService
>[5];

export type LoginServiceOptions = ConstructorParameters<
  typeof LoginUserService
>[4];

export type AuthTestEnvironment = {
  registerService: RegisterUserService;
  loginService: LoginUserService;
  userRepository: InMemoryUserRepository;
  sessionRepository: RecordingUserSessionRepository;
  verificationTokens: InMemoryVerificationTokenRepository;
  passwordHasher: DeterministicPasswordHasher;
  registerMailer: RecordingMailer;
  registerLogger: InMemoryLogger;
  loginLogger: InMemoryLogger;
  clock: TestClock;
};

export const createAuthTestEnvironment = (
  options?: Partial<{
    register: Partial<RegisterServiceOptions>;
    login: Partial<LoginServiceOptions>;
    clock: TestClock;
  }>,
): AuthTestEnvironment => {
  const clock = options?.clock ?? (() => new Date());
  const userRepository = new InMemoryUserRepository(clock);
  const sessionRepository = new RecordingUserSessionRepository(clock);
  const passwordHasher = new DeterministicPasswordHasher();
  const verificationTokens = new InMemoryVerificationTokenRepository(clock);
  const registerMailer = new RecordingMailer();
  const registerLogger = new InMemoryLogger();
  const loginLogger = new InMemoryLogger();

  const registerOptions: RegisterServiceOptions = {
    requireEmailVerification: false,
    requireAdminApproval: false,
    baseUrl: 'https://app.local',
    ...(options?.register ?? {}),
  };

  const loginOptions: LoginServiceOptions = {
    requireEmailVerification: registerOptions.requireEmailVerification,
    requireAdminApproval: registerOptions.requireAdminApproval,
    ...(options?.login ?? {}),
  };

  const registerService = new RegisterUserService(
    userRepository,
    passwordHasher,
    registerMailer,
    registerLogger,
    new InMemoryRegistrationUnitOfWork({
      userRepository,
      userSessionRepository: sessionRepository,
      emailVerificationTokens: verificationTokens,
    }),
    registerOptions,
    clock,
  );

  const loginService = new LoginUserService(
    userRepository,
    sessionRepository,
    passwordHasher,
    loginLogger,
    loginOptions,
    clock,
  );

  return {
    registerService,
    loginService,
    userRepository,
    sessionRepository,
    verificationTokens,
    passwordHasher,
    registerMailer,
    registerLogger,
    loginLogger,
    clock,
  };
};

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type {
  Logger,
  MailMessage,
  MailerPort,
  PasswordHasher,
  UserEmailVerificationTokenRepository,
  UserRepository,
  UserSessionRepository,
} from '../../../src/core/app';
import { RegisterUserService } from '../../../src/core/app/services/auth/registerUser';
import type {
  CreateUserEmailVerificationTokenInput,
  CreateUserInput,
  CreateUserSessionInput,
  User,
  UserEmailVerificationToken,
  UserSession,
} from '../../../src/core/domain';

const fixedNow = new Date('2025-01-01T00:00:00.000Z');
const clock = () => new Date(fixedNow);

class InMemoryUserRepository implements UserRepository {
  public created: CreateUserInput | null = null;
  public usersByEmail = new Map<string, User>();
  public usersById = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const createdAt = clock();
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
    const updated: User = { ...user, emailVerifiedAt: verifiedAt, updatedAt: clock() };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async updateStatus(userId: string, status: User['status']): Promise<User> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error('User not found');
    const updated: User = { ...user, status, updatedAt: clock() };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error('User not found');
    const updated: User = { ...user, passwordHash, updatedAt: clock() };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  seed(user: User) {
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.usersById.set(user.id, user);
  }
}

class RecordingUserSessionRepository implements UserSessionRepository {
  public createdSessions: CreateUserSessionInput[] = [];

  async create(input: CreateUserSessionInput): Promise<UserSession> {
    this.createdSessions.push(input);
    const createdAt = clock();
    return {
      id: input.id,
      userId: input.userId,
      sessionToken: input.sessionToken,
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
    // Not exercised by the tests.
  }
}

class DeterministicPasswordHasher implements PasswordHasher {
  public hashed: string[] = [];

  async hash(plainText: string): Promise<string> {
    this.hashed.push(plainText);
    return `hashed:${plainText}`;
  }

  async verify(): Promise<boolean> {
    return true;
  }
}

class InMemoryVerificationTokenRepository implements UserEmailVerificationTokenRepository {
  public tokens: UserEmailVerificationToken[] = [];
  public deletedForUser: string[] = [];

  async create(input: CreateUserEmailVerificationTokenInput): Promise<UserEmailVerificationToken> {
    const createdAt = clock();
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

  async findActiveByTokenHash(tokenHash: string): Promise<UserEmailVerificationToken | null> {
    return this.tokens.find((token) => token.tokenHash === tokenHash && token.consumedAt === null) ?? null;
  }

  async markConsumed(id: string, consumedAt: Date): Promise<UserEmailVerificationToken> {
    const token = this.tokens.find((entry) => entry.id === id);
    if (!token) {
      throw new Error('Token not found');
    }
    token.consumedAt = consumedAt;
    token.updatedAt = clock();
    return token;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    this.deletedForUser.push(userId);
    this.tokens = this.tokens.filter((token) => token.userId !== userId);
  }
}

class RecordingMailer implements MailerPort {
  public sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class InMemoryLogger implements Logger {
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

const buildService = (overrides?: {
  repository?: InMemoryUserRepository;
  sessionRepository?: RecordingUserSessionRepository;
  passwordHasher?: DeterministicPasswordHasher;
  tokenRepository?: InMemoryVerificationTokenRepository;
  mailer?: RecordingMailer;
  options?: Partial<ConstructorParameters<typeof RegisterUserService>[6]>;
}) => {
  const repository = overrides?.repository ?? new InMemoryUserRepository();
  const sessionRepository = overrides?.sessionRepository ?? new RecordingUserSessionRepository();
  const passwordHasher = overrides?.passwordHasher ?? new DeterministicPasswordHasher();
  const tokenRepository = overrides?.tokenRepository ?? new InMemoryVerificationTokenRepository();
  const mailer = overrides?.mailer ?? new RecordingMailer();
  const logger = new InMemoryLogger();
  const options = {
    requireEmailVerification: false,
    requireAdminApproval: false,
    baseUrl: 'https://app.local',
    ...overrides?.options,
  };

  const service = new RegisterUserService(
    repository,
    sessionRepository,
    passwordHasher,
    tokenRepository,
    mailer,
    logger,
    options,
    clock,
  );

  return { service, repository, sessionRepository, passwordHasher, tokenRepository, mailer, logger };
};

test('rejects weak passwords without touching persistence', async () => {
  const { service, repository, passwordHasher } = buildService();

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'short',
  });

  assert.deepEqual(result, { ok: false, reason: 'weak-password' });
  assert.equal(repository.created, null);
  assert.equal(passwordHasher.hashed.length, 0);
});

test('returns email-taken when repository already contains the address', async () => {
  const { service, repository } = buildService();
  const existingUser: User = {
    id: 'user-1',
    name: 'Existing User',
    email: 'user@example.com',
    passwordHash: 'hashed:password',
    status: 'active',
    emailVerifiedAt: new Date('2024-12-31T00:00:00Z'),
    createdAt: new Date('2024-12-01T00:00:00Z'),
    updatedAt: new Date('2024-12-01T00:00:00Z'),
  };
  repository.seed(existingUser);

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.deepEqual(result, { ok: false, reason: 'email-taken' });
});

test('issues verification email and token when verification is required', async () => {
  const { service, tokenRepository, mailer } = buildService({
    options: { requireEmailVerification: true },
  });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'verify-email');
    assert.equal(result.session, undefined);
    assert.equal(result.user.status, 'pending');
  }

  assert.equal(tokenRepository.deletedForUser.length, 1);
  assert.equal(tokenRepository.tokens.length, 1);
  const tokenRecord = tokenRepository.tokens[0];
  const message = mailer.sent[0];
  assert.ok(message, 'mailer should send a verification email');
  const urlMatch = message.text.match(/https?:\/\/[\S]+/);
  assert.ok(urlMatch, 'verification URL should be present in email body');
  const urlText = urlMatch[0].replace(/\.$/, '');
  const verificationUrl = new URL(urlText);
  assert.equal(verificationUrl.origin + verificationUrl.pathname, 'https://app.local/auth/verify-email');
  const token = verificationUrl.searchParams.get('token');
  assert.ok(token, 'token should be present in the verification URL');
  const hashed = createHash('sha256').update(token).digest('hex');
  assert.equal(tokenRecord.tokenHash, hashed);
  const expectedExpiry = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000);
  assert.equal(tokenRecord.expiresAt.getTime(), expectedExpiry.getTime());
});

test('returns await-approval when admin approval is required', async () => {
  const { service, tokenRepository, mailer, sessionRepository } = buildService({
    options: { requireAdminApproval: true },
  });

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'await-approval');
    assert.equal(result.session, undefined);
    assert.equal(result.user.status, 'pending');
  }

  assert.equal(tokenRepository.tokens.length, 0);
  assert.equal(mailer.sent.length, 0);
  assert.equal(sessionRepository.createdSessions.length, 0);
});

test('creates a session when verification is not required', async () => {
  const { service, sessionRepository, passwordHasher } = buildService();

  const result = await service.register({
    name: 'Example User',
    email: 'user@example.com',
    password: 'P@ssword12345',
    rememberSession: true,
    sessionContext: { ipAddress: '203.0.113.10', userAgent: 'jest' },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nextStep, 'session-created');
    assert.ok(result.session);
    assert.equal(sessionRepository.createdSessions.length, 1);
    const created = sessionRepository.createdSessions[0];
    assert.equal(created.userId, result.user.id);
    assert.equal(created.ipAddress, '203.0.113.10');
    const expectedExpiry = new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.equal(created.expiresAt.getTime(), expectedExpiry.getTime());
    assert.equal(result.session?.expiresAt.getTime(), expectedExpiry.getTime());
    assert.ok(result.session?.token);
  }

  assert.deepEqual(passwordHasher.hashed, ['P@ssword12345']);
});

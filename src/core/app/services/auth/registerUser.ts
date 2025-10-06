import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  MailerPort,
  PasswordHasher,
  UserEmailVerificationTokenRepository,
  UserRepository,
  UserSessionRepository,
  Logger,
} from '@core/app';
import type { User } from '@core/domain';

export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  rememberSession?: boolean;
  sessionContext?: {
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceName?: string | null;
  };
};

export type RegisterUserResult =
  | { ok: false; reason: 'email-taken' | 'weak-password' }
  | {
      ok: true;
      user: User;
      nextStep: 'session-created' | 'verify-email' | 'await-approval';
      session?: { token: string; expiresAt: Date };
    };

const PASSWORD_MIN_LENGTH = 12;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SHORT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const isPasswordStrong = (password: string) =>
  password.length >= PASSWORD_MIN_LENGTH &&
  /[0-9]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class RegisterUserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailVerificationTokens: UserEmailVerificationTokenRepository,
    private readonly mailer: MailerPort,
    private readonly logger: Logger,
    private readonly options: {
      requireEmailVerification: boolean;
      requireAdminApproval: boolean;
      baseUrl: string;
      verificationTokenTtlMs?: number;
      defaultSessionTtlMs?: number;
      shortSessionTtlMs?: number;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async register(input: RegisterUserInput): Promise<RegisterUserResult> {
    const requestStartedAt = this.clock();
    if (!isPasswordStrong(input.password)) {
      this.logger.warn('Weak password rejected during registration.', {
        event: 'auth.registration.weak_password_rejected',
        outcome: 'rejected',
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });
      return { ok: false, reason: 'weak-password' };
    }

    const existing = await this.userRepository.findByEmail(input.email);

    if (existing) {
      this.logger.info('Registration attempt for existing email rejected.', {
        event: 'auth.registration.email_taken',
        outcome: 'conflict',
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });
      return { ok: false, reason: 'email-taken' };
    }

    const requireEmailVerification = this.options.requireEmailVerification;
    const requireAdminApproval = this.options.requireAdminApproval;

    const initialStatus: User['status'] =
      requireAdminApproval || requireEmailVerification ? 'pending' : 'active';

    const user = await this.userRepository.create({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash: await this.passwordHasher.hash(input.password),
      status: initialStatus,
      emailVerifiedAt: requireEmailVerification ? null : this.clock(),
    });

    this.logger.info('User registered successfully.', {
      event: 'auth.registration.created',
      outcome: 'success',
      userAnonId: user.id,
      durationMs: this.clock().getTime() - requestStartedAt.getTime(),
    });

    if (requireEmailVerification) {
      await this.emailVerificationTokens.deleteAllForUser(user.id);

      const verificationToken = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(verificationToken);
      const expiresAt = new Date(
        requestStartedAt.getTime() +
          (this.options.verificationTokenTtlMs ?? VERIFICATION_TOKEN_TTL_MS),
      );

      await this.emailVerificationTokens.create({
        id: randomUUID(),
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      const verificationUrl = new URL('/auth/verify-email', this.options.baseUrl);
      verificationUrl.searchParams.set('token', verificationToken);

      await this.mailer.send({
        to: { email: user.email, name: user.name },
        subject: 'Verify your My Race Engineer account',
        text: `Hi ${user.name},\n\nConfirm your email by visiting ${verificationUrl.toString()} before ${expiresAt.toISOString()}.`,
      });

      this.logger.info('Verification email dispatched.', {
        event: 'auth.registration.verification_sent',
        outcome: 'pending',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });

      return { ok: true, user, nextStep: 'verify-email' };
    }

    if (requireAdminApproval) {
      this.logger.info('Registration awaiting admin approval.', {
        event: 'auth.registration.awaiting_approval',
        outcome: 'pending',
        userAnonId: user.id,
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });

      return { ok: true, user, nextStep: 'await-approval' };
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const ttl = input.rememberSession
      ? (this.options.defaultSessionTtlMs ?? DEFAULT_SESSION_TTL_MS)
      : (this.options.shortSessionTtlMs ?? SHORT_SESSION_TTL_MS);

    const expiresAt = new Date(this.clock().getTime() + ttl);

    await this.userSessionRepository.create({
      id: randomUUID(),
      userId: user.id,
      sessionToken,
      expiresAt,
      ipAddress: input.sessionContext?.ipAddress ?? null,
      userAgent: input.sessionContext?.userAgent ?? null,
      deviceName: input.sessionContext?.deviceName ?? null,
    });

    this.logger.info('Session issued after registration.', {
      event: 'auth.registration.session_issued',
      outcome: 'success',
      userAnonId: user.id,
      durationMs: this.clock().getTime() - requestStartedAt.getTime(),
    });

    return {
      ok: true,
      user,
      nextStep: 'session-created',
      session: { token: sessionToken, expiresAt },
    };
  }
}

/**
 * Filename: src/core/app/services/auth/registerUser.ts
 * Purpose: Orchestrate domain logic for self-service user registrations and post-signup flows.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  MailerPort,
  PasswordHasher,
  RegistrationUnitOfWork,
  UserRepository,
  Logger,
} from '@core/app';
import { DuplicateUserDriverNameError, DuplicateUserEmailError } from '@core/app';
import type { User } from '@core/domain';

export type RegisterUserInput = {
  name: string;
  driverName: string;
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
  | { ok: false; reason: 'driver-name-taken'; suggestions: string[] }
  | {
      ok: true;
      user: User;
      nextStep:
        | 'session-created'
        | 'verify-email'
        | 'await-approval'
        | 'verify-email-await-approval';
      session?: { token: string; expiresAt: Date };
    };

const PASSWORD_MIN_LENGTH = 12;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SHORT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

// The server action performs the same password screening, but we repeat the guard here
// to protect against bypasses and to keep the business rule close to the password
// policy definition.
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
    private readonly passwordHasher: PasswordHasher,
    private readonly mailer: MailerPort,
    private readonly logger: Logger,
    private readonly unitOfWork: RegistrationUnitOfWork,
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
    // Track timings so every exit path can log how long the request took.  This mirrors
    // the approach in other auth services to make observability consistent.
    const requestStartedAt = this.clock();
    if (!isPasswordStrong(input.password)) {
      // Reject weak passwords before performing any database work.  Returning a
      // structured result lets the caller render a friendly message without exposing
      // internals.
      this.logger.warn('Weak password rejected during registration.', {
        event: 'auth.registration.weak_password_rejected',
        outcome: 'rejected',
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });
      return { ok: false, reason: 'weak-password' };
    }

    const existing = await this.userRepository.findByEmail(input.email);

    if (existing) {
      // We intentionally respond with a generic "email taken" reason rather than
      // signalling whether the account is active to avoid leaking account existence to
      // attackers.
      this.logger.info('Registration attempt for existing email rejected.', {
        event: 'auth.registration.email_taken',
        outcome: 'conflict',
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });
      return { ok: false, reason: 'email-taken' };
    }

    const driverNameOwner = await this.userRepository.findByDriverName(input.driverName);

    if (driverNameOwner) {
      this.logger.info('Registration attempt for existing driver name rejected.', {
        event: 'auth.registration.driver_name_taken',
        outcome: 'conflict',
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });
      const suggestions = await this.generateDriverNameSuggestions(input.driverName);
      return { ok: false, reason: 'driver-name-taken', suggestions };
    }

    const requireEmailVerification = this.options.requireEmailVerification;
    const requireAdminApproval = this.options.requireAdminApproval;
    const assignedRole = 'driver';

    const initialStatus: User['status'] =
      requireAdminApproval || requireEmailVerification ? 'pending' : 'active';

    // Create the user record with the appropriate initial status.  The password hash is
    // generated through the injected `PasswordHasher` so our cryptography choice is
    // swappable at the edge of the domain.
    const registrationStartedAt = this.clock();
    let verificationTokenValue: string | null = null;
    let verificationTokenExpiresAt: Date | null = null;
    let sessionTokenValue: string | null = null;
    let sessionExpiresAt: Date | null = null;

    let user: User;

    try {
      ({ user } = await this.unitOfWork.run(async (deps) => {
        const createdUser = await deps.userRepository.create({
          id: randomUUID(),
          name: input.name,
          driverName: input.driverName,
          email: input.email,
          passwordHash: await this.passwordHasher.hash(input.password),
          status: initialStatus,
          emailVerifiedAt: requireEmailVerification ? null : this.clock(),
        });

        if (requireEmailVerification) {
          await deps.emailVerificationTokens.deleteAllForUser(createdUser.id);

          verificationTokenValue = randomBytes(32).toString('base64url');
          verificationTokenExpiresAt = new Date(
            registrationStartedAt.getTime() +
              (this.options.verificationTokenTtlMs ?? VERIFICATION_TOKEN_TTL_MS),
          );

          await deps.emailVerificationTokens.create({
            id: randomUUID(),
            userId: createdUser.id,
            tokenHash: hashToken(verificationTokenValue),
            expiresAt: verificationTokenExpiresAt,
          });
        } else if (!requireAdminApproval) {
          sessionTokenValue = randomBytes(32).toString('base64url');
          const ttl = input.rememberSession
            ? (this.options.defaultSessionTtlMs ?? DEFAULT_SESSION_TTL_MS)
            : (this.options.shortSessionTtlMs ?? SHORT_SESSION_TTL_MS);

          sessionExpiresAt = new Date(this.clock().getTime() + ttl);

          await deps.userSessionRepository.create({
            id: randomUUID(),
            userId: createdUser.id,
            sessionTokenHash: hashToken(sessionTokenValue),
            expiresAt: sessionExpiresAt,
            ipAddress: input.sessionContext?.ipAddress ?? null,
            userAgent: input.sessionContext?.userAgent ?? null,
            deviceName: input.sessionContext?.deviceName ?? null,
          });
        }

        return { user: createdUser };
      }));
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        this.logger.info('Registration attempt failed due to duplicate email during creation.', {
          event: 'auth.registration.email_taken',
          outcome: 'conflict',
          durationMs: this.clock().getTime() - requestStartedAt.getTime(),
        });
        return { ok: false, reason: 'email-taken' };
      }

      if (error instanceof DuplicateUserDriverNameError) {
        this.logger.info(
          'Registration attempt failed due to duplicate driver name during creation.',
          {
            event: 'auth.registration.driver_name_taken',
            outcome: 'conflict',
            durationMs: this.clock().getTime() - requestStartedAt.getTime(),
          },
        );
        const suggestions = await this.generateDriverNameSuggestions(input.driverName);
        return { ok: false, reason: 'driver-name-taken', suggestions };
      }

      throw error;
    }

    const durationMs = this.clock().getTime() - requestStartedAt.getTime();
    const emailHash = createHash('sha256').update(user.email).digest('hex');

    this.logger.info('User registered successfully.', {
      event: 'auth.registration.created',
      outcome: 'success',
      userAnonId: user.id,
      userId: user.id,
      emailHash,
      role: assignedRole,
      adminApprovalRequired: requireAdminApproval,
      verificationRequired: requireEmailVerification,
      durationMs,
    });

    if (requireEmailVerification) {
      if (!verificationTokenValue || !verificationTokenExpiresAt) {
        throw new Error('Verification token state missing after transactional registration.');
      }

      const verificationToken: string = verificationTokenValue;
      const verificationExpiresAt: Date = verificationTokenExpiresAt;

      const verificationUrl = new URL('/auth/verify-email', this.options.baseUrl);
      verificationUrl.searchParams.set('token', verificationToken);

      try {
        await this.mailer.send({
          to: { email: user.email, name: user.name },
          subject: 'Verify your My Race Engineer account',
          text: `Hi ${user.name},\n\nConfirm your email by visiting ${verificationUrl.toString()} before ${verificationExpiresAt.toISOString()}.`,
        });
      } catch (error) {
        await this.cleanupFailedRegistration(user.id);
        throw error;
      }

      this.logger.info('Verification email dispatched.', {
        event: 'auth.registration.email_verification_sent',
        outcome: 'pending',
        userAnonId: user.id,
        userId: user.id,
        emailHash,
        adminApprovalRequired: requireAdminApproval,
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });

      const nextStep = requireAdminApproval ? 'verify-email-await-approval' : 'verify-email';

      return { ok: true, user, nextStep };
    }

    if (requireAdminApproval) {
      this.logger.info('Registration awaiting admin approval.', {
        event: 'auth.registration.awaiting_admin_approval',
        outcome: 'pending',
        userAnonId: user.id,
        userId: user.id,
        emailHash,
        durationMs: this.clock().getTime() - requestStartedAt.getTime(),
      });

      return { ok: true, user, nextStep: 'await-approval' };
    }

    if (!sessionTokenValue || !sessionExpiresAt) {
      throw new Error('Session state missing after transactional registration.');
    }

    const sessionToken: string = sessionTokenValue;
    const expiresAt: Date = sessionExpiresAt;

    this.logger.info('Session issued after registration.', {
      event: 'auth.registration.session_issued',
      outcome: 'success',
      userAnonId: user.id,
      userId: user.id,
      durationMs: this.clock().getTime() - requestStartedAt.getTime(),
    });

    return {
      ok: true,
      user,
      nextStep: 'session-created',
      session: { token: sessionToken, expiresAt },
    };
  }

  private async cleanupFailedRegistration(userId: string): Promise<void> {
    try {
      await this.unitOfWork.run(async (deps) => {
        await deps.emailVerificationTokens.deleteAllForUser(userId);
        await deps.userRepository.deleteById(userId);
      });
    } catch (cleanupError) {
      const errorPayload =
        cleanupError instanceof Error
          ? { name: cleanupError.name, message: cleanupError.message }
          : { name: 'UnknownCleanupError', message: 'Non-error thrown during cleanup.' };

      this.logger.error('Failed to clean up registration after downstream failure.', {
        event: 'auth.registration.cleanup_failed',
        outcome: 'error',
        userAnonId: userId,
        error: errorPayload,
      });
    }
  }

  private async generateDriverNameSuggestions(requested: string, limit = 3): Promise<string[]> {
    const trimmed = requested.trim();
    if (!trimmed) {
      return [];
    }

    const normalised = trimmed.replace(/\s+/g, ' ');
    const baseWithoutTrailingNumber = normalised.replace(/\d+$/, '').trim() || normalised;
    const candidateBases = Array.from(
      new Set([
        normalised,
        baseWithoutTrailingNumber,
        baseWithoutTrailingNumber.replace(/[-_]+$/, '').trim() || baseWithoutTrailingNumber,
      ]),
    ).filter((value) => value.length > 0);

    const suggestions: string[] = [];
    const seen = new Set<string>();
    const ensureUniqueLower = (value: string) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    };

    const tryAddCandidate = async (candidate: string) => {
      const proposal = candidate.trim();
      if (!proposal || !ensureUniqueLower(proposal)) {
        return;
      }

      const existing = await this.userRepository.findByDriverName(proposal);
      if (!existing) {
        suggestions.push(proposal);
      }
    };

    let suffix = 2;
    let attempts = 0;
    const maxAttempts = 60;

    while (suggestions.length < limit && attempts < maxAttempts) {
      for (const base of candidateBases) {
        if (suggestions.length >= limit) {
          break;
        }

        await tryAddCandidate(`${base} ${suffix}`);
        attempts += 1;

        if (suggestions.length >= limit || attempts >= maxAttempts) {
          break;
        }

        await tryAddCandidate(`${base}${suffix}`);
        attempts += 1;

        if (suggestions.length >= limit || attempts >= maxAttempts) {
          break;
        }
      }

      suffix += 1;
    }

    if (suggestions.length >= limit) {
      return suggestions.slice(0, limit);
    }

    while (suggestions.length < limit && attempts < maxAttempts) {
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      for (const base of candidateBases) {
        if (suggestions.length >= limit) {
          break;
        }
        await tryAddCandidate(`${base} ${randomSuffix}`);
        attempts += 1;
        if (attempts >= maxAttempts) {
          break;
        }
      }
    }

    return suggestions.slice(0, limit);
  }
}

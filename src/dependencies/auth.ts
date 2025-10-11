/**
 * Filename: src/dependencies/auth.ts
 * Purpose: Wire authentication services with Prisma repositories, mailers, and runtime configuration.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import {
  ConfirmPasswordResetService,
  ValidateSessionTokenService,
  LoginUserService,
  RegisterUserService,
  StartPasswordResetService,
  VerifyEmailService,
  type Logger,
  type LoggerContext,
} from '@core/app';
import {
  ConsoleMailer,
  PrismaPasswordResetTokenRepository,
  PrismaUserEmailVerificationTokenRepository,
  PrismaUserRepository,
  PrismaUserSessionRepository,
  PrismaRegistrationUnitOfWork,
  createCompositeLogger,
  createNodemailerMailer,
  createPinoLogger,
} from '@core/infra';
import { applicationLogger, loggerEnvironmentConfig } from '@/dependencies/logger';
import { getEnvironment } from '@/server/config/environment';
import { Argon2PasswordHasher } from '@/lib/auth/passwordHasher';

// The dependency wiring in this module centralises the concrete implementations used by
// the authentication flow.  By keeping the configuration in one place we can swap out
// infrastructure without touching the business logic (e.g. change the mail driver or
// the persistence layer) and we get strongly typed guarantees from the service
// constructors.

// Repositories expose the persistence interfaces required by the app-layer services.
// Each Prisma-backed repository shares the same database connection pool so the
// services can be treated as stateless singletons.
const userRepository = new PrismaUserRepository();
const userSessionRepository = new PrismaUserSessionRepository();
const emailVerificationTokens = new PrismaUserEmailVerificationTokenRepository();
const passwordResetTokens = new PrismaPasswordResetTokenRepository();
const registrationUnitOfWork = new PrismaRegistrationUnitOfWork();
const passwordHasher = new Argon2PasswordHasher();
const environment = getEnvironment();

const requireEmailVerification = environment.features.requireEmailVerification;
const requireAdminApproval = environment.features.requireAdminApproval;
const baseUrl = environment.appUrl.toString();
const mailerDriver = process.env.MAILER_DRIVER?.toLowerCase() || 'console';
const mailerLogger = applicationLogger.withContext({ route: 'mailer' });
// The mailer is resolved lazily so we can validate configuration and select the
// transport at runtime.  Production deployments can opt into SMTP while local
// development falls back to the ConsoleMailer for a zero-config experience.
const mailer = (() => {
  if (mailerDriver === 'smtp' || mailerDriver === 'nodemailer') {
    const connectionUrl = process.env.SMTP_URL?.trim();
    const fromEmail = process.env.MAIL_FROM_EMAIL?.trim();
    const fromName = process.env.MAIL_FROM_NAME?.trim();

    if (!connectionUrl) {
      throw new Error('SMTP_URL must be configured when MAILER_DRIVER is set to smtp.');
    }

    if (!fromEmail) {
      throw new Error('MAIL_FROM_EMAIL must be configured when MAILER_DRIVER is set to smtp.');
    }

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    return createNodemailerMailer(connectionUrl, { from }, mailerLogger);
  }

  return new ConsoleMailer(mailerLogger);
})();

const authFileLogger = loggerEnvironmentConfig.disableFileLogs
  ? undefined
  : createPinoLogger({
      ...loggerEnvironmentConfig,
      disableConsoleLogs: true,
      fileNamePrefix: 'auth',
    });

const authLogger = authFileLogger
  ? createCompositeLogger(applicationLogger, authFileLogger)
  : applicationLogger;

const createAuthFlowLogger = (route: string) => authLogger.withContext({ route });

export const getAuthRequestLogger = (context: LoggerContext): Logger =>
  createAuthFlowLogger(context.route ?? 'auth').withContext(context);

const registerLogger = createAuthFlowLogger('auth/register');
const loginLogger = createAuthFlowLogger('auth/login');
const verifyEmailLogger = createAuthFlowLogger('auth/verify-email');
const passwordResetStartLogger = createAuthFlowLogger('auth/reset/start');
const passwordResetConfirmLogger = createAuthFlowLogger('auth/reset/confirm');
const sessionValidationLogger = createAuthFlowLogger('auth/session');

export const registerUserService = new RegisterUserService(
  userRepository,
  passwordHasher,
  mailer,
  registerLogger,
  registrationUnitOfWork,
  {
    // Feature flags toggle post-registration requirements without touching the page or
    // action logic.  Passing them in via the options object makes the expectations
    // explicit in tests.
    requireEmailVerification,
    requireAdminApproval,
    baseUrl,
  },
);

// The login service encapsulates the full credential validation workflow plus session
// creation.  Note how we only pass the dependencies it actually needs; this keeps the
// constructor honest and the service easy to unit test with fakes.
export const loginUserService = new LoginUserService(
  userRepository,
  userSessionRepository,
  passwordHasher,
  loginLogger,
  {
    requireEmailVerification,
    requireAdminApproval,
  },
);

export const verifyEmailService = new VerifyEmailService(
  userRepository,
  emailVerificationTokens,
  verifyEmailLogger,
  { requireAdminApproval },
);

export const startPasswordResetService = new StartPasswordResetService(
  userRepository,
  passwordResetTokens,
  mailer,
  passwordResetStartLogger,
  { baseUrl },
);

export const confirmPasswordResetService = new ConfirmPasswordResetService(
  userRepository,
  passwordResetTokens,
  userSessionRepository,
  passwordHasher,
  passwordResetConfirmLogger,
);

export const validateSessionTokenService = new ValidateSessionTokenService(
  userSessionRepository,
  userRepository,
  sessionValidationLogger,
);

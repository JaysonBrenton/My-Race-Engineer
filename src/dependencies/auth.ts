import {
  ConfirmPasswordResetService,
  LoginUserService,
  RegisterUserService,
  StartPasswordResetService,
  VerifyEmailService,
} from '@core/app';
import {
  ConsoleMailer,
  PrismaPasswordResetTokenRepository,
  PrismaUserEmailVerificationTokenRepository,
  PrismaUserRepository,
  PrismaUserSessionRepository,
  createNodemailerMailer,
} from '@core/infra';
import { applicationLogger } from '@/dependencies/logger';
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
const passwordHasher = new Argon2PasswordHasher();
const requireEmailVerification =
  process.env.FEATURE_REQUIRE_EMAIL_VERIFICATION?.toLowerCase() === 'true';
const requireAdminApproval = process.env.FEATURE_REQUIRE_ADMIN_APPROVAL?.toLowerCase() === 'true';
const baseUrl = process.env.APP_URL?.trim() || 'http://localhost:3001';
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

const registerLogger = applicationLogger.withContext({ route: 'auth/register' });
const loginLogger = applicationLogger.withContext({ route: 'auth/login' });
const verifyEmailLogger = applicationLogger.withContext({ route: 'auth/verify-email' });
const passwordResetStartLogger = applicationLogger.withContext({ route: 'auth/reset/start' });
const passwordResetConfirmLogger = applicationLogger.withContext({ route: 'auth/reset/confirm' });

export const registerUserService = new RegisterUserService(
  userRepository,
  userSessionRepository,
  passwordHasher,
  emailVerificationTokens,
  mailer,
  registerLogger,
  {
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

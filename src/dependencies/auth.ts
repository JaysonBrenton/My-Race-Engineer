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

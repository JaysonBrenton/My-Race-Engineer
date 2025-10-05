import { LoginUserService, RegisterUserService } from '@core/app';
import { PrismaUserRepository, PrismaUserSessionRepository } from '@core/infra';

import { Argon2PasswordHasher } from '@/lib/auth/passwordHasher';

const userRepository = new PrismaUserRepository();
const userSessionRepository = new PrismaUserSessionRepository();
const passwordHasher = new Argon2PasswordHasher();
const requireEmailVerification =
  process.env.FEATURE_REQUIRE_EMAIL_VERIFICATION?.toLowerCase() === 'true';

export const registerUserService = new RegisterUserService(userRepository, passwordHasher);

export const loginUserService = new LoginUserService(
  userRepository,
  userSessionRepository,
  passwordHasher,
  requireEmailVerification,
);

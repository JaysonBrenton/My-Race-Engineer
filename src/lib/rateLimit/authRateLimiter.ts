import { checkRateLimit, type RateLimitResult } from './memoryRateLimiter';

const RATE_LIMIT_CONFIG = {
  register: { limit: 5, windowMs: 1000 * 60 * 10 },
  login: { limit: 10, windowMs: 1000 * 60 * 5 },
};

export const checkRegisterRateLimit = (
  identifier: string,
  now: number = Date.now(),
): RateLimitResult =>
  checkRateLimit(
    'auth:register',
    identifier,
    RATE_LIMIT_CONFIG.register.limit,
    RATE_LIMIT_CONFIG.register.windowMs,
    now,
  );

export const checkLoginRateLimit = (
  identifier: string,
  now: number = Date.now(),
): RateLimitResult =>
  checkRateLimit(
    'auth:login',
    identifier,
    RATE_LIMIT_CONFIG.login.limit,
    RATE_LIMIT_CONFIG.login.windowMs,
    now,
  );

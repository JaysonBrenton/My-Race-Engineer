'use server';

/**
 * Filename: src/app/(auth)/auth/login/actions.ts
 * Purpose: Validate login submissions, enforce security controls, and issue authenticated sessions.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getAuthRequestLogger, loginUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { createLogFingerprint } from '@/lib/logging/fingerprint';
import { withSpan } from '@/lib/observability/tracing';
import { checkLoginRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';
import { isCookieSecure } from '@/server/runtime';

// This server action executes the full login flow: it validates inputs, enforces
// rate limits, delegates credential checks to the domain service, and finally
// mints the session cookie.  Keeping the orchestration here allows the UI to
// remain a simple form post while the critical logic stays on the server.

// Zod schema ensures we sanitise and normalise the form payload before handing
// it to the service layer.  Errors surface back to the UI through redirect
// parameters so we can display contextual messages.
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(320, 'Email addresses must be 320 characters or fewer.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.'),
  remember: z.literal('true').optional(),
});

// Helper for rebuilding the login URL with query-string flags.  We rely on
// redirects instead of rendering in-place so that the page stays statically
// typed and resilient across refreshes.
const buildRedirectUrl = (pathname: string, searchParams: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

// FormData can return strings, File objects, or nulls; this helper standardises
// access to optional text fields.
const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

// Only whitelisted, non-sensitive fields are rehydrated on validation errors.  Password
// inputs are intentionally excluded so we never echo secrets back to the browser.
const buildPrefillParam = (prefill: { email?: string | null | undefined }): string | undefined => {
  const safeEntries = Object.entries(prefill)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => [key, (value as string).trim()]);

  if (safeEntries.length === 0) {
    return undefined;
  }

  try {
    return JSON.stringify(Object.fromEntries(safeEntries));
  } catch {
    return undefined;
  }
};

type LoginService = Pick<typeof loginUserService, 'login'>;

export type LoginActionDependencies = {
  headers: typeof headers;
  cookies: typeof cookies;
  redirect: typeof redirect;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  checkLoginRateLimit: typeof checkLoginRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  extractClientIdentifier: typeof extractClientIdentifier;
  createLogFingerprint: typeof createLogFingerprint;
  withSpan: typeof withSpan;
  getAuthRequestLogger: typeof getAuthRequestLogger;
  loginUserService: LoginService;
  isCookieSecure: typeof isCookieSecure;
};

const defaultLoginActionDependencies: LoginActionDependencies = {
  headers,
  cookies,
  redirect,
  guardAuthPostOrigin,
  checkLoginRateLimit,
  validateAuthFormToken,
  extractClientIdentifier,
  createLogFingerprint,
  withSpan,
  getAuthRequestLogger,
  loginUserService,
  isCookieSecure,
};

export const createLoginAction = (
  deps: LoginActionDependencies = defaultLoginActionDependencies,
) =>
  async (formData: FormData) => {
    const requestStartedAt = Date.now();
    // The client identifier combines IP and user-agent hints so the rate limiter
    // can throttle burst attempts without locking out legitimate users sharing an
    // address (e.g. team pit wall).
    const headersList = deps.headers();
    const requestId = headersList.get('x-request-id') ?? randomUUID();

    await deps.withSpan(
      'auth.login',
      {
        'mre.request_id': requestId,
        'http.route': 'auth/login',
      },
      async (span) => {
        const logger = deps.getAuthRequestLogger({
          requestId,
          route: 'auth/login',
        });

        deps.guardAuthPostOrigin(
          headersList,
          () =>
            deps.redirect(
              buildRedirectUrl('/auth/login', {
                error: 'invalid-origin',
              }),
            ),
          {
            route: 'auth/login',
            logger,
          },
        );

        const identifier = deps.extractClientIdentifier(headersList);
        const clientFingerprint =
          identifier === 'unknown' ? undefined : deps.createLogFingerprint(identifier);
        if (clientFingerprint) {
          span.setAttribute('mre.auth.client_fingerprint', clientFingerprint);
        }

        logger.info('Processing login submission.', {
          event: 'auth.login.submission_received',
          outcome: 'processing',
          clientFingerprint,
        });

        const rateLimit = deps.checkLoginRateLimit(identifier);
        if (!rateLimit.ok) {
          span.setAttribute('mre.auth.outcome', 'rate_limited');
          span.setAttribute('mre.auth.retry_after_ms', rateLimit.retryAfterMs);
          // When the rate limiter trips we short-circuit to the login page with a
          // dedicated error code.  The redirect prevents timing attacks that could
          // differentiate between throttled and rejected credentials.
          logger.warn('Login blocked by rate limiter.', {
            event: 'auth.login.rate_limited',
            outcome: 'blocked',
            clientFingerprint,
            retryAfterMs: rateLimit.retryAfterMs,
            durationMs: Date.now() - requestStartedAt,
          });
          deps.redirect(
            buildRedirectUrl('/auth/login', {
              error: 'rate-limited',
            }),
          );
        }

        const token = getFormValue(formData, 'formToken');
        const tokenValidation = deps.validateAuthFormToken(token ?? null, 'login');

        if (!tokenValidation.ok) {
          span.setAttribute('mre.auth.outcome', 'invalid_token');
          // Missing or stale CSRF tokens are treated as an invalid session.  The UI
          // invites the user to refresh so they pick up a fresh token value.
          logger.warn('Login rejected due to invalid form token.', {
            event: 'auth.login.invalid_token',
            outcome: 'rejected',
            clientFingerprint,
            durationMs: Date.now() - requestStartedAt,
          });
          deps.redirect(
            buildRedirectUrl('/auth/login', {
              error: 'invalid-token',
            }),
          );
        }

        const parseResult = loginSchema.safeParse({
          email: getFormValue(formData, 'email'),
          password: getFormValue(formData, 'password'),
          remember: getFormValue(formData, 'remember'),
        });

        if (!parseResult.success) {
          span.setAttribute('mre.auth.outcome', 'validation_failed');
          // Validation failures flow back with the email preserved so the user does
          // not have to re-type it, reducing friction for simple typos.
          const issues = parseResult.error.issues.map((issue) => ({
            path: issue.path.map((segment) => segment.toString()).join('.') || 'root',
            code: issue.code,
            message: issue.message,
          }));
          logger.warn('Login rejected due to validation errors.', {
            event: 'auth.login.validation_failed',
            outcome: 'rejected',
            clientFingerprint,
            validationIssues: issues,
            durationMs: Date.now() - requestStartedAt,
          });
          deps.redirect(
            buildRedirectUrl('/auth/login', {
              error: 'validation',
              prefill: buildPrefillParam({ email: getFormValue(formData, 'email') }),
            }),
          );
        }

        const { email, password, remember } = parseResult.data;
        const userAgent = headersList.get('user-agent');
        const emailFingerprint = deps.createLogFingerprint(email);
        const rememberSession = remember === 'true';

        if (emailFingerprint) {
          span.setAttribute('mre.auth.email_fingerprint', emailFingerprint);
        }
        span.setAttribute('mre.auth.remember_session', rememberSession);

        logger.info('Login payload validated.', {
          event: 'auth.login.payload_validated',
          outcome: 'processing',
          clientFingerprint,
          emailFingerprint,
          rememberSession,
        });

        const result = await deps.loginUserService.login({
          email,
          password,
          rememberSession,
          sessionContext: {
            ipAddress: identifier === 'unknown' ? null : identifier,
            userAgent,
          },
        });

        if (!result.ok) {
          // Domain-level errors (unverified email, suspended account, etc.) are
          // surfaced to the page so we can display precise guidance without leaking
          // sensitive details to the attacker.
          span.setAttribute('mre.auth.outcome', result.reason);
          logger.info('Login attempt failed in domain service.', {
            event: `auth.login.${result.reason.replace(/-/g, '_')}`,
            outcome: 'rejected',
            clientFingerprint,
            emailFingerprint,
            durationMs: Date.now() - requestStartedAt,
          });
          deps.redirect(
            buildRedirectUrl('/auth/login', {
              error: result.reason,
              prefill: buildPrefillParam({ email }),
            }),
          );
        }

        const cookieJar = deps.cookies();
        const expiresAt = result.expiresAt;
        const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
        // The session cookie is httpOnly and same-site lax so it is resilient against
        // XSS and CSRF while still allowing multi-tab usage.  We rely on the TTL
        // returned by the service to synchronise browser and database expirations.
        cookieJar.set({
          name: 'mre_session',
          value: result.sessionToken,
          httpOnly: true,
          sameSite: 'lax',
          secure: deps.isCookieSecure(),
          path: '/',
          expires: expiresAt,
          maxAge,
        });

        span.setAttribute('mre.auth.outcome', 'success');
        span.setAttribute('mre.auth.session_expires_at', expiresAt.toISOString());

        logger.info('Login succeeded; session cookie issued.', {
          event: 'auth.login.success',
          outcome: 'success',
          clientFingerprint,
          emailFingerprint,
          rememberSession,
          sessionExpiresAt: result.expiresAt.toISOString(),
          durationMs: Date.now() - requestStartedAt,
        });

        deps.redirect('/dashboard');
      },
    );
  };

export const loginAction = createLoginAction();

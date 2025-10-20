/**
 * Filename: src/app/(auth)/auth/login/actions.impl.ts
 * Purpose: Validate login submissions, enforce security controls, and issue authenticated sessions.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getAuthRequestLogger, loginUserService } from '@/dependencies/auth';
import { fingerprintAuthFormToken, validateAuthFormToken } from '@/lib/auth/formTokens';
import { createLogFingerprint } from '@/lib/logging/fingerprint';
import { withSpan, type SpanAdapter, type WithSpan } from '@/lib/observability/tracing';
import { checkLoginRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { computeCookieSecure, type CookieSecureStrategy } from '@/server/runtime/cookies';
import { guardAuthPostOrigin } from '@/server/security/origin';
import type { AuthActionDebugEvent } from '@/server/security/authDebug';

type RedirectHref = Parameters<typeof redirect>[0];

// This server action executes the full login flow: it validates inputs, enforces
// rate limits, delegates credential checks to the domain service, and finally
// mints the session cookie.  Keeping the orchestration here allows the UI to
// remain a simple form post while the critical logic stays on the server.

// Zod schema ensures we sanitise and normalise the form payload before handing
// it to the service layer.  Errors surface back to the UI through redirect
// parameters so we can display contextual messages.
const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address or driver name.')
  .max(320, 'Email addresses must be 320 characters or fewer.');

const emailIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(320, 'Email addresses must be 320 characters or fewer.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

const driverNameIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your driver name.')
  .max(60, 'Driver names must be 60 characters or fewer.');

const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'Enter your password.'),
  remember: z.literal('true').optional(),
});

// Helper for rebuilding the login URL with query-string flags.  We rely on
// redirects instead of rendering in-place so that the page stays statically
// typed and resilient across refreshes.
const buildRedirectUrl = (
  pathname: Route,
  searchParams: Record<string, string | undefined>,
): RedirectHref => {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  const target = query ? `${pathname}?${query}` : pathname;
  return target as RedirectHref;
};

// FormData can return strings, File objects, or nulls; this helper standardises
// access to optional text fields.
const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

// Only whitelisted, non-sensitive fields are rehydrated on validation errors.  Password
// inputs are intentionally excluded so we never echo secrets back to the browser.
type LoginPrefillInput = {
  identifier?: string | null | undefined;
};

const buildPrefillParam = (prefill: LoginPrefillInput): string | undefined => {
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
  redirect: (url: RedirectHref) => never;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  checkLoginRateLimit: typeof checkLoginRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  extractClientIdentifier: typeof extractClientIdentifier;
  createLogFingerprint: typeof createLogFingerprint;
  withSpan: WithSpan;
  getAuthRequestLogger: typeof getAuthRequestLogger;
  loginUserService: LoginService;
  computeCookieSecure: typeof computeCookieSecure;
};

export type LoginActionOptions = {
  onDebugEvent?: (event: AuthActionDebugEvent) => void;
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
  computeCookieSecure,
};

const parseCookieSecureStrategy = (value: string | undefined): CookieSecureStrategy | undefined => {
  if (value === 'auto' || value === 'always' || value === 'never') {
    return value;
  }

  return undefined;
};

const resolveCookieSecureStrategy = (): CookieSecureStrategy =>
  parseCookieSecureStrategy(
    process.env.COOKIE_SECURE_STRATEGY as CookieSecureStrategy | undefined,
  ) ?? (process.env.NODE_ENV === 'production' ? 'auto' : 'never');

export type LoginAction = (formData: FormData) => Promise<void>;

export const createLoginAction = (
  deps: LoginActionDependencies = defaultLoginActionDependencies,
  options: LoginActionOptions = {},
): LoginAction => {
  return async (formData: FormData): Promise<void> => {
    const requestStartedAt = Date.now();
    // The client identifier combines IP and user-agent hints so the rate limiter
    // can throttle burst attempts without locking out legitimate users sharing an
    // address (e.g. team pit wall).
    const headersList = await deps.headers();
    const requestId = headersList.get('x-request-id') ?? randomUUID();
    const emitDebugEvent = options.onDebugEvent;

    await deps.withSpan(
      'auth.login',
      {
        'mre.request_id': requestId,
        'http.route': 'auth/login',
      },
      async (span: SpanAdapter): Promise<void> => {
        const logger = deps.getAuthRequestLogger({
          requestId,
          route: 'auth/login',
        });

        const originHeader = headersList.get('origin');
        const originGuardHeader = headersList.get('x-auth-origin-guard');
        const methodHeader =
          headersList.get('x-http-method-override') ??
          headersList.get('x-mre-http-method') ??
          'POST';

        logger.info('Login request received.', {
          event: 'auth.login.request',
          outcome: 'received',
          hasOriginHeader: Boolean(originHeader),
          originAllowed: originGuardHeader ? originGuardHeader !== 'mismatch' : null,
          method: methodHeader,
        });

        const recordOutcome = (outcome: {
          kind: 'redirect' | 'rerender';
          target?: string;
          statusKey?: string;
        }) => {
          logger.info('Login outcome resolved.', {
            event: 'auth.login.outcome',
            kind: outcome.kind,
            target: outcome.target,
            statusKey: outcome.statusKey,
          });
          emitDebugEvent?.({
            type: 'outcome',
            kind: outcome.kind,
            target: outcome.target,
            statusKey: outcome.statusKey,
          });
        };

        deps.guardAuthPostOrigin(
          headersList,
          () => {
            const target = buildRedirectUrl('/auth/login', {
              error: 'invalid-origin',
            });
            recordOutcome({ kind: 'redirect', target, statusKey: 'invalid-origin' });
            return deps.redirect(target);
          },
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
          const target = buildRedirectUrl('/auth/login', {
            error: 'rate-limited',
          });
          recordOutcome({ kind: 'redirect', target, statusKey: 'rate-limited' });
          deps.redirect(target);
        }

        const token = getFormValue(formData, 'formToken');
        const tokenFingerprint = token ? fingerprintAuthFormToken(token) : null;
        const tokenValidation = deps.validateAuthFormToken(token ?? null, 'login');
        const tokenAgeMs = tokenValidation.ok
          ? Date.now() - tokenValidation.issuedAt.getTime()
          : null;

        if (tokenValidation.ok) {
          logger.info('Login form token validated.', {
            event: 'auth.formToken.validate',
            result: 'ok',
            action: 'login',
            tokenFingerprint,
            tokenAgeMs,
          });
          emitDebugEvent?.({
            type: 'token-validation',
            status: 'ok',
            fingerprint: tokenFingerprint,
            ageMs: tokenAgeMs,
          });
        } else {
          const status = tokenValidation.reason === 'expired' ? 'expired' : 'invalid';
          logger.warn('Login form token rejected.', {
            event: 'auth.formToken.validate',
            result: status,
            action: 'login',
            reason: tokenValidation.reason,
            tokenFingerprint,
            tokenAgeMs,
          });
          emitDebugEvent?.({
            type: 'token-validation',
            status,
            reason: tokenValidation.reason,
            fingerprint: tokenFingerprint,
            ageMs: tokenAgeMs,
          });
        }

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
          const target = buildRedirectUrl('/auth/login', {
            error: 'invalid-token',
          });
          recordOutcome({ kind: 'redirect', target, statusKey: 'invalid-token' });
          deps.redirect(target);
        }

        const parseResult = loginSchema.safeParse({
          identifier: getFormValue(formData, 'identifier'),
          password: getFormValue(formData, 'password'),
          remember: getFormValue(formData, 'remember'),
        });

        if (!parseResult.success) {
          span.setAttribute('mre.auth.outcome', 'validation_failed');
          // Validation failures flow back with the identifier preserved so the user does
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
          logger.info('Login validation summary.', {
            event: 'auth.login.validation',
            result: 'invalid',
            issues: issues.map((issue) => issue.path),
          });
          const target = buildRedirectUrl('/auth/login', {
            error: 'validation',
            prefill: buildPrefillParam({ identifier: getFormValue(formData, 'identifier') }),
          });
          recordOutcome({ kind: 'redirect', target, statusKey: 'validation' });
          deps.redirect(target);
        }

        logger.info('Login validation summary.', {
          event: 'auth.login.validation',
          result: 'ok',
        });

        const { identifier: rawIdentifier, password, remember } = parseResult.data;
        const identifierLooksLikeEmail = rawIdentifier.includes('@');
        const identifierCheck = identifierLooksLikeEmail
          ? emailIdentifierSchema.safeParse(rawIdentifier)
          : driverNameIdentifierSchema.safeParse(rawIdentifier);

        if (!identifierCheck.success) {
          span.setAttribute('mre.auth.outcome', 'validation_failed');
          const issues = identifierCheck.error.issues.map((issue) => ({
            path: 'identifier',
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
          logger.info('Login validation summary.', {
            event: 'auth.login.validation',
            result: 'invalid',
            issues: issues.map((issue) => issue.path),
          });
          const target = buildRedirectUrl('/auth/login', {
            error: 'validation',
            prefill: buildPrefillParam({ identifier: rawIdentifier }),
          });
          recordOutcome({ kind: 'redirect', target, statusKey: 'validation' });
          deps.redirect(target);
        }

        const normalisedIdentifier = identifierCheck.data;
        const identifierKind = identifierLooksLikeEmail ? 'email' : 'driver-name';
        const userAgent = headersList.get('user-agent');
        const identifierFingerprint = deps.createLogFingerprint(normalisedIdentifier);
        const rememberSession = remember === 'true';

        span.setAttribute('mre.auth.identifier_type', identifierKind);
        if (identifierKind === 'email' && identifierFingerprint) {
          span.setAttribute('mre.auth.email_fingerprint', identifierFingerprint);
        }
        if (identifierKind === 'driver-name' && identifierFingerprint) {
          span.setAttribute('mre.auth.driver_name_fingerprint', identifierFingerprint);
        }
        span.setAttribute('mre.auth.remember_session', rememberSession);

        logger.info('Login payload validated.', {
          event: 'auth.login.payload_validated',
          outcome: 'processing',
          clientFingerprint,
          ...(identifierKind === 'email'
            ? { emailFingerprint: identifierFingerprint }
            : { driverNameFingerprint: identifierFingerprint }),
          rememberSession,
        });

        const result = await deps.loginUserService.login({
          identifier: { kind: identifierKind, value: normalisedIdentifier },
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
            ...(identifierKind === 'email'
              ? { emailFingerprint: identifierFingerprint }
              : { driverNameFingerprint: identifierFingerprint }),
            durationMs: Date.now() - requestStartedAt,
          });
          const target = buildRedirectUrl('/auth/login', {
            error: result.reason,
            prefill: buildPrefillParam({ identifier: rawIdentifier }),
          });
          recordOutcome({ kind: 'redirect', target, statusKey: result.reason });
          deps.redirect(target);
        }

        const cookieJar = await deps.cookies();
        const expiresAt = result.expiresAt;
        const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
        // The session cookie is httpOnly and same-site lax so it is resilient against
        // XSS and CSRF while still allowing multi-tab usage.  We rely on the TTL
        // returned by the service to synchronise browser and database expirations.
        const secure = await deps.computeCookieSecure({
          strategy: resolveCookieSecureStrategy(),
          trustProxy: process.env.TRUST_PROXY === 'true',
          appUrl: process.env.APP_URL ?? null,
          forwardedProto: headersList.get('x-forwarded-proto'),
        });

        cookieJar.set({
          name: 'mre_session',
          value: result.sessionToken,
          httpOnly: true,
          sameSite: 'lax',
          secure,
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
          ...(identifierKind === 'email'
            ? { emailFingerprint: identifierFingerprint }
            : { driverNameFingerprint: identifierFingerprint }),
          rememberSession,
          sessionExpiresAt: result.expiresAt.toISOString(),
          durationMs: Date.now() - requestStartedAt,
        });

        recordOutcome({ kind: 'redirect', target: '/dashboard', statusKey: 'session-created' });
        deps.redirect('/dashboard');
      },
    );
  };
};

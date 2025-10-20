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

import { buildStatusMessage, type StatusMessage } from './status';

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

const buildPrefill = (prefill: LoginPrefillInput): LoginPrefill | undefined => {
  const identifierValue = typeof prefill.identifier === 'string' ? prefill.identifier.trim() : '';

  if (!identifierValue) {
    return undefined;
  }

  return { identifier: identifierValue };
};

type LoginService = Pick<typeof loginUserService, 'login'>;

type LoginPrefill = {
  identifier?: string | null | undefined;
};

export type LoginErrorCode =
  | 'invalid-origin'
  | 'invalid-token'
  | 'validation'
  | 'rate-limited'
  | 'invalid-credentials'
  | 'email-not-verified'
  | 'account-pending'
  | 'account-suspended'
  | 'server-error';

export type LoginActionSuccessResult = {
  status: 'success';
  redirectTo: Route;
};

export type LoginActionErrorResult = {
  status: 'error';
  error: LoginErrorCode;
  statusMessage: StatusMessage;
  prefill?: LoginPrefill;
  fieldErrors?: Array<{ field: string; message: string }>;
  retryAfterMs?: number;
};

export type LoginActionResult = LoginActionSuccessResult | LoginActionErrorResult;

export type LoginActionDependencies = {
  headers: typeof headers;
  cookies: typeof cookies;
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

class LoginActionAbort extends Error {
  constructor(public readonly result: LoginActionResult) {
    super('LoginActionAbort');
    this.name = 'LoginActionAbort';
  }
}

const toPrefill = (value: LoginPrefill | undefined): LoginPrefill | undefined =>
  value ? { identifier: value.identifier } : undefined;

const buildErrorResult = (
  error: LoginErrorCode,
  overrides: Partial<LoginActionErrorResult> = {},
): LoginActionErrorResult => ({
  status: 'error',
  error,
  statusMessage: buildStatusMessage(undefined, error),
  ...overrides,
});

export type LoginAction = (formData: FormData) => Promise<LoginActionResult>;

export const createLoginAction = (
  deps: LoginActionDependencies = defaultLoginActionDependencies,
  options: LoginActionOptions = {},
): LoginAction => {
  return async (formData: FormData): Promise<LoginActionResult> => {
    const requestStartedAt = Date.now();
    const headersList = await deps.headers();
    const requestId = headersList.get('x-request-id') ?? randomUUID();
    const emitDebugEvent = options.onDebugEvent;

    return deps.withSpan(
      'auth.login',
      {
        'mre.request_id': requestId,
        'http.route': 'auth/login',
      },
      async (span: SpanAdapter): Promise<LoginActionResult> => {
        const logger = deps.getAuthRequestLogger({
          requestId,
          route: 'auth/login',
        });

        const recordOutcome = (result: LoginActionResult, statusKey?: string) => {
          const outcomeKind = result.status === 'success' ? 'redirect' : 'rerender';
          const target = result.status === 'success' ? result.redirectTo : undefined;
          logger.info('Login outcome resolved.', {
            event: 'auth.login.outcome',
            kind: outcomeKind,
            target,
            statusKey,
          });
          emitDebugEvent?.({
            type: 'outcome',
            kind: outcomeKind,
            target,
            statusKey: statusKey ?? (result.status === 'error' ? result.error : undefined),
          });
        };

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

        try {
          deps.guardAuthPostOrigin(
            headersList,
            () => {
              const result = buildErrorResult('invalid-origin');
              recordOutcome(result, 'invalid-origin');
              throw new LoginActionAbort(result);
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
            logger.warn('Login blocked by rate limiter.', {
              event: 'auth.login.rate_limited',
              outcome: 'blocked',
              clientFingerprint,
              retryAfterMs: rateLimit.retryAfterMs,
              durationMs: Date.now() - requestStartedAt,
            });
            const result = buildErrorResult('rate-limited', { retryAfterMs: rateLimit.retryAfterMs });
            recordOutcome(result, 'rate-limited');
            return result;
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
            logger.warn('Login rejected due to invalid form token.', {
              event: 'auth.login.invalid_token',
              outcome: 'rejected',
              clientFingerprint,
              durationMs: Date.now() - requestStartedAt,
            });
            const result = buildErrorResult('invalid-token');
            recordOutcome(result, 'invalid-token');
            return result;
          }

          const parseResult = loginSchema.safeParse({
            identifier: getFormValue(formData, 'identifier'),
            password: getFormValue(formData, 'password'),
            remember: getFormValue(formData, 'remember'),
          });

          if (!parseResult.success) {
            span.setAttribute('mre.auth.outcome', 'validation_failed');
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
            const result = buildErrorResult('validation', {
              fieldErrors: issues.map((issue) => ({ field: issue.path, message: issue.message })),
              prefill: toPrefill(buildPrefill({ identifier: getFormValue(formData, 'identifier') })),
            });
            recordOutcome(result, 'validation');
            return result;
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
            const result = buildErrorResult('validation', {
              fieldErrors: issues.map((issue) => ({ field: issue.path, message: issue.message })),
              prefill: toPrefill(buildPrefill({ identifier: rawIdentifier })),
            });
            recordOutcome(result, 'validation');
            return result;
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

          const serviceResult = await deps.loginUserService.login({
            identifier: { kind: identifierKind, value: normalisedIdentifier },
            password,
            rememberSession,
            sessionContext: {
              ipAddress: identifier === 'unknown' ? null : identifier,
              userAgent,
            },
          });

          if (!serviceResult.ok) {
            span.setAttribute('mre.auth.outcome', serviceResult.reason);
            logger.info('Login attempt failed in domain service.', {
              event: `auth.login.${serviceResult.reason.replace(/-/g, '_')}`,
              outcome: 'rejected',
              clientFingerprint,
              ...(identifierKind === 'email'
                ? { emailFingerprint: identifierFingerprint }
                : { driverNameFingerprint: identifierFingerprint }),
              durationMs: Date.now() - requestStartedAt,
            });
            const result = buildErrorResult(serviceResult.reason, {
              prefill: toPrefill(buildPrefill({ identifier: rawIdentifier })),
            });
            recordOutcome(result, serviceResult.reason);
            return result;
          }

          const cookieJar = await deps.cookies();
          const expiresAt = serviceResult.expiresAt;
          const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
          const secure = await deps.computeCookieSecure({
            strategy: resolveCookieSecureStrategy(),
            trustProxy: process.env.TRUST_PROXY === 'true',
            appUrl: process.env.APP_URL ?? null,
            forwardedProto: headersList.get('x-forwarded-proto'),
          });

          cookieJar.set({
            name: 'mre_session',
            value: serviceResult.sessionToken,
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
            sessionExpiresAt: serviceResult.expiresAt.toISOString(),
            durationMs: Date.now() - requestStartedAt,
          });

          const successResult: LoginActionSuccessResult = {
            status: 'success',
            redirectTo: '/dashboard',
          };
          recordOutcome(successResult, 'session-created');
          return successResult;
        } catch (error) {
          if (error instanceof LoginActionAbort) {
            return error.result;
          }

          span.setAttribute('mre.auth.outcome', 'server_error');
          logger.error('Login action failed unexpectedly.', {
            event: 'auth.login.unexpected_error',
            outcome: 'error',
            durationMs: Date.now() - requestStartedAt,
            error: error instanceof Error ? error.message : 'unknown-error',
          });
          const result = buildErrorResult('server-error');
          recordOutcome(result, 'server-error');
          return result;
        }
      },
    );
  };
};

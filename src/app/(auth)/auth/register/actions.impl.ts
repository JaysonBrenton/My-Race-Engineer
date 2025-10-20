/**
 * Filename: src/app/(auth)/auth/register/actions.impl.ts
 * Purpose: Handle account registration submissions with validation, security checks, and session provisioning.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getAuthRequestLogger, registerUserService } from '@/dependencies/auth';
import { fingerprintAuthFormToken, validateAuthFormToken } from '@/lib/auth/formTokens';
import { createLogFingerprint } from '@/lib/logging/fingerprint';
import { withSpan, type SpanAdapter, type WithSpan } from '@/lib/observability/tracing';
import { checkRegisterRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { computeCookieSecure, type CookieSecureStrategy } from '@/server/runtime/cookies';
import { guardAuthPostOrigin } from '@/server/security/origin';
import type { AuthActionDebugEvent } from '@/server/security/authDebug';

import {
  buildDriverNameSuggestionsParam,
  buildPrefillParam,
  buildRedirectUrl,
  type RegisterErrorCode,
} from './state';

type RedirectHref = Parameters<typeof redirect>[0];

type RegistrationPrefillInput = {
  name?: string | null | undefined;
  driverName?: string | null | undefined;
  email?: string | null | undefined;
};

// The server action owns the full registration happy-path orchestration, so we keep
// the validation rules alongside it. This schema mirrors the policy enforced at the
// service layer to provide fast feedback without duplicating logic in the client.
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

// We normalise incoming form data so the domain service receives a clean object with
// trimmed strings and a lower-cased email. Custom refinement keeps the error mapping
// predictable for the UI when passwords do not match.
const registrationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your full name.')
      .max(120, 'Names must be 120 characters or fewer.'),
    driverName: z
      .string()
      .trim()
      .min(1, 'Enter your driver name.')
      .max(60, 'Driver names must be 60 characters or fewer.'),
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address.')
      .max(320, 'Email addresses must be 320 characters or fewer.')
      .email('Enter a valid email address.')
      .transform((value) => value.toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords must match.',
        path: ['confirmPassword'],
      });
    }
  });

// Redirect destinations preserve the user's non-sensitive input and the error code so
// the page can re-render with contextual messaging. A helper keeps this behaviour
// consistent across each exit path.
// `FormData.get` can yield strings or File objects. Registration only allows text
// inputs, so we coerce anything else to `undefined` to gracefully trigger validation
// errors.
const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

const extractPrefillValues = (data: FormData): RegistrationPrefillInput => ({
  name: getFormValue(data, 'name'),
  driverName: getFormValue(data, 'driverName'),
  email: getFormValue(data, 'email'),
});

const normalisePrefillValues = (prefill: RegistrationPrefillInput) => ({
  name: typeof prefill.name === 'string' ? prefill.name.trim() : '',
  driverName: typeof prefill.driverName === 'string' ? prefill.driverName.trim() : '',
  email: typeof prefill.email === 'string' ? prefill.email.trim() : '',
});

const buildLoginPrefillParam = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.stringify({ identifier: trimmed });
  } catch {
    return undefined;
  }
};

type RegisterService = Pick<typeof registerUserService, 'register'>;

export type RegisterActionDependencies = {
  headers: typeof headers;
  cookies: typeof cookies;
  redirect: (href: RedirectHref) => never;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  checkRegisterRateLimit: typeof checkRegisterRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  extractClientIdentifier: typeof extractClientIdentifier;
  createLogFingerprint: typeof createLogFingerprint;
  withSpan: WithSpan;
  getAuthRequestLogger: typeof getAuthRequestLogger;
  registerUserService: RegisterService;
  computeCookieSecure: typeof computeCookieSecure;
};

export type RegisterActionOptions = {
  onDebugEvent?: (event: AuthActionDebugEvent) => void;
};

const defaultRegisterActionDependencies: RegisterActionDependencies = {
  headers,
  cookies,
  redirect,
  guardAuthPostOrigin,
  checkRegisterRateLimit,
  validateAuthFormToken,
  extractClientIdentifier,
  createLogFingerprint,
  withSpan,
  getAuthRequestLogger,
  registerUserService,
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

export type RegisterAction = (formData: FormData) => Promise<void>;

export const createRegisterAction = (
  deps: RegisterActionDependencies = defaultRegisterActionDependencies,
  options: RegisterActionOptions = {},
): RegisterAction => {
  return async (formData: FormData): Promise<void> => {
    const requestStartedAt = Date.now();
    const headersList = await deps.headers();
    const requestId = headersList.get('x-request-id') ?? randomUUID();
    const emitDebugEvent = options.onDebugEvent;

    await deps.withSpan(
      'auth.register',
      {
        'mre.request_id': requestId,
        'http.route': 'auth/register',
      },
      async (span: SpanAdapter): Promise<void> => {
        const logger = deps.getAuthRequestLogger({
          requestId,
          route: 'auth/register',
        });

        const originHeader = headersList.get('origin');
        const originGuardHeader = headersList.get('x-auth-origin-guard');
        const methodHeader =
          headersList.get('x-http-method-override') ??
          headersList.get('x-mre-http-method') ??
          'POST';

        logger.info('Registration request received.', {
          event: 'auth.register.request',
          outcome: 'received',
          hasOriginHeader: Boolean(originHeader),
          originAllowed: originGuardHeader ? originGuardHeader !== 'mismatch' : null,
          method: methodHeader,
        });

        const prefills = extractPrefillValues(formData);
        const normalisedPrefills = normalisePrefillValues(prefills);

        const recordOutcome = (outcome: {
          kind: 'redirect' | 'rerender';
          target?: RedirectHref;
          statusKey?: string;
        }) => {
          const target = outcome.target?.toString();
          logger.info('Registration outcome resolved.', {
            event: 'auth.register.outcome',
            kind: outcome.kind,
            target,
            statusKey: outcome.statusKey,
          });
          emitDebugEvent?.({
            type: 'outcome',
            kind: outcome.kind,
            target,
            statusKey: outcome.statusKey,
          });
        };

        const redirectToRegister = (
          errorCode: RegisterErrorCode,
          options: { driverNameSuggestions?: string[] } = {},
        ): never => {
          const driverNameSuggestionsParam =
            options.driverNameSuggestions && options.driverNameSuggestions.length > 0
              ? buildDriverNameSuggestionsParam(options.driverNameSuggestions)
              : undefined;
          const redirectUrl = buildRedirectUrl('/auth/register', {
            error: errorCode,
            prefill: buildPrefillParam(normalisedPrefills),
            name: normalisedPrefills.name || undefined,
            driverName: normalisedPrefills.driverName || undefined,
            email: normalisedPrefills.email || undefined,
            driverNameSuggestions: driverNameSuggestionsParam,
          });

          recordOutcome({ kind: 'redirect', target: redirectUrl, statusKey: errorCode });
          return deps.redirect(redirectUrl);
        };

        deps.guardAuthPostOrigin(
          headersList,
          () => {
            span.setAttribute('mre.auth.outcome', 'invalid_origin');
            logger.warn('Registration blocked due to origin mismatch.', {
              event: 'auth.register.invalid_origin',
              outcome: 'blocked',
              durationMs: Date.now() - requestStartedAt,
            });
            return redirectToRegister('invalid-origin');
          },
          {
            route: 'auth/register',
            logger,
          },
        );

        const identifier = deps.extractClientIdentifier(headersList);
        const clientFingerprint =
          identifier === 'unknown' ? undefined : deps.createLogFingerprint(identifier);
        if (clientFingerprint) {
          span.setAttribute('mre.auth.client_fingerprint', clientFingerprint);
        }

        logger.info('Processing registration submission.', {
          event: 'auth.register.submission_received',
          outcome: 'processing',
          clientFingerprint,
        });

        const rateLimit = deps.checkRegisterRateLimit(identifier);
        if (!rateLimit.ok) {
          span.setAttribute('mre.auth.outcome', 'rate_limited');
          span.setAttribute('mre.auth.retry_after_ms', rateLimit.retryAfterMs);
          logger.warn('Registration blocked by rate limiter.', {
            event: 'auth.register.rate_limited',
            outcome: 'blocked',
            clientFingerprint,
            retryAfterMs: rateLimit.retryAfterMs,
            durationMs: Date.now() - requestStartedAt,
          });
          return redirectToRegister('rate-limited');
        }

        const token = getFormValue(formData, 'formToken');
        const tokenFingerprint = token ? fingerprintAuthFormToken(token) : null;
        const tokenValidation = deps.validateAuthFormToken(token ?? null, 'registration');
        const tokenAgeMs = tokenValidation.ok
          ? Date.now() - tokenValidation.issuedAt.getTime()
          : null;

        if (tokenValidation.ok) {
          logger.info('Registration form token validated.', {
            event: 'auth.formToken.validate',
            result: 'ok',
            action: 'register',
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
          logger.warn('Registration form token rejected.', {
            event: 'auth.formToken.validate',
            result: status,
            action: 'register',
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
          logger.warn('Registration rejected due to invalid form token.', {
            event: 'auth.register.invalid_token',
            outcome: 'rejected',
            clientFingerprint,
            durationMs: Date.now() - requestStartedAt,
          });
          return redirectToRegister('invalid-token');
        }

        const parseResult = registrationSchema.safeParse({
          name: getFormValue(formData, 'name'),
          driverName: getFormValue(formData, 'driverName'),
          email: getFormValue(formData, 'email'),
          password: getFormValue(formData, 'password'),
          confirmPassword: getFormValue(formData, 'confirmPassword'),
        });

        if (!parseResult.success) {
          span.setAttribute('mre.auth.outcome', 'validation_failed');
          const issues = parseResult.error.issues.map((issue) => ({
            field: issue.path.map((segment) => segment.toString()).join('.') || 'root',
            message: issue.message,
          }));
          logger.warn('Registration rejected due to validation errors.', {
            event: 'auth.register.validation_failed',
            outcome: 'rejected',
            clientFingerprint,
            validationIssues: issues,
            durationMs: Date.now() - requestStartedAt,
          });
          logger.info('Registration validation summary.', {
            event: 'auth.register.validation',
            result: 'invalid',
            issues: issues.map((issue) => issue.field),
          });
          return redirectToRegister('validation');
        }

        logger.info('Registration validation summary.', {
          event: 'auth.register.validation',
          result: 'ok',
        });

        const { name, driverName, email, password } = parseResult.data;
        const userAgent = headersList.get('user-agent');
        const emailFingerprint = deps.createLogFingerprint(email);
        const driverNameFingerprint = deps.createLogFingerprint(driverName);

        if (emailFingerprint) {
          span.setAttribute('mre.auth.email_fingerprint', emailFingerprint);
        }

        if (driverNameFingerprint) {
          span.setAttribute('mre.auth.driver_name_fingerprint', driverNameFingerprint);
        }

        logger.info('Registration payload validated.', {
          event: 'auth.register.payload_validated',
          outcome: 'processing',
          clientFingerprint,
          emailFingerprint,
          driverNameFingerprint,
        });

        let result: Awaited<ReturnType<typeof registerUserService.register>>;
        try {
          result = await deps.registerUserService.register({
            name,
            driverName,
            email,
            password,
            rememberSession: true,
            sessionContext: {
              ipAddress: identifier === 'unknown' ? null : identifier,
              userAgent,
            },
          });
        } catch (error) {
          const errorPayload =
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { name: 'UnknownError', message: 'Non-error value thrown during registration.' };

          span.setAttribute('mre.auth.outcome', 'server_error');
          span.setAttribute('mre.auth.error_type', errorPayload.name);

          logger.error('Registration failed due to unexpected error.', {
            event: 'auth.register.unhandled_error',
            outcome: 'error',
            clientFingerprint,
            emailFingerprint,
            error: errorPayload,
            durationMs: Date.now() - requestStartedAt,
          });

          return redirectToRegister('server-error');
        }

        if (!result.ok) {
          span.setAttribute('mre.auth.outcome', result.reason);
          logger.info('Registration attempt rejected by domain service.', {
            event: `auth.register.${result.reason.replace(/-/g, '_')}`,
            outcome: 'rejected',
            clientFingerprint,
            emailFingerprint,
            driverNameFingerprint,
            durationMs: Date.now() - requestStartedAt,
          });

          if (result.reason === 'driver-name-taken') {
            return redirectToRegister(result.reason, { driverNameSuggestions: result.suggestions });
          }

          return redirectToRegister(result.reason);
        }

        switch (result.nextStep) {
          case 'verify-email':
            span.setAttribute('mre.auth.outcome', 'verify_email');
            logger.info('Registration complete; verification required.', {
              event: 'auth.register.next_step.verify_email',
              outcome: 'pending',
              clientFingerprint,
              emailFingerprint,
              durationMs: Date.now() - requestStartedAt,
            });
            {
              const target = buildRedirectUrl('/auth/login', {
                status: 'verify-email',
                prefill: buildLoginPrefillParam(email),
              });
              recordOutcome({ kind: 'redirect', target, statusKey: 'verify-email' });
              deps.redirect(target);
            }
            break;
          case 'verify-email-await-approval':
            span.setAttribute('mre.auth.outcome', 'verify_email_awaiting_approval');
            logger.info('Registration complete; verification required before admin approval.', {
              event: 'auth.register.next_step.verify_email_awaiting_approval',
              outcome: 'pending',
              clientFingerprint,
              emailFingerprint,
              durationMs: Date.now() - requestStartedAt,
            });
            {
              const target = buildRedirectUrl('/auth/login', {
                status: 'verify-email-awaiting-approval',
                prefill: buildLoginPrefillParam(email),
              });
              recordOutcome({
                kind: 'redirect',
                target,
                statusKey: 'verify-email-awaiting-approval',
              });
              deps.redirect(target);
            }
            break;
          case 'await-approval':
            span.setAttribute('mre.auth.outcome', 'awaiting_approval');
            logger.info('Registration complete; awaiting admin approval.', {
              event: 'auth.register.next_step.awaiting_approval',
              outcome: 'pending',
              clientFingerprint,
              emailFingerprint,
              durationMs: Date.now() - requestStartedAt,
            });
            {
              const target = buildRedirectUrl('/auth/login', {
                status: 'awaiting-approval',
                prefill: buildLoginPrefillParam(email),
              });
              recordOutcome({ kind: 'redirect', target, statusKey: 'awaiting-approval' });
              deps.redirect(target);
            }
            break;
          case 'session-created':
            span.setAttribute('mre.auth.outcome', 'success');
            if (result.session) {
              const cookieJar = await deps.cookies();
              const expiresAt = result.session.expiresAt;
              const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
              const secure = await deps.computeCookieSecure({
                strategy: resolveCookieSecureStrategy(),
                trustProxy: process.env.TRUST_PROXY === 'true',
                appUrl: process.env.APP_URL ?? null,
                forwardedProto: headersList.get('x-forwarded-proto'),
              });
              cookieJar.set({
                name: 'mre_session',
                value: result.session.token,
                httpOnly: true,
                sameSite: 'lax',
                secure,
                path: '/',
                expires: expiresAt,
                maxAge,
              });
              span.setAttribute('mre.auth.session_expires_at', expiresAt.toISOString());
              span.setAttribute('mre.auth.session_issued', true);
            } else {
              span.setAttribute('mre.auth.session_issued', false);
            }
            logger.info('Registration succeeded with active session.', {
              event: 'auth.register.next_step.session_created',
              outcome: 'success',
              clientFingerprint,
              emailFingerprint,
              sessionIssued: Boolean(result.session),
              sessionExpiresAt: result.session?.expiresAt.toISOString(),
              durationMs: Date.now() - requestStartedAt,
            });
            const target = buildRedirectUrl('/dashboard', {});
            recordOutcome({ kind: 'redirect', target, statusKey: 'session-created' });
            deps.redirect(target);
            break;
          default:
            span.setAttribute('mre.auth.outcome', 'server_error');
            span.setAttribute('mre.auth.next_step', result.nextStep);
            logger.error('Registration returned unexpected next step.', {
              event: 'auth.register.next_step.unknown',
              outcome: 'error',
              clientFingerprint,
              emailFingerprint,
              nextStep: result.nextStep,
              durationMs: Date.now() - requestStartedAt,
            });
            return redirectToRegister('server-error');
        }
      },
    );
  };
};

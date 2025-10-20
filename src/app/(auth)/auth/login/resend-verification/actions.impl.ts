/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Enforce typed redirects for the login verification resend flow.
 * License: MIT
 */

import { headers } from 'next/headers';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { resendVerificationEmailService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkVerificationResendRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';

import type { Logger } from '@core/app';
import { ROUTE_LOGIN } from '@/app/routes';

type RedirectHref = Parameters<typeof redirect>[0];

const requestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(320, 'Email addresses must be 320 characters or fewer.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
});

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

const buildPrefillParam = (identifier: string): string => {
  try {
    return JSON.stringify({ identifier });
  } catch {
    return JSON.stringify({ identifier: identifier.slice(0, 320) });
  }
};

const buildRedirectUrl = (
  pathname: Route,
  searchParams: Record<string, string | undefined>,
): RedirectHref => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  const target: RedirectHref = query ? `${pathname}?${query}` : pathname;
  return target;
};

type ResendDependencies = {
  headers: typeof headers;
  redirect: (href: RedirectHref) => never;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  extractClientIdentifier: typeof extractClientIdentifier;
  checkVerificationResendRateLimit: typeof checkVerificationResendRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  resendVerificationEmailService: Pick<typeof resendVerificationEmailService, 'resend'>;
  logger: Logger;
};

export type ResendVerificationEmailAction = (formData: FormData) => Promise<void>;

const defaultDependencies: ResendDependencies = {
  headers,
  redirect,
  guardAuthPostOrigin,
  extractClientIdentifier,
  checkVerificationResendRateLimit,
  validateAuthFormToken,
  resendVerificationEmailService,
  logger: applicationLogger.withContext({ route: 'auth/login/resend-verification' }),
};

const redirectTo = (target: RedirectHref, deps: ResendDependencies): never => deps.redirect(target);

export const createResendVerificationEmailAction = (
  deps: ResendDependencies = defaultDependencies,
): ResendVerificationEmailAction => {
  return async (formData: FormData): Promise<void> => {
    const headersList = await deps.headers();

    deps.guardAuthPostOrigin(
      headersList,
      () =>
        redirectTo(
          buildRedirectUrl(ROUTE_LOGIN, {
            error: 'invalid-origin',
          }),
          deps,
        ),
      { route: 'auth/login/resend-verification' },
    );

    const identifier = deps.extractClientIdentifier(headersList);
    const rateLimit = deps.checkVerificationResendRateLimit(identifier);

    if (!rateLimit.ok) {
      const emailValue = getFormValue(formData, 'email');
      return redirectTo(
        buildRedirectUrl(ROUTE_LOGIN, {
          error: 'verification-rate-limited',
          email: emailValue ?? undefined,
          prefill: emailValue ? buildPrefillParam(emailValue) : undefined,
        }),
        deps,
      );
    }

    const token = getFormValue(formData, 'formToken');
    const tokenValidation = deps.validateAuthFormToken(token ?? null, 'verification-resend');

    if (!tokenValidation.ok) {
      const emailValue = getFormValue(formData, 'email');
      return redirectTo(
        buildRedirectUrl(ROUTE_LOGIN, {
          error: 'verification-invalid-token',
          email: emailValue ?? undefined,
          prefill: emailValue ? buildPrefillParam(emailValue) : undefined,
        }),
        deps,
      );
    }

    const emailRaw = getFormValue(formData, 'email');
    const parseResult = requestSchema.safeParse({ email: emailRaw });

    if (!parseResult.success) {
      return redirectTo(
        buildRedirectUrl(ROUTE_LOGIN, {
          error: 'verification-validation',
          email: emailRaw ?? undefined,
        }),
        deps,
      );
    }

    const { email } = parseResult.data;

    try {
      await deps.resendVerificationEmailService.resend({ email });
    } catch (error: unknown) {
      deps.logger.error('Failed to enqueue verification email resend.', {
        event: 'auth.verification.resend_failed',
        outcome: 'error',
        error,
      });

      return redirectTo(
        buildRedirectUrl(ROUTE_LOGIN, {
          error: 'verification-server-error',
          email,
          prefill: buildPrefillParam(email),
        }),
        deps,
      );
    }

    deps.logger.info('Verification email resend accepted.', {
      event: 'auth.verification.resend_enqueued',
      outcome: 'pending',
    });

    return redirectTo(
      buildRedirectUrl(ROUTE_LOGIN, {
        status: 'verification-resent',
        prefill: buildPrefillParam(email),
        email,
      }),
      deps,
    );
  };
};

export const __private__ = {
  buildPrefillParam,
  buildRedirectUrl,
  getFormValue,
};

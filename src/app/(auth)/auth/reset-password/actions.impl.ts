/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Align reset-password server action redirects with typed Next routes.
 * License: MIT
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { z } from 'zod';

import { startPasswordResetService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkPasswordResetRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';
import { createErrorLogContext } from './logging';
import type { Logger } from '@core/app';

type RedirectHref = Parameters<typeof redirect>[0];

type RateLimitResult = ReturnType<typeof checkPasswordResetRateLimit>;

type PasswordResetStarter = Pick<typeof startPasswordResetService, 'start'>;

const requestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(320, 'Email addresses must be 320 characters or fewer.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
});

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
  const final = query ? `${pathname}?${query}` : pathname;
  return final as RedirectHref;
};

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

const RESET_PASSWORD_ROUTE: Route = ('/auth/reset-password') as Route; // safe: canonical reset-request path

export type RequestPasswordResetDependencies = {
  headers: typeof headers;
  redirect: (href: RedirectHref) => never;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  checkPasswordResetRateLimit: typeof checkPasswordResetRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  extractClientIdentifier: typeof extractClientIdentifier;
  startPasswordResetService: PasswordResetStarter;
  logger: Logger;
};

export type RequestPasswordResetAction = (formData: FormData) => Promise<void>;

const defaultDependencies: RequestPasswordResetDependencies = {
  headers,
  redirect,
  guardAuthPostOrigin,
  checkPasswordResetRateLimit,
  validateAuthFormToken,
  extractClientIdentifier,
  startPasswordResetService,
  logger: applicationLogger.withContext({ route: 'auth/reset-password/start-action' }),
};

const redirectTo = (target: RedirectHref, deps: RequestPasswordResetDependencies): never =>
  deps.redirect(target);

export const createRequestPasswordResetAction = (
  deps: RequestPasswordResetDependencies = defaultDependencies,
): RequestPasswordResetAction => {
  return async (formData: FormData): Promise<void> => {
    const headersList = await deps.headers();
    deps.guardAuthPostOrigin(
      headersList,
      () =>
        redirectTo(
          buildRedirectUrl(RESET_PASSWORD_ROUTE, {
            error: 'invalid-origin',
          }),
          deps,
        ),
      {
        route: 'auth/reset-password',
      },
    );

    const identifier = deps.extractClientIdentifier(headersList);
    const rateLimit: RateLimitResult = deps.checkPasswordResetRateLimit(identifier);

    if (!rateLimit.ok) {
      return redirectTo(
        buildRedirectUrl(RESET_PASSWORD_ROUTE, {
          error: 'rate-limited',
        }),
        deps,
      );
    }

    const token = getFormValue(formData, 'formToken');
    const tokenValidation = deps.validateAuthFormToken(token ?? null, 'password-reset');

    if (!tokenValidation.ok) {
      return redirectTo(
        buildRedirectUrl(RESET_PASSWORD_ROUTE, {
          error: 'invalid-token',
        }),
        deps,
      );
    }

    const parseResult = requestSchema.safeParse({
      email: getFormValue(formData, 'email'),
    });

    if (!parseResult.success) {
      return redirectTo(
        buildRedirectUrl(RESET_PASSWORD_ROUTE, {
          error: 'validation',
          email: getFormValue(formData, 'email'),
        }),
        deps,
      );
    }

    const { email } = parseResult.data;

    try {
      await deps.startPasswordResetService.start({ email });
    } catch (error: unknown) {
      deps.logger.error(
        'Unable to start password reset flow.',
        createErrorLogContext(
          {
            event: 'auth.password_reset.start_failed',
            outcome: 'error',
          },
          error,
        ),
      );
      return redirectTo(
        buildRedirectUrl(RESET_PASSWORD_ROUTE, {
          error: 'server-error',
        }),
        deps,
      );
    }

    return redirectTo(
      buildRedirectUrl(RESET_PASSWORD_ROUTE, {
        status: 'sent',
      }),
      deps,
    );
  };
};

export const __private__ = {
  buildRedirectUrl,
  getFormValue,
};

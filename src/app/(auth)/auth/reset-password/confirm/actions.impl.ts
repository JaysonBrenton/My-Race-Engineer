import { headers } from 'next/headers';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { confirmPasswordResetService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkPasswordResetConfirmRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';
import { createErrorLogContext } from '../logging';
import type { ConfirmPasswordResetResult, Logger } from '@core/app';

type RedirectHref = Parameters<typeof redirect>[0];

type RateLimitResult = ReturnType<typeof checkPasswordResetConfirmRateLimit>;

type PasswordResetConfirmer = Pick<typeof confirmPasswordResetService, 'confirm'>;

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

const confirmationSchema = z
  .object({
    token: z.string().min(1, 'Missing reset token.'),
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
  const target: RedirectHref = query ? `${pathname}?${query}` : pathname;
  return target;
};

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

export type ConfirmPasswordResetDependencies = {
  headers: typeof headers;
  redirect: (href: RedirectHref) => never;
  guardAuthPostOrigin: typeof guardAuthPostOrigin;
  checkPasswordResetConfirmRateLimit: typeof checkPasswordResetConfirmRateLimit;
  validateAuthFormToken: typeof validateAuthFormToken;
  extractClientIdentifier: typeof extractClientIdentifier;
  confirmPasswordResetService: PasswordResetConfirmer;
  logger: Logger;
};

export type ConfirmPasswordResetAction = (formData: FormData) => Promise<void>;

const defaultDependencies: ConfirmPasswordResetDependencies = {
  headers,
  redirect,
  guardAuthPostOrigin,
  checkPasswordResetConfirmRateLimit,
  validateAuthFormToken,
  extractClientIdentifier,
  confirmPasswordResetService,
  logger: applicationLogger.withContext({ route: 'auth/reset-password/confirm-action' }),
};

const redirectTo = (target: RedirectHref, deps: ConfirmPasswordResetDependencies): never =>
  deps.redirect(target);

export const createConfirmPasswordResetAction = (
  deps: ConfirmPasswordResetDependencies = defaultDependencies,
): ConfirmPasswordResetAction => {
  return async (formData: FormData): Promise<void> => {
    const resetToken = getFormValue(formData, 'token');
    const headersList = await deps.headers();

    deps.guardAuthPostOrigin(
      headersList,
      () =>
        redirectTo(
          buildRedirectUrl('/auth/reset-password/confirm', {
            token: resetToken,
            error: 'invalid-origin',
          }),
          deps,
        ),
      {
        route: 'auth/reset-password/confirm',
      },
    );

    const identifier = deps.extractClientIdentifier(headersList);
    const rateLimit: RateLimitResult = deps.checkPasswordResetConfirmRateLimit(identifier);

    if (!rateLimit.ok) {
      return redirectTo(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token: resetToken,
          error: 'rate-limited',
        }),
        deps,
      );
    }

    const formToken = getFormValue(formData, 'formToken');
    const tokenValidation = deps.validateAuthFormToken(formToken ?? null, 'password-reset-confirm');

    if (!tokenValidation.ok) {
      return redirectTo(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token: resetToken,
          error: 'invalid-token',
        }),
        deps,
      );
    }

    const parseResult = confirmationSchema.safeParse({
      token: resetToken,
      password: getFormValue(formData, 'password'),
      confirmPassword: getFormValue(formData, 'confirmPassword'),
    });

    if (!parseResult.success) {
      return redirectTo(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token: resetToken,
          error: 'validation',
        }),
        deps,
      );
    }

    const { token, password } = parseResult.data;

    let result: ConfirmPasswordResetResult;
    try {
      result = await deps.confirmPasswordResetService.confirm({
        token,
        newPassword: password,
      });
    } catch (error: unknown) {
      deps.logger.error(
        'Unable to confirm password reset.',
        createErrorLogContext(
          {
            event: 'auth.password_reset.confirm_failed',
            outcome: 'error',
          },
          error,
        ),
      );
      return redirectTo(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token,
          error: 'server-error',
        }),
        deps,
      );
    }

    if (!result.ok) {
      if (result.reason === 'weak-password') {
        return redirectTo(
          buildRedirectUrl('/auth/reset-password/confirm', {
            token,
            error: 'weak-password',
          }),
          deps,
        );
      }

      if (result.reason === 'invalid-token') {
        return redirectTo(
          buildRedirectUrl('/auth/reset-password/confirm', {
            error: 'invalid-token',
          }),
          deps,
        );
      }

      if (result.reason === 'user-not-found') {
        deps.logger.error(
          'Password reset token referenced missing user.',
          createErrorLogContext(
            {
              event: 'auth.password_reset.confirm_user_missing',
              outcome: 'error',
            },
            undefined,
          ),
        );
      }

      return redirectTo(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token,
          error: 'server-error',
        }),
        deps,
      );
    }

    return redirectTo(
      buildRedirectUrl('/auth/login', {
        status: 'password-reset-confirmed',
      }),
      deps,
    );
  };
};

export const __private__ = {
  buildRedirectUrl,
  getFormValue,
};

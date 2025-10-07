'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { confirmPasswordResetService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkPasswordResetConfirmRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';

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

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

const logger = applicationLogger.withContext({ route: 'auth/reset-password/confirm-action' });

export const confirmPasswordResetAction = async (formData: FormData) => {
  const resetToken = getFormValue(formData, 'token');
  const headersList = headers();
  guardAuthPostOrigin(
    headersList,
    () =>
      redirect(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token: resetToken,
          error: 'invalid-origin',
        }),
      ),
    {
      route: 'auth/reset-password/confirm',
    },
  );

  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkPasswordResetConfirmRateLimit(identifier);

  if (!rateLimit.ok) {
    redirect(
      buildRedirectUrl('/auth/reset-password/confirm', {
        token: resetToken,
        error: 'rate-limited',
      }),
    );
  }

  const formToken = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(formToken ?? null, 'password-reset-confirm');

  if (!tokenValidation.ok) {
    redirect(
      buildRedirectUrl('/auth/reset-password/confirm', {
        token: resetToken,
        error: 'invalid-token',
      }),
    );
  }

  const parseResult = confirmationSchema.safeParse({
    token: resetToken,
    password: getFormValue(formData, 'password'),
    confirmPassword: getFormValue(formData, 'confirmPassword'),
  });

  if (!parseResult.success) {
    redirect(
      buildRedirectUrl('/auth/reset-password/confirm', {
        token: resetToken,
        error: 'validation',
      }),
    );
  }

  const { token, password } = parseResult.data;
  let result;

  try {
    result = await confirmPasswordResetService.confirm({
      token,
      newPassword: password,
    });
  } catch (error) {
    logger.error('Unable to confirm password reset.', {
      event: 'auth.password_reset.confirm_failed',
      outcome: 'error',
      error: error instanceof Error ? error.message : 'unknown-error',
    });
    redirect(
      buildRedirectUrl('/auth/reset-password/confirm', {
        token,
        error: 'server-error',
      }),
    );
    return;
  }

  if (!result.ok) {
    if (result.reason === 'weak-password') {
      redirect(
        buildRedirectUrl('/auth/reset-password/confirm', {
          token,
          error: 'weak-password',
        }),
      );
    }

    if (result.reason === 'invalid-token') {
      redirect(
        buildRedirectUrl('/auth/reset-password/confirm', {
          error: 'invalid-token',
        }),
      );
    }

    if (result.reason === 'user-not-found') {
      logger.error('Password reset token referenced missing user.', {
        event: 'auth.password_reset.confirm_user_missing',
        outcome: 'error',
      });
    }

    redirect(
      buildRedirectUrl('/auth/reset-password/confirm', {
        token,
        error: 'server-error',
      }),
    );
  }

  redirect(
    buildRedirectUrl('/auth/login', {
      status: 'password-reset-confirmed',
    }),
  );
};

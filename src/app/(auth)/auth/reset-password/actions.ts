'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { startPasswordResetService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkPasswordResetRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';

const logger = applicationLogger.withContext({ route: 'auth/reset-password/start-action' });

const requestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(320, 'Email addresses must be 320 characters or fewer.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
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

export const requestPasswordResetAction = async (formData: FormData) => {
  const headersList = headers();
  guardAuthPostOrigin(
    headersList,
    () =>
      redirect(
        buildRedirectUrl('/auth/reset-password', {
          error: 'invalid-origin',
        }),
      ),
    {
      route: 'auth/reset-password',
    },
  );

  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkPasswordResetRateLimit(identifier);

  if (!rateLimit.ok) {
    redirect(
      buildRedirectUrl('/auth/reset-password', {
        error: 'rate-limited',
      }),
    );
  }

  const token = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(token ?? null, 'password-reset');

  if (!tokenValidation.ok) {
    redirect(
      buildRedirectUrl('/auth/reset-password', {
        error: 'invalid-token',
      }),
    );
  }

  const parseResult = requestSchema.safeParse({
    email: getFormValue(formData, 'email'),
  });

  if (!parseResult.success) {
    redirect(
      buildRedirectUrl('/auth/reset-password', {
        error: 'validation',
        email: getFormValue(formData, 'email'),
      }),
    );
  }

  const { email } = parseResult.data;

  try {
    await startPasswordResetService.start({ email });
  } catch (error) {
    logger.error('Unable to start password reset flow.', {
      event: 'auth.password_reset.start_failed',
      outcome: 'error',
      error: error instanceof Error ? error.message : 'unknown-error',
    });
    redirect(
      buildRedirectUrl('/auth/reset-password', {
        error: 'server-error',
      }),
    );
  }

  redirect(
    buildRedirectUrl('/auth/reset-password', {
      status: 'sent',
    }),
  );
};

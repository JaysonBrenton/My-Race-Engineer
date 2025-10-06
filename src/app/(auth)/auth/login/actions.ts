'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { loginUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkLoginRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';

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

export const loginAction = async (formData: FormData) => {
  const headersList = headers();
  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkLoginRateLimit(identifier);

  if (!rateLimit.ok) {
    redirect(
      buildRedirectUrl('/auth/login', {
        error: 'rate-limited',
      }),
    );
  }

  const token = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(token ?? null, 'login');

  if (!tokenValidation.ok) {
    redirect(
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
    redirect(
      buildRedirectUrl('/auth/login', {
        error: 'validation',
        email: getFormValue(formData, 'email'),
      }),
    );
  }

  const { email, password, remember } = parseResult.data;
  const userAgent = headersList.get('user-agent');

  const result = await loginUserService.login({
    email,
    password,
    rememberSession: remember === 'true',
    sessionContext: {
      ipAddress: identifier === 'unknown' ? null : identifier,
      userAgent,
    },
  });

  if (!result.ok) {
    redirect(
      buildRedirectUrl('/auth/login', {
        error: result.reason,
        email,
      }),
    );
  }

  const cookieJar = cookies();
  const expiresAt = result.expiresAt;
  const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
  cookieJar.set({
    name: 'mre_session',
    value: result.sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
    maxAge,
  });

  redirect('/dashboard');
};

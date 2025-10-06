'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { registerUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkRegisterRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

const registrationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your full name.')
      .max(120, 'Names must be 120 characters or fewer.'),
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

export const registerAction = async (formData: FormData) => {
  const headersList = headers();
  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkRegisterRateLimit(identifier);

  if (!rateLimit.ok) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: 'rate-limited',
      }),
    );
  }

  const token = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(token ?? null, 'registration');

  if (!tokenValidation.ok) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: 'invalid-token',
      }),
    );
  }

  const parseResult = registrationSchema.safeParse({
    name: getFormValue(formData, 'name'),
    email: getFormValue(formData, 'email'),
    password: getFormValue(formData, 'password'),
    confirmPassword: getFormValue(formData, 'confirmPassword'),
  });

  if (!parseResult.success) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: 'validation',
        name: getFormValue(formData, 'name'),
        email: getFormValue(formData, 'email'),
      }),
    );
  }

  const { name, email, password } = parseResult.data;
  const userAgent = headersList.get('user-agent');

  const result = await registerUserService.register({
    name,
    email,
    password,
    rememberSession: true,
    sessionContext: {
      ipAddress: identifier === 'unknown' ? null : identifier,
      userAgent,
    },
  });

  if (!result.ok) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: result.reason,
        name,
        email,
      }),
    );
  }

  switch (result.nextStep) {
    case 'verify-email':
      redirect(
        buildRedirectUrl('/auth/login', {
          status: 'verify-email',
          email,
        }),
      );
      break;
    case 'await-approval':
      redirect(
        buildRedirectUrl('/auth/login', {
          status: 'awaiting-approval',
          email,
        }),
      );
      break;
    case 'session-created': {
      if (result.session) {
        const cookieJar = cookies();
        const expiresAt = result.session.expiresAt;
        const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
        cookieJar.set({
          name: 'mre_session',
          value: result.session.token,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          expires: expiresAt,
          maxAge,
        });
      }
      redirect('/dashboard');
      break;
    }
    default:
      redirect('/auth/login');
  }
};

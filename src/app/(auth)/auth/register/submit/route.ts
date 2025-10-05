import { NextResponse } from 'next/server';
import { z } from 'zod';

import { registerUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';

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

const buildRedirectUrl = (
  requestUrl: string,
  pathname: string,
  searchParams: Record<string, string | undefined>,
) => {
  const url = new URL(requestUrl);
  url.pathname = pathname;
  url.search = '';

  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  if (query) {
    url.search = `?${query}`;
  }

  return url;
};

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = formData.get('formToken');
  const tokenValidation = validateAuthFormToken(
    typeof token === 'string' ? token : null,
    'registration',
  );

  if (!tokenValidation.ok) {
    const redirectUrl = buildRedirectUrl(request.url, '/auth/register', {
      error: 'invalid-token',
    });

    return NextResponse.redirect(redirectUrl, 303);
  }

  const parseResult = registrationSchema.safeParse({
    name: getFormValue(formData, 'name'),
    email: getFormValue(formData, 'email'),
    password: getFormValue(formData, 'password'),
    confirmPassword: getFormValue(formData, 'confirmPassword'),
  });

  if (!parseResult.success) {
    const redirectUrl = buildRedirectUrl(request.url, '/auth/register', {
      error: 'validation',
      name: getFormValue(formData, 'name'),
      email: getFormValue(formData, 'email'),
    });

    return NextResponse.redirect(redirectUrl, 303);
  }

  const { name, email, password } = parseResult.data;

  try {
    const result = await registerUserService.register({
      name,
      email,
      password,
    });

    if (!result.ok) {
      const redirectUrl = buildRedirectUrl(request.url, '/auth/register', {
        error: result.reason,
        name,
        email,
      });

      return NextResponse.redirect(redirectUrl, 303);
    }

    const redirectUrl = buildRedirectUrl(request.url, '/auth/login', {
      status: 'account-created',
      email,
    });

    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error('Registration failed unexpectedly', error);
    const redirectUrl = buildRedirectUrl(request.url, '/auth/register', {
      error: 'server-error',
      name,
      email,
    });

    return NextResponse.redirect(redirectUrl, 303);
  }
}

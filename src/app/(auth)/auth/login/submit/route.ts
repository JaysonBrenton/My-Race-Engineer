import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loginUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(320, 'Email addresses must be 320 characters or fewer.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.'),
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

const createRedirectResponse = (
  requestUrl: string,
  pathname: string,
  params: Record<string, string | undefined>,
) => {
  const url = buildRedirectUrl(requestUrl, pathname, params);
  return NextResponse.redirect(url, 303);
};

const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = formData.get('formToken');
  const tokenValidation = validateAuthFormToken(typeof token === 'string' ? token : null, 'login');

  if (!tokenValidation.ok) {
    return createRedirectResponse(request.url, '/auth/login', {
      error: 'invalid-token',
    });
  }

  const parseResult = loginSchema.safeParse({
    email: getFormValue(formData, 'email'),
    password: getFormValue(formData, 'password'),
  });

  if (!parseResult.success) {
    return createRedirectResponse(request.url, '/auth/login', {
      error: 'validation',
      email: getFormValue(formData, 'email'),
    });
  }

  const { email, password } = parseResult.data;

  try {
    const result = await loginUserService.login({
      email,
      password,
    });

    if (!result.ok) {
      return createRedirectResponse(request.url, '/auth/login', {
        error: result.reason,
        email,
      });
    }

    const response = createRedirectResponse(request.url, '/dashboard', {});
    response.cookies.set({
      name: 'mre_session',
      value: result.sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    });

    return response;
  } catch (error) {
    console.error('Login failed unexpectedly', error);
    return createRedirectResponse(request.url, '/auth/login', {
      error: 'server-error',
      email,
    });
  }
}

'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { loginUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkLoginRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';
import { isCookieSecure } from '@/server/runtime';

// This server action executes the full login flow: it validates inputs, enforces
// rate limits, delegates credential checks to the domain service, and finally
// mints the session cookie.  Keeping the orchestration here allows the UI to
// remain a simple form post while the critical logic stays on the server.

// Zod schema ensures we sanitise and normalise the form payload before handing
// it to the service layer.  Errors surface back to the UI through redirect
// parameters so we can display contextual messages.
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

// Helper for rebuilding the login URL with query-string flags.  We rely on
// redirects instead of rendering in-place so that the page stays statically
// typed and resilient across refreshes.
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

// FormData can return strings, File objects, or nulls; this helper standardises
// access to optional text fields.
const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

export const loginAction = async (formData: FormData) => {
  // The client identifier combines IP and user-agent hints so the rate limiter
  // can throttle burst attempts without locking out legitimate users sharing an
  // address (e.g. team pit wall).
  const headersList = headers();
  guardAuthPostOrigin(
    headersList,
    () =>
      redirect(
        buildRedirectUrl('/auth/login', {
          error: 'invalid-token',
        }),
      ),
    {
      route: 'auth/login',
    },
  );
  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkLoginRateLimit(identifier);

  if (!rateLimit.ok) {
    // When the rate limiter trips we short-circuit to the login page with a
    // dedicated error code.  The redirect prevents timing attacks that could
    // differentiate between throttled and rejected credentials.
    redirect(
      buildRedirectUrl('/auth/login', {
        error: 'rate-limited',
      }),
    );
  }

  const token = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(token ?? null, 'login');

  if (!tokenValidation.ok) {
    // Missing or stale CSRF tokens are treated as an invalid session.  The UI
    // invites the user to refresh so they pick up a fresh token value.
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
    // Validation failures flow back with the email preserved so the user does
    // not have to re-type it, reducing friction for simple typos.
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
    // Domain-level errors (unverified email, suspended account, etc.) are
    // surfaced to the page so we can display precise guidance without leaking
    // sensitive details to the attacker.
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
  // The session cookie is httpOnly and same-site lax so it is resilient against
  // XSS and CSRF while still allowing multi-tab usage.  We rely on the TTL
  // returned by the service to synchronise browser and database expirations.
  cookieJar.set({
    name: 'mre_session',
    value: result.sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    path: '/',
    expires: expiresAt,
    maxAge,
  });

  redirect('/dashboard');
};

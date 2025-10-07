'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { registerUserService } from '@/dependencies/auth';
import { validateAuthFormToken } from '@/lib/auth/formTokens';
import { checkRegisterRateLimit } from '@/lib/rateLimit/authRateLimiter';
import { extractClientIdentifier } from '@/lib/request/clientIdentifier';
import { guardAuthPostOrigin } from '@/server/security/origin';
import { isCookieSecure } from '@/server/runtime';

// The server action owns the full registration happy-path orchestration, so we keep
// the validation rules alongside it.  This schema mirrors the policy enforced at the
// service layer to provide fast feedback without duplicating logic in the client.
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

// We normalise incoming form data so the domain service receives a clean object with
// trimmed strings and a lower-cased email.  Custom refinement keeps the error mapping
// predictable for the UI when passwords do not match.
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

// Redirect destinations preserve the user's non-sensitive input and the error code so
// the page can re-render with contextual messaging.  A helper keeps this behaviour
// consistent across each exit path.
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

// `FormData.get` can yield strings or File objects.  Registration only allows text
// inputs, so we coerce anything else to `undefined` to gracefully trigger validation
// errors.
const getFormValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
};

export const registerAction = async (formData: FormData) => {
  // Rate limiting and the client identifier check run before any heavy work so abusive
  // attempts short-circuit without touching downstream dependencies.
  const headersList = headers();
  guardAuthPostOrigin(
    headersList,
    () =>
      redirect(
        buildRedirectUrl('/auth/register', {
          error: 'invalid-token',
        }),
      ),
    {
      route: 'auth/register',
    },
  );
  const identifier = extractClientIdentifier(headersList);
  const rateLimit = checkRegisterRateLimit(identifier);

  if (!rateLimit.ok) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: 'rate-limited',
      }),
    );
  }

  // Protect against CSRF by requiring a short-lived form token that ties back to the
  // session seeded when we rendered the page.
  const token = getFormValue(formData, 'formToken');
  const tokenValidation = validateAuthFormToken(token ?? null, 'registration');

  if (!tokenValidation.ok) {
    redirect(
      buildRedirectUrl('/auth/register', {
        error: 'invalid-token',
      }),
    );
  }

  // Parse the user-provided fields using the schema above.  `safeParse` ensures we can
  // branch on success without throwing, which keeps the control flow linear.
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

  // Delegate business logic to the app-layer service.  It coordinates persistence,
  // password hashing, and any follow-up actions such as verification emails.
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

  // Map the service outcome to the correct redirect so the UI can guide the user to
  // the next action in the onboarding flow.
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
      // Persist the issued session in an HTTP-only cookie so the browser carries it on
      // subsequent requests.  We respect the TTL provided by the service to keep the
      // session lifecycle in sync across tiers.
      if (result.session) {
        const cookieJar = cookies();
        const expiresAt = result.session.expiresAt;
        const maxAge = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
        cookieJar.set({
          name: 'mre_session',
          value: result.session.token,
          httpOnly: true,
          sameSite: 'lax',
          secure: isCookieSecure(),
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

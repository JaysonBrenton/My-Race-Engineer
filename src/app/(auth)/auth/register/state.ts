/**
 * Filename: src/app/(auth)/auth/register/state.ts
 * Purpose: Share registration form state shapes and helpers across server actions, routes, and UI.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT License
 */

export type StatusTone = 'info' | 'error' | 'success';

export type StatusMessage = {
  tone: StatusTone;
  message: string;
};

export type RegisterErrorCode =
  | 'invalid-origin'
  | 'invalid-token'
  | 'validation'
  | 'rate-limited'
  | 'email-taken'
  | 'weak-password'
  | 'server-error';

export type RegisterActionState = {
  status: StatusMessage;
  errorCode?: RegisterErrorCode;
  values: {
    name: string;
    email: string;
  };
  fieldErrors?: Array<{ field: string; message: string }>;
};

export const INITIAL_REGISTER_STATE: RegisterActionState = {
  status: {
    tone: 'info',
    message:
      'Fill out the fields below to create your account. We will email a verification link to finish setup.',
  },
  values: {
    name: '',
    email: '',
  },
};

export const buildStatusMessage = (errorCode: RegisterErrorCode | undefined): StatusMessage => {
  switch (errorCode) {
    case 'invalid-origin':
      return {
        tone: 'error',
        message:
          'Your request came from an unapproved origin. Check that APP_URL or ALLOWED_ORIGINS includes this host and try again.',
      };
    case 'invalid-token':
      return {
        tone: 'error',
        message: 'Your form expired. Please try again.',
      };
    case 'validation':
      return {
        tone: 'error',
        message: 'Please fix the highlighted fields.',
      };
    case 'rate-limited':
      return {
        tone: 'error',
        message: 'Too many attempts detected. Please retry in a moment.',
      };
    case 'email-taken':
      return {
        tone: 'error',
        message: 'That email is already registered. Try signing in or reset your password.',
      };
    case 'weak-password':
      return {
        tone: 'error',
        message: 'Choose a stronger password that meets the security policy.',
      };
    case 'server-error':
      return {
        tone: 'error',
        message: 'We could not complete registration. Try again in a moment.',
      };
    default:
      return INITIAL_REGISTER_STATE.status;
  }
};

type RegistrationPrefillInput = {
  name?: string | null | undefined;
  email?: string | null | undefined;
};

export const buildPrefillParam = (prefill: RegistrationPrefillInput): string | undefined => {
  const safeEntries = Object.entries(prefill)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => [key, (value as string).trim()]);

  if (safeEntries.length === 0) {
    return undefined;
  }

  try {
    return JSON.stringify(Object.fromEntries(safeEntries));
  } catch {
    return undefined;
  }
};

export const buildRedirectUrl = (
  pathname: string,
  searchParams: Record<string, string | undefined>,
) => {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

/**
 * Filename: src/app/(auth)/auth/register/state.ts
 * Purpose: Share registration form state shapes and helpers across server actions, routes, and UI.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT License
 */

import type { Route } from 'next';
import { redirect } from 'next/navigation';

type RedirectHref = Parameters<typeof redirect>[0];

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
  | 'driver-name-taken'
  | 'weak-password'
  | 'server-error';

export type RegisterActionState = {
  status: StatusMessage;
  errorCode?: RegisterErrorCode;
  values: {
    name: string;
    driverName: string;
    email: string;
  };
  fieldErrors?: Array<{ field: string; message: string }>;
  suggestedDriverNames?: string[];
};

export const INITIAL_REGISTER_STATE: RegisterActionState = {
  status: {
    tone: 'info',
    message:
      'Fill out the fields below to create your account. We will email a verification link to finish setup.',
  },
  values: {
    name: '',
    driverName: '',
    email: '',
  },
};

export type RegisterStatusContext = {
  driverNameSuggestions?: string[];
};

const formatDriverNameSuggestions = (suggestions: string[]): string => {
  if (suggestions.length === 0) {
    return '';
  }

  if (suggestions.length === 1) {
    return `Try “${suggestions[0]}” instead.`;
  }

  if (suggestions.length === 2) {
    return `Try “${suggestions[0]}” or “${suggestions[1]}” instead.`;
  }

  const [last, ...rest] = suggestions.slice().reverse();
  const leading = rest
    .reverse()
    .map((value) => `“${value}”`)
    .join(', ');
  return `Try ${leading}, or “${last}” instead.`;
};

export const buildStatusMessage = (
  errorCode: RegisterErrorCode | undefined,
  context: RegisterStatusContext = {},
): StatusMessage => {
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
    case 'driver-name-taken': {
      const suggestions = context.driverNameSuggestions ?? [];
      return {
        tone: 'error',
        message:
          suggestions.length > 0
            ? `That driver name is already registered. ${formatDriverNameSuggestions(suggestions)}`
            : 'That driver name is already registered. Enter a different driver name.',
      };
    }
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
  driverName?: string | null | undefined;
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
  const final = query ? `${pathname}?${query}` : pathname;
  return final as RedirectHref;
};

export const buildDriverNameSuggestionsParam = (suggestions: string[]): string | undefined => {
  const safeSuggestions = suggestions
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (safeSuggestions.length === 0) {
    return undefined;
  }

  const unique = Array.from(new Set(safeSuggestions)).slice(0, 5);

  try {
    return JSON.stringify(unique);
  } catch {
    return undefined;
  }
};

export const parseDriverNameSuggestionsParam = (raw: string | undefined): string[] => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 5);
  } catch {
    return [];
  }
};

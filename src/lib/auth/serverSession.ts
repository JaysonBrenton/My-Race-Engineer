import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { validateSessionTokenService } from '@/dependencies/auth';
import { SESSION_COOKIE_NAME } from './constants';

import type { ValidateSessionTokenFailureReason } from '@core/app';
import type { User, UserSession } from '@core/domain';

type SessionValidationStatus =
  | { status: 'missing' }
  | { status: 'invalid'; reason: ValidateSessionTokenFailureReason }
  | { status: 'authenticated'; user: User; session: UserSession };

const mapFailureReasonToErrorCode = (reason: ValidateSessionTokenFailureReason): string => {
  switch (reason) {
    case 'session-expired':
      return 'session-expired';
    case 'user-pending':
      return 'account-pending';
    case 'user-suspended':
      return 'account-suspended';
    default:
      return 'session-invalid';
  }
};

export const getSessionFromCookies = async (): Promise<SessionValidationStatus> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return { status: 'missing' };
  }

  const validation = await validateSessionTokenService.validate({ token: sessionCookie.value });

  if (!validation.ok) {
    return { status: 'invalid', reason: validation.reason };
  }

  return { status: 'authenticated', user: validation.user, session: validation.session };
};

export const requireAuthenticatedUser = async (): Promise<{ user: User; session: UserSession }> => {
  const result = await getSessionFromCookies();

  if (result.status === 'authenticated') {
    return { user: result.user, session: result.session };
  }

  if (result.status === 'missing') {
    redirect('/auth/login');
  }

  const errorParam = mapFailureReasonToErrorCode(result.reason);
  const searchParams = new URLSearchParams({ error: errorParam });
  redirect(`/auth/login?${searchParams.toString()}`);
};

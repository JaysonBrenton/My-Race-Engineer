/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Provide a typed logout action that respects Next.js typed routes.
 * License: MIT
 */
'use server';

import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { logoutUserSessionService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionFromCookies } from '@/lib/auth/serverSession';
import { createErrorLogContext } from '@/lib/logging/error';
import { ROUTE_LOGIN, loginWithStatus } from '@/app/routes';

const logger = applicationLogger.withContext({ route: 'auth/logout-action' });

export const logout = async (formData: FormData): Promise<void> => {
  void formData;

  const cookieJar = await cookies();
  let redirectTarget: Route = loginWithStatus('logout');
  let userAnonId: string | undefined;

  try {
    const status = await getSessionFromCookies();

    if (status.status === 'authenticated') {
      userAnonId = status.user.id;
      await logoutUserSessionService.logout({
        sessionId: status.session.id,
        userId: status.user.id,
      });
    }
  } catch (error: unknown) {
    redirectTarget = `${ROUTE_LOGIN}?error=server-error` as Route; // safe: fixed base + static error tag
    logger.error(
      'Failed to revoke session during logout.',
      createErrorLogContext(
        {
          event: 'auth.logout.revoke_failed',
          outcome: 'error',
          userAnonId,
        },
        error,
      ),
    );
  } finally {
    cookieJar.delete({ name: SESSION_COOKIE_NAME, path: '/' });
  }

  redirect(redirectTarget);
};

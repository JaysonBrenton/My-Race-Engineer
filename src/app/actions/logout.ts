'use server';

/**
 * Filename: src/app/actions/logout.ts
 * Purpose: Server action to revoke the active session and clear the browser cookie during logout.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-01-15
 * License: MIT
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { logoutUserSessionService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionFromCookies } from '@/lib/auth/serverSession';
import { createErrorLogContext } from '@/lib/logging/error';

const logger = applicationLogger.withContext({ route: 'auth/logout-action' });

export const logout = async (formData: FormData): Promise<void> => {
  void formData;

  const cookieJar = await cookies();
  let redirectTarget = '/auth/login';
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
    redirectTarget = '/auth/login?error=server-error';
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

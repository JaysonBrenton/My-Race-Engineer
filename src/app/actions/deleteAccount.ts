/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Ensure account deletion redirects comply with Next.js typed routes.
 * License: MIT
 */
'use server';

import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { deleteUserAccountService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { requireAuthenticatedUser } from '@/lib/auth/serverSession';
import { createErrorLogContext } from '@/lib/logging/error';
import { ROUTE_LOGIN } from '@/app/routes';

const logger = applicationLogger.withContext({
  route: 'settings/account/delete-account-action',
});

export const deleteAccount = async (formData: FormData): Promise<void> => {
  void formData;

  const { user } = await requireAuthenticatedUser();
  const cookieJar = await cookies();

  const deleteFailedTarget: Route = '/settings/account?error=delete-failed' as Route; // safe: static path + error tag
  const accountDeletedTarget: Route = `${ROUTE_LOGIN}?deleted=1` as Route; // safe: fixed base + static deleted flag

  try {
    await deleteUserAccountService.execute(user.id);
    cookieJar.delete({ name: SESSION_COOKIE_NAME, path: '/' });
  } catch (error: unknown) {
    logger.error(
      'Unable to delete account for authenticated user.',
      createErrorLogContext(
        {
          event: 'auth.account.delete_failed',
          outcome: 'error',
          userAnonId: user.id,
        },
        error,
      ),
    );
    redirect(deleteFailedTarget);
  }

  redirect(accountDeletedTarget);
};

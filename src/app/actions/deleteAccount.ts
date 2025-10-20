'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { deleteUserAccountService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { requireAuthenticatedUser } from '@/lib/auth/serverSession';
import { createErrorLogContext } from '@/lib/logging/error';

const logger = applicationLogger.withContext({
  route: 'settings/account/delete-account-action',
});

export const deleteAccount = async (formData: FormData): Promise<void> => {
  void formData;

  const { user } = await requireAuthenticatedUser();
  const cookieJar = await cookies();

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

    redirect('/settings/account?error=delete-failed');
  }

  redirect('/auth/login?deleted=1');
};

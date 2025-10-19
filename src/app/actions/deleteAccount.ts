'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { deleteUserAccountService } from '@/dependencies/auth';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { requireAuthenticatedUser } from '@/lib/auth/serverSession';

export const deleteAccount = async (formData: FormData): Promise<void> => {
  void formData;

  const { user } = await requireAuthenticatedUser();

  await deleteUserAccountService.execute(user.id);

  const cookieJar = cookies();
  cookieJar.delete({ name: SESSION_COOKIE_NAME, path: '/' });

  redirect('/auth/login?deleted=1');
};

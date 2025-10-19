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
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionFromCookies } from '@/lib/auth/serverSession';

export const logout = async (formData: FormData): Promise<void> => {
  void formData;

  const status = await getSessionFromCookies();

  if (status.status === 'authenticated') {
    await logoutUserSessionService.logout({
      sessionId: status.session.id,
      userId: status.user.id,
    });
  }

  const cookieJar = await cookies();
  cookieJar.delete({ name: SESSION_COOKIE_NAME, path: '/' });

  redirect('/auth/login');
};

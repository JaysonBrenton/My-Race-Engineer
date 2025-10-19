'use server';

// 'use server' files may only export async functions. Do NOT export objects/constants/types here.

/**
 * Filename: src/app/(auth)/auth/login/actions.ts
 * Purpose: Expose the login server action entrypoint while keeping implementation details in a non-server module.
 */

import { createLoginAction } from './actions.impl';

const loginActionImpl = createLoginAction();

export async function loginAction(formData: FormData): Promise<void> {
  return loginActionImpl(formData);
}

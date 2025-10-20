'use server';

// 'use server' files may only export async functions. Do NOT export objects/constants/types here.

/**
 * Filename: src/app/(auth)/auth/login/actions.ts
 * Purpose: Expose the login server action entrypoint while keeping implementation details in a non-server module.
 */

import { createLoginAction, type LoginActionResult } from './actions.impl';

const loginActionImpl = createLoginAction();

export type LoginActionState = LoginActionResult | null;

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  return loginActionImpl(formData);
}

'use server';

// 'use server' files may only export async functions. Do NOT export objects/constants/types here.

/**
 * Filename: src/app/(auth)/auth/login/resend-verification/actions.ts
 * Purpose: Export the verification resend action entry point for server components.
 */

import { createResendVerificationEmailAction } from './actions.impl';

const resendVerificationEmailActionImpl = createResendVerificationEmailAction();

export async function resendVerificationEmailAction(formData: FormData): Promise<void> {
  return resendVerificationEmailActionImpl(formData);
}

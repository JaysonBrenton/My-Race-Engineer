'use server';

/**
 * Filename: src/app/(auth)/auth/login/resend-verification/actions.ts
 * Purpose: Export the verification resend action entry point for server components.
 */

import { createResendVerificationEmailAction } from './actions.impl';

export const resendVerificationEmailAction = createResendVerificationEmailAction();

'use server';

/**
 * Filename: src/app/(auth)/auth/login/actions.ts
 * Purpose: Expose the login server action entrypoint while keeping implementation details in a non-server module.
 */

import { createLoginAction } from './actions.impl';

export const loginAction = createLoginAction();

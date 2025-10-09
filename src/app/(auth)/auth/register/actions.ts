'use server';

/**
 * Filename: src/app/(auth)/auth/register/actions.ts
 * Purpose: Expose the register server action entrypoint while keeping implementation details in a non-server module.
 */

import { createRegisterAction } from './actions.impl';
export const registerAction = createRegisterAction();

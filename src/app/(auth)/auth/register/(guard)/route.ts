/**
 * Filename: src/app/(auth)/auth/register/(guard)/route.ts
 * Purpose: Block disallowed origins before invoking the registration server action.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { handleRegisterGuardPost } from './guard.impl';

export async function POST(req: Request): Promise<Response> {
  return handleRegisterGuardPost(req);
}

/**
 * Filename: src/app/(auth)/auth/login/(guard)/route.ts
 * Purpose: Block disallowed origins before invoking the login server action.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { handleLoginGuardPost } from './guard.impl';

export async function POST(req: Request): Promise<Response> {
  return handleLoginGuardPost(req);
}

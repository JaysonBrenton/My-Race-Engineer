/**
 * Filename: src/app/(auth)/auth/login/(guard)/route.ts
 * Purpose: Block disallowed origins before invoking the login server action.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

// No React types in server routes by design.

import { type NextRequest, type NextResponse } from 'next/server';

import { handleLoginGuardPost } from './guard.impl';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleLoginGuardPost(req);
}

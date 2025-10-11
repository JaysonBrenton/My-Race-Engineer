/**
 * Filename: src/app/api/dev/auth-debug/route.ts
 * Purpose: Provide development diagnostics for auth configuration and feature flag states.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import { NextResponse } from 'next/server';

import { parseAllowedOrigins } from '@/core/security/origin';
import { FORM_TOKEN_TTL_MS } from '@/lib/auth/formTokens';
import { getEnvironment } from '@/server/config/environment';

export const dynamic = 'force-dynamic';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

const isProduction = () => process.env.NODE_ENV === 'production';

export function GET() {
  if (isProduction()) {
    return NextResponse.json({ status: 'disabled' }, { status: 404, headers: baseHeaders });
  }

  const allowedOrigins = parseAllowedOrigins(process.env);
  const environment = getEnvironment();
  const { requireEmailVerification, requireAdminApproval, inviteOnly } = environment.features;

  return NextResponse.json(
    {
      status: 'ok',
      allowedOrigins,
      tokenTtlMs: FORM_TOKEN_TTL_MS,
      requireEmailVerification,
      requireAdminApproval,
      inviteOnly,
    },
    { status: 200, headers: baseHeaders },
  );
}

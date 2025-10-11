import { NextResponse } from 'next/server';

import { parseAllowedOrigins } from '@/core/security/origin';
import { FORM_TOKEN_TTL_MS } from '@/lib/auth/formTokens';

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
  const requireEmailVerification =
    process.env.FEATURE_REQUIRE_EMAIL_VERIFICATION?.toLowerCase() === 'true';
  const requireAdminApproval = process.env.FEATURE_REQUIRE_ADMIN_APPROVAL?.toLowerCase() === 'true';

  return NextResponse.json(
    {
      status: 'ok',
      allowedOrigins,
      tokenTtlMs: FORM_TOKEN_TTL_MS,
      requireEmailVerification,
      requireAdminApproval,
    },
    { status: 200, headers: baseHeaders },
  );
}

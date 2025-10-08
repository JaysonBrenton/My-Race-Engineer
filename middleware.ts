/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Enforce origin allow-listing for authentication POST requests.
 * License: MIT
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { effectiveRequestOrigin, guardAuthPostOrigin, parseAllowedOrigins } from '@/core/security/origin';

const isAuthPath = (pathname: string) =>
  pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register');

const shouldLogDiagnostics = () => process.env.NODE_ENV !== 'production';

const logDevDiagnostics = (params: {
  pathname: string;
  reason: 'mismatch' | 'missing' | 'invalid';
  allowed: string[];
  effectiveOrigin: string | null;
  forwardedProto: string | null;
  forwardedHost: string | null;
  forwardedFor: string | null;
}) => {
  if (!shouldLogDiagnostics()) {
    return;
  }

  const payload = {
    event: 'auth.origin_guard.blocked',
    route: params.pathname,
    reason: params.reason,
    allowedOrigins: params.allowed,
    effectiveOrigin: params.effectiveOrigin,
    forwarded: {
      proto: params.forwardedProto,
      host: params.forwardedHost,
      for: params.forwardedFor,
    },
  };

  console.warn('[auth-origin-guard] blocked request', payload);
};

export function middleware(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.next();
  }

  if (!isAuthPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const allowedOrigins = parseAllowedOrigins(process.env);
  const result = guardAuthPostOrigin(req, allowedOrigins);

  if (!result.ok) {
    logDevDiagnostics({
      pathname: req.nextUrl.pathname,
      reason: result.reason,
      allowed: allowedOrigins,
      effectiveOrigin: effectiveRequestOrigin(req),
      forwardedProto: req.headers.get('x-forwarded-proto'),
      forwardedHost: req.headers.get('x-forwarded-host'),
      forwardedFor: req.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.redirect(result.redirectTo, 303);
    response.headers.set('x-auth-origin-guard', 'mismatch');
    response.headers.set('x-allowed-origins', allowedOrigins.join(','));
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('x-auth-origin-guard', 'ok');
  return response;
}

export const config = {
  matcher: [
    '/auth/login',
    '/auth/login/:path*',
    '/auth/register',
    '/auth/register/:path*',
  ],
};

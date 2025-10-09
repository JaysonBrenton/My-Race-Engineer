/**
 * Filename: src/app/(auth)/auth/login/(guard)/route.ts
 * Purpose: Block disallowed origins before invoking the login server action.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { NextResponse } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';
import {
  effectiveRequestOrigin,
  guardAuthPostOrigin,
  parseAllowedOrigins,
} from '@/core/security/origin';

import { loginAction } from '../actions';

const shouldLogDiagnostics = () => process.env.NODE_ENV !== 'production';

export async function POST(req: Request): Promise<Response> {
  const allowedOrigins = parseAllowedOrigins(process.env);
  const result = guardAuthPostOrigin(req, allowedOrigins);

  if (!result.ok) {
    if (shouldLogDiagnostics()) {
      applicationLogger.warn('auth.origin_guard.login_blocked', {
        route: '/auth/login',
        reason: result.reason,
        allowedOrigins,
        effectiveOrigin: effectiveRequestOrigin(req),
        forwardedProto: req.headers.get('x-forwarded-proto'),
        forwardedHost: req.headers.get('x-forwarded-host'),
        forwardedFor: req.headers.get('x-forwarded-for'),
      });
    }

    const response = NextResponse.redirect(result.redirectTo, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-auth-origin-guard', 'mismatch');
    response.headers.set('x-allowed-origins', allowedOrigins.join(','));
    return response;
  }

  const formData = await req.formData();
  await loginAction(formData);

  const response = NextResponse.redirect(new URL('/auth/login', req.url), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('x-auth-origin-guard', 'ok');
  return response;
}

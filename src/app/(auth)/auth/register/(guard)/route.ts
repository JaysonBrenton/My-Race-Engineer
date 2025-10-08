/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Guard registration posts against disallowed origins before invoking the action.
 * License: MIT
 */

import { NextResponse } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';
import {
  effectiveRequestOrigin,
  guardAuthPostOrigin,
  parseAllowedOrigins,
} from '@/core/security/origin';

import { registerAction } from '../actions';

const shouldLogDiagnostics = () => process.env.NODE_ENV !== 'production';

export async function POST(req: Request): Promise<Response> {
  const allowedOrigins = parseAllowedOrigins(process.env);
  const result = guardAuthPostOrigin(req, allowedOrigins);

  if (!result.ok) {
    if (shouldLogDiagnostics()) {
      applicationLogger.warn('auth.origin_guard.register_blocked', {
        route: '/auth/register',
        reason: result.reason,
        allowedOrigins,
        effectiveOrigin: effectiveRequestOrigin(req),
        forwardedProto: req.headers.get('x-forwarded-proto'),
        forwardedHost: req.headers.get('x-forwarded-host'),
        forwardedFor: req.headers.get('x-forwarded-for'),
      });
    }

    const response = NextResponse.redirect(result.redirectTo, 303);
    response.headers.set('x-auth-origin-guard', 'mismatch');
    response.headers.set('x-allowed-origins', allowedOrigins.join(','));
    return response;
  }

  const formData = await req.formData();
  await registerAction(formData);

  const response = NextResponse.redirect(new URL('/auth/register', req.url), { status: 303 });
  response.headers.set('x-auth-origin-guard', 'ok');
  return response;
}

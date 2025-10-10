/**
 * Filename: src/app/(auth)/auth/login/(guard)/guard.impl.ts
 * Purpose: Provide the POST handler implementation for the login origin guard route.
 * Author: OpenAI Assistant
 */

import { NextResponse } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';
import {
  effectiveRequestOrigin,
  guardAuthPostOrigin,
  parseAllowedOrigins,
} from '@/core/security/origin';

import { loginAction } from '../actions';

const shouldLogDiagnostics = (): boolean => process.env.NODE_ENV !== 'production';

export const handleLoginGuardPost = async (req: Request): Promise<Response> => {
  const route = '/auth/login';
  const logger = applicationLogger.withContext({ route });
  const allowedOrigins = parseAllowedOrigins(process.env, { logger });
  const result = guardAuthPostOrigin(req, allowedOrigins, { logger, route });

  if (!result.ok) {
    if (shouldLogDiagnostics()) {
      logger.warn('auth.origin_guard.login_blocked', {
        route,
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
};

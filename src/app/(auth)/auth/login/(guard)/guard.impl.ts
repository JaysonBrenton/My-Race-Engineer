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
import {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
} from 'next/dist/client/components/redirect';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { createLoginAction } from '../actions.impl';
import { ensureError } from '@/lib/errors/ensureError';
import { applyAuthDebugHeaders, createAuthActionDebugRecorder } from '@/server/security/authDebug';

const shouldLogDiagnostics = (): boolean => process.env.NODE_ENV !== 'production';

export const handleLoginGuardPost = async (req: Request): Promise<Response> => {
  const route = '/auth/login';
  const logger = applicationLogger.withContext({ route });
  const allowedOrigins = parseAllowedOrigins(process.env, { logger });
  const result = guardAuthPostOrigin(req, allowedOrigins, { logger, route });

  logger.info('Login guard received request.', {
    event: 'auth.login.request',
    component: 'guard',
    method: req.method,
    hasOriginHeader: req.headers.has('origin'),
    originAllowed: result.ok,
    middlewareOriginHeader: req.headers.get('x-auth-origin-guard'),
  });

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
    if (process.env.NODE_ENV !== 'production') {
      response.headers.set('x-auth-action', 'login');
      response.headers.set('x-auth-token', 'missing');
      response.headers.set('x-auth-outcome', 'redirect');
    }
    return response;
  }

  const formData = await req.formData();
  const debugRecorder = createAuthActionDebugRecorder('login');
  const action = createLoginAction(undefined, { onDebugEvent: debugRecorder.record });

  try {
    await action(formData);
  } catch (error) {
    const caught: unknown = error;

    if (isRedirectError(caught)) {
      const redirectError = caught;
      const location = getURLFromRedirectError(redirectError);
      const statusCode = getRedirectStatusCodeFromError(redirectError);

      if (!location) {
        throw ensureError(redirectError);
      }

      const response = NextResponse.redirect(location, statusCode);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('x-auth-origin-guard', 'ok');
      applyAuthDebugHeaders(response, debugRecorder.snapshot());
      return response;
    }

    throw ensureError(caught);
  }

  const response = NextResponse.redirect(new URL('/auth/login', req.url), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('x-auth-origin-guard', 'ok');
  applyAuthDebugHeaders(response, debugRecorder.snapshot());
  return response;
};

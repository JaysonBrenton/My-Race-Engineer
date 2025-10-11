/**
 * Filename: src/app/(auth)/auth/register/(guard)/guard.impl.ts
 * Purpose: Provide the POST handler implementation for the registration origin guard route.
 * Author: OpenAI Assistant
 */

import { NextResponse } from 'next/server';

import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';
import {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
  isRedirectError,
} from 'next/dist/client/components/redirect';
import { appendMutableCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

import { applicationLogger } from '@/dependencies/logger';
import {
  effectiveRequestOrigin,
  guardAuthPostOrigin,
  parseAllowedOrigins,
} from '@/core/security/origin';

import { createRegisterAction } from '../actions.impl';
import { applyAuthDebugHeaders, createAuthActionDebugRecorder } from '@/server/security/authDebug';

const shouldLogDiagnostics = (): boolean => process.env.NODE_ENV !== 'production';

export const handleRegisterGuardPost = async (req: Request): Promise<Response> => {
  const route = '/auth/register';
  const logger = applicationLogger.withContext({ route });
  const allowedOrigins = parseAllowedOrigins(process.env, { logger });
  const result = guardAuthPostOrigin(req, allowedOrigins, { logger, route });

  logger.info('Registration guard received request.', {
    event: 'auth.register.request',
    component: 'guard',
    method: req.method,
    hasOriginHeader: req.headers.has('origin'),
    originAllowed: result.ok,
    middlewareOriginHeader: req.headers.get('x-auth-origin-guard'),
  });

  if (!result.ok) {
    if (shouldLogDiagnostics()) {
      logger.warn('auth.origin_guard.register_blocked', {
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
      response.headers.set('x-auth-action', 'register');
      response.headers.set('x-auth-token', 'missing');
      response.headers.set('x-auth-outcome', 'redirect');
    }
    return response;
  }

  const formData = await req.formData();
  const debugRecorder = createAuthActionDebugRecorder('register');
  const action = createRegisterAction(undefined, { onDebugEvent: debugRecorder.record });

  try {
    await action(formData);
  } catch (error) {
    if (isRedirectError(error)) {
      const location = getURLFromRedirectError(error);
      const statusCode = getRedirectStatusCodeFromError(error);

      if (!location) {
        throw error;
      }

      const response = NextResponse.redirect(location, statusCode);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('x-auth-origin-guard', 'ok');

      applyAuthDebugHeaders(response, debugRecorder.snapshot());

      const mutableCookies = (error as { mutableCookies?: ResponseCookies }).mutableCookies;
      if (mutableCookies) {
        appendMutableCookies(response.headers, mutableCookies);
      }

      return response;
    }

    throw error;
  }

  const fallback = NextResponse.redirect(new URL('/auth/register', req.url), 303);
  fallback.headers.set('Cache-Control', 'no-store');
  fallback.headers.set('x-auth-origin-guard', 'ok');
  applyAuthDebugHeaders(fallback, debugRecorder.snapshot());
  return fallback;
};

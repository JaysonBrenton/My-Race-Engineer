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

import { registerAction } from '../actions';

const shouldLogDiagnostics = (): boolean => process.env.NODE_ENV !== 'production';

export const handleRegisterGuardPost = async (req: Request): Promise<Response> => {
  const route = '/auth/register';
  const logger = applicationLogger.withContext({ route });
  const allowedOrigins = parseAllowedOrigins(process.env, { logger });
  const result = guardAuthPostOrigin(req, allowedOrigins, { logger, route });

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
    return response;
  }

  const formData = await req.formData();

  try {
    await registerAction(formData);
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
  return fallback;
};

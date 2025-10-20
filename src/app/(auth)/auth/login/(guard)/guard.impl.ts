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
import { createLoginAction, type LoginActionErrorResult, type LoginActionResult } from '../actions.impl';
import { applyAuthDebugHeaders, createAuthActionDebugRecorder } from '@/server/security/authDebug';

const shouldLogDiagnostics = (): boolean => process.env.NODE_ENV !== 'production';

export const handleLoginGuardPost = async (req: Request): Promise<Response> => {
  const route = '/auth/login';
  const logger = applicationLogger.withContext({ route });
  const allowedOrigins = parseAllowedOrigins(process.env, { logger });
  const originCheck = guardAuthPostOrigin(req, allowedOrigins, { logger, route });

  logger.info('Login guard received request.', {
    event: 'auth.login.request',
    component: 'guard',
    method: req.method,
    hasOriginHeader: req.headers.has('origin'),
    originAllowed: originCheck.ok,
    middlewareOriginHeader: req.headers.get('x-auth-origin-guard'),
  });

  if (!originCheck.ok) {
    if (shouldLogDiagnostics()) {
      logger.warn('auth.origin_guard.login_blocked', {
        route,
        reason: originCheck.reason,
        allowedOrigins,
        effectiveOrigin: effectiveRequestOrigin(req),
        forwardedProto: req.headers.get('x-forwarded-proto'),
        forwardedHost: req.headers.get('x-forwarded-host'),
        forwardedFor: req.headers.get('x-forwarded-for'),
      });
    }

    const response = NextResponse.redirect(originCheck.redirectTo, 303);
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

  const result = await action(formData);
  const response = buildGuardResponse(result, req);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('x-auth-origin-guard', 'ok');
  applyAuthDebugHeaders(response, debugRecorder.snapshot());
  return response;
};

const buildGuardResponse = (result: LoginActionResult, req: Request): NextResponse => {
  if (result.status === 'success') {
    const target = new URL(result.redirectTo, req.url);
    return NextResponse.redirect(target, 303);
  }

  const url = buildLoginRedirectUrl(result, req);
  return NextResponse.redirect(url, 303);
};

const buildLoginRedirectUrl = (result: LoginActionErrorResult, req: Request): URL => {
  const params = new URLSearchParams();
  params.set('error', result.error);

  const identifier = result.prefill?.identifier;
  if (typeof identifier === 'string' && identifier.trim().length > 0) {
    try {
      params.set('prefill', JSON.stringify({ identifier }));
    } catch {
      // Ignore JSON serialisation errors so we still return the primary error code.
    }
  }

  const query = params.toString();
  const pathname = query ? `/auth/login?${query}` : '/auth/login';
  return new URL(pathname, req.url);
};

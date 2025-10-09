/**
 * Filename: src/app/(auth)/auth/register/(guard)/route.ts
 * Purpose: Block disallowed origins before invoking the registration server action.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
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
import { INITIAL_REGISTER_STATE, buildPrefillParam, buildRedirectUrl } from '../state';

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
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-auth-origin-guard', 'mismatch');
    response.headers.set('x-allowed-origins', allowedOrigins.join(','));
    return response;
  }

  const formData = await req.formData();

  try {
    const state = await registerAction(INITIAL_REGISTER_STATE, formData);
    const redirectUrl = buildRedirectUrl('/auth/register', {
      error: state.errorCode,
      prefill: buildPrefillParam(state.values),
      name: state.values.name || undefined,
      email: state.values.email || undefined,
    });
    const location = new URL(redirectUrl, req.url);
    const response = NextResponse.redirect(location, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-auth-origin-guard', 'ok');
    return response;
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
}

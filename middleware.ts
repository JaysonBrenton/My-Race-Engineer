/**
 * Filename: middleware.ts
 * Purpose: Enforce the authentication origin allow list and emit structured diagnostics for redirects.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import { NextRequest, NextResponse } from 'next/server';

import { logSecurityEvent } from '@/server/logging';
import { evaluateOriginHeader, parseAllowedOrigins } from '@/core/security/origin';

const AUTH_POST_PATHS = [/^\/auth\/login(?:\/.*)?$/, /^\/auth\/register(?:\/.*)?$/];

const isAuthPost = (request: NextRequest | Request) => {
  if (request.method !== 'POST') {
    return false;
  }

  const { pathname } = new URL(request.url);
  return AUTH_POST_PATHS.some((pattern) => pattern.test(pathname));
};

const resolveAuthRedirectTarget = (pathname: string) =>
  pathname.startsWith('/auth/register') ? '/auth/register' : '/auth/login';

const buildRedirectLocation = (requestUrl: string, targetPath: string) => {
  const url = new URL(requestUrl);
  url.pathname = targetPath;
  url.search = '';
  url.searchParams.set('error', 'invalid-origin');
  return url;
};

const readAllowedOrigins = () => parseAllowedOrigins(process.env);

export const isAllowedOrigin = (request: NextRequest | Request) => {
  const allowedList = readAllowedOrigins();
  const decision = evaluateOriginHeader(request.headers.get('origin'), allowedList);

  return {
    allowed: decision.allowed,
    origin: decision.origin,
    allowedList,
    reason: decision.reason,
  };
};

export function middleware(request: NextRequest | Request) {
  if (!isAuthPost(request)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const { pathname } = new URL(request.url);
  const result = isAllowedOrigin(request);

  if (!result.allowed) {
    const requestId = request.headers.get('x-request-id') ?? globalThis.crypto.randomUUID();
    logSecurityEvent('warn', 'auth.origin.mismatch', {
      requestId,
      path: pathname,
      method: request.method,
      origin: result.origin,
      allowedList: result.allowedList,
      reason: result.reason,
    });

    const redirectTarget = resolveAuthRedirectTarget(pathname);
    const redirectUrl = buildRedirectLocation(request.url, redirectTarget);
    const response = NextResponse.redirect(redirectUrl, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-auth-origin-guard', 'mismatch');
    response.headers.set('x-allowed-origins', result.allowedList.join(','));
    response.headers.set('x-request-id', requestId);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('x-auth-origin-guard', 'ok');
  if (result.origin) {
    response.headers.set('x-auth-origin', result.origin);
  }
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

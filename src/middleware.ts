/**
 * Author: Jayson + The Brainy One
 * Date: 2025-03-18
 * Purpose: Enforce auth POST origin restrictions at the edge before server actions execute.
 * License: MIT License
 */

import { NextRequest, NextResponse } from 'next/server';

import { guardAuthPostOrigin, parseAllowedOrigins } from '@/core/security/origin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

type MiddlewareRequest = NextRequest | Request;

const PROTECTED_AUTH_PATHS = new Set(['/auth/login', '/auth/register']);
const PROTECTED_APP_PATH_PREFIXES = ['/dashboard', '/import'];
const LOGIN_PATH = '/auth/login';
const REDIRECT_QUERY_PARAM = 'redirectTo';
const PROTECTED_NAVIGATION_METHODS = new Set(['GET', 'HEAD']);

const hasNextUrl = (request: MiddlewareRequest): request is NextRequest =>
  'nextUrl' in request && typeof request.nextUrl.pathname === 'string';

const getPathname = (request: MiddlewareRequest): string => {
  if (hasNextUrl(request)) {
    return request.nextUrl.pathname;
  }

  return new URL(request.url).pathname;
};

const getSearch = (request: MiddlewareRequest): string => {
  if (hasNextUrl(request)) {
    return request.nextUrl.search;
  }

  return new URL(request.url).search;
};

const buildMutableUrl = (request: MiddlewareRequest): URL => {
  if (hasNextUrl(request)) {
    return new URL(request.nextUrl.toString());
  }

  return new URL(request.url);
};

const hasCookieStore = (request: MiddlewareRequest): request is NextRequest => 'cookies' in request;

const getCookieValue = (request: MiddlewareRequest, name: string): string | undefined => {
  if (hasCookieStore(request)) {
    const cookie = request.cookies.get(name);

    if (!cookie) {
      return undefined;
    }

    return typeof cookie === 'string' ? cookie : cookie.value;
  }

  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(';');

  for (const rawCookie of cookies) {
    const [rawName, ...rawValue] = rawCookie.split('=');

    if (rawName?.trim() === name) {
      const value = rawValue.join('=').trim();
      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
};

const isProtectedAppPath = (pathname: string): boolean =>
  PROTECTED_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

const shouldEnforceAuthentication = (request: MiddlewareRequest): boolean => {
  if (!PROTECTED_NAVIGATION_METHODS.has(request.method.toUpperCase())) {
    return false;
  }

  const pathname = getPathname(request);
  return isProtectedAppPath(pathname);
};

const buildLoginRedirectUrl = (request: MiddlewareRequest): URL => {
  const loginUrl = buildMutableUrl(request);
  const pathname = getPathname(request);
  const search = getSearch(request);

  loginUrl.pathname = LOGIN_PATH;
  loginUrl.search = '';

  const redirectTarget = `${pathname}${search}`;

  if (redirectTarget && redirectTarget !== LOGIN_PATH) {
    loginUrl.searchParams.set(REDIRECT_QUERY_PARAM, redirectTarget);
  }

  return loginUrl;
};

const isProtectedAuthPost = (request: MiddlewareRequest): boolean => {
  if (request.method !== 'POST') {
    return false;
  }

  const pathname = getPathname(request);
  return PROTECTED_AUTH_PATHS.has(pathname);
};

export function middleware(request: MiddlewareRequest): NextResponse {
  if (!isProtectedAuthPost(request)) {
    if (shouldEnforceAuthentication(request)) {
      const sessionCookie = getCookieValue(request, SESSION_COOKIE_NAME);

      if (!sessionCookie) {
        const loginUrl = buildLoginRedirectUrl(request);
        return NextResponse.redirect(loginUrl, 303);
      }
    }

    return NextResponse.next();
  }

  const pathname = getPathname(request);
  const allowedOrigins = parseAllowedOrigins(process.env);
  const evaluation = guardAuthPostOrigin(request, allowedOrigins);

  if (!evaluation.ok) {
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = pathname;
    redirectUrl.search = '';
    redirectUrl.searchParams.set('error', 'invalid-origin');

    return NextResponse.redirect(redirectUrl, 303);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/auth/:path*', '/dashboard/:path*', '/import/:path*'] };

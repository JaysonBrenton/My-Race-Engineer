/**
 * Author: Jayson + The Brainy One
 * Date: 2025-03-18
 * Purpose: Enforce auth POST origin restrictions at the edge before server actions execute.
 * License: MIT License
 */

import { NextRequest, NextResponse } from 'next/server';

import { guardAuthPostOrigin, parseAllowedOrigins } from '@/core/security/origin';

type MiddlewareRequest = NextRequest | Request;

const PROTECTED_AUTH_PATHS = new Set(['/auth/login', '/auth/register']);

const hasNextUrl = (request: MiddlewareRequest): request is NextRequest =>
  'nextUrl' in request && typeof request.nextUrl.pathname === 'string';

const getPathname = (request: MiddlewareRequest): string => {
  if (hasNextUrl(request)) {
    return request.nextUrl.pathname;
  }

  return new URL(request.url).pathname;
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

export const config = { matcher: ['/auth/:path*'] };

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAllowedOrigins } from '@/core/auth/getAllowedOrigins';

const AUTH_POST_PATHS = new Set(['/auth/login', '/auth/register']);

const normalizeOrigin = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/\/$/, '');

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
};

export function middleware(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (!AUTH_POST_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = normalizeOrigin(req.headers.get('origin'));

  if (!origin || !allowedOrigins.has(origin)) {
    const redirectUrl = new URL(`${pathname}?error=invalid-origin`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/auth/login', '/auth/register'],
};

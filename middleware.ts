import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAllowedOrigins } from '@/core/auth/getAllowedOrigins';

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
  const { pathname } = req.nextUrl;

  const isLoginSurface = pathname.startsWith('/auth/login');
  const isRegisterSurface = pathname.startsWith('/auth/register');

  if (!isLoginSurface && !isRegisterSurface) {
    return NextResponse.next();
  }

  if (req.method !== 'POST') {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = normalizeOrigin(req.headers.get('origin'));

  const surface = isLoginSurface ? '/auth/login' : '/auth/register';
  if (!origin || !allowedOrigins.has(origin)) {
    const redirectUrl = new URL(`${surface}?error=invalid-origin`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/auth/login',
    '/auth/login/:path*',
    '/auth/register',
    '/auth/register/:path*',
  ],
};

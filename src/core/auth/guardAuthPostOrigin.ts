import { NextResponse } from 'next/server';

import { getAllowedOrigins } from './getAllowedOrigins';

type AuthRedirectPath = '/auth/login' | '/auth/register';

const normalizeHeaderOrigin = (value: string | null): string | null => {
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

export const guardAuthPostOrigin = (req: Request, redirectToPath: AuthRedirectPath) => {
  const allowedOrigins = getAllowedOrigins();
  const headerOrigin = normalizeHeaderOrigin(req.headers.get('origin'));

  if (!headerOrigin || !allowedOrigins.has(headerOrigin)) {
    const redirectUrl = new URL(`${redirectToPath}?error=invalid-origin`, req.url);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  return null;
};

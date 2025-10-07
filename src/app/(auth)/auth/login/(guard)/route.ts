import { NextResponse } from 'next/server';

import { guardAuthPostOrigin } from '@/core/auth/guardAuthPostOrigin';

import { loginAction } from '../actions';

export async function POST(req: Request): Promise<Response> {
  const bounce = guardAuthPostOrigin(req, '/auth/login');
  if (bounce) {
    return bounce;
  }

  const formData = await req.formData();
  await loginAction(formData);

  return NextResponse.redirect(new URL('/auth/login', req.url), { status: 303 });
}

import { NextResponse } from 'next/server';

import { guardAuthPostOrigin } from '@/core/auth/guardAuthPostOrigin';

import { registerAction } from '../actions';

export async function POST(req: Request): Promise<Response> {
  const bounce = guardAuthPostOrigin(req, '/auth/register');
  if (bounce) return bounce;

  const formData = await req.formData();
  await registerAction(formData);

  return NextResponse.redirect(new URL('/auth/register', req.url), { status: 303 });
}

import type { NextRequest } from 'next/server';

import type { JobStatusRouteContext } from './handlers';
import { createJobStatusRouteHandlers } from './handlers';

type RouteHandlers = ReturnType<typeof createJobStatusRouteHandlers>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const handlers: RouteHandlers = createJobStatusRouteHandlers();

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const context = { params: { jobId } } satisfies JobStatusRouteContext;

  if (handlers.OPTIONS) {
    return handlers.OPTIONS(request, context);
  }

  return new Response(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const context = { params: { jobId } } satisfies JobStatusRouteContext;

  return handlers.GET(request, context);
}

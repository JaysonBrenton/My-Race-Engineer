import type { JobStatusRouteContext } from './handlers';
import { createJobStatusRouteHandlers } from './handlers';

type RouteHandlers = ReturnType<typeof createJobStatusRouteHandlers>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const handlers: RouteHandlers = createJobStatusRouteHandlers();

export function OPTIONS(request: Request, context: JobStatusRouteContext) {
  if (handlers.OPTIONS) {
    return handlers.OPTIONS(request, context);
  }

  return new Response(null, { status: 204 });
}

export function GET(request: Request, context: JobStatusRouteContext) {
  return handlers.GET(request, context);
}

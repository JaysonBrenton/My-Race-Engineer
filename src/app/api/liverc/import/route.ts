// src/app/api/liverc/import/route.ts

import { createImportRouteHandlers } from './handlers';

type RouteHandlers = ReturnType<typeof createImportRouteHandlers>;

// Optional Next config that is allowed from a route file
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Build handlers once
const handlers: RouteHandlers = createImportRouteHandlers();

// Export ONLY HTTP methods (and only those that actually exist)
export function OPTIONS(req: Request) {
  if (handlers.OPTIONS) return handlers.OPTIONS(req);
  return new Response(null, { status: 204 });
}

export function POST(req: Request) {
  return handlers.POST(req);
}

// If you also have GET/PUT/PATCH/DELETE, export them the same way:
// export async function GET(req: Request) { return handlers.GET(req); }

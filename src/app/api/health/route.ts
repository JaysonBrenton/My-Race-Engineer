// No React types in server routes by design.

import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';

export const dynamic = 'force-dynamic';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/health',
  });

  const payload = {
    status: 'ok' as const,
    requestId,
    timestamp: new Date().toISOString(),
  };

  logger.debug('Health check succeeded.', {
    event: 'health.ok',
    outcome: 'success',
  });

  return NextResponse.json(payload, {
    status: 200,
    headers: { ...baseHeaders, 'x-request-id': requestId },
  });
}

export function POST() {
  return methodNotAllowedResponse();
}

export function PUT() {
  return methodNotAllowedResponse();
}

export function PATCH() {
  return methodNotAllowedResponse();
}

export function DELETE() {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse() {
  return new NextResponse(null, {
    status: 405,
    headers: {
      ...baseHeaders,
      Allow: 'GET',
    },
  });
}

/**
 * Project: My Race Engineer
 * File: src/app/api/connectors/liverc/clubs/search/route.ts
 * Summary: API route that searches persisted LiveRC clubs for dashboard quick import lookup.
 */
// No React types in server routes by design.

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { NextRequest } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';
import { getPrismaClient } from '@core/infra';

const ROUTE_PATH = '/api/connectors/liverc/clubs/search';
const ALLOW_HEADER = 'OPTIONS, GET';

const baseHeaders = {
  'Cache-Control': 'no-store',
  Allow: ALLOW_HEADER,
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

const QuerySchema = z.object({
  q: z
    .string({ required_error: 'Search query is required.' })
    .trim()
    .min(2, 'Search query must be at least 2 characters long.'),
});

const buildJsonResponse = (status: number, payload: unknown, requestId: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...baseHeaders,
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });

const buildRequestLogger = (requestId: string) =>
  applicationLogger.withContext({ requestId, route: ROUTE_PATH });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: baseHeaders,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = buildRequestLogger(requestId);

  // Parse query parameters from the request URL so the handler works for both
  // NextRequest instances and the plain Request objects used in tests.
  const searchParams = new URL(request.url).searchParams;
  const parsed = QuerySchema.safeParse({
    q: searchParams.get('q'),
  });

  if (!parsed.success) {
    logger.warn('LiveRC club search request failed validation.', {
      event: 'liverc.clubs.search.invalid_request',
      outcome: 'invalid-payload',
      details: { issues: parsed.error.issues },
    });

    return buildJsonResponse(
      400,
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Search query is invalid.',
          details: {
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          },
        },
        requestId,
      },
      requestId,
    );
  }

  const { q } = parsed.data;

  try {
    const prisma = getPrismaClient();
    const searchTerm = q.trim();

    // Use an OR clause to allow matches on either the display name or the
    // canonical LiveRC subdomain so users can search by track name or domain.
    const clubs = await prisma.club.findMany({
      where: {
        isActive: true,
        OR: [
          { displayName: { contains: searchTerm, mode: 'insensitive' } },
          { liveRcSubdomain: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ displayName: 'asc' }],
      take: 10,
    });

    const payload = clubs.map((club) => ({
      id: club.id,
      name: club.displayName,
      subdomain: club.liveRcSubdomain,
      region: club.region ?? null,
      // Timezone is currently optional in the model; preserve any stored value
      // while defaulting to null for older records that do not include it.
      timezone: (club as { timezone?: string | null }).timezone ?? null,
    }));

    logger.info('LiveRC club search completed.', {
      event: 'liverc.clubs.search.success',
      outcome: 'success',
      matchCount: payload.length,
    });

    return buildJsonResponse(
      200,
      {
        data: { clubs: payload },
        requestId,
      },
      requestId,
    );
  } catch (error) {
    logger.error('Failed to search LiveRC clubs.', {
      event: 'liverc.clubs.search.error',
      outcome: 'error',
      error,
    });

    return buildJsonResponse(
      500,
      {
        error: {
          code: 'CLUB_SEARCH_FAILED',
          message: 'Unable to search clubs right now. Please try again shortly.',
        },
        requestId,
      },
      requestId,
    );
  }
}

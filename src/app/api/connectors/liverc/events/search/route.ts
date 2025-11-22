/**
 * Project: My Race Engineer
 * File: src/app/api/connectors/liverc/events/search/route.ts
 * Summary: API route that searches LiveRC club events for dashboard quick import lookup.
 */
// No React types in server routes by design.

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { NextRequest } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';
import { liveRcEventSearchService } from '@/dependencies/liverc';

const ROUTE_PATH = '/api/connectors/liverc/events/search';
const ALLOW_HEADER = 'OPTIONS, GET';

const baseHeaders = {
  'Cache-Control': 'no-store',
  Allow: ALLOW_HEADER,
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

const QuerySchema = z.object({
  clubId: z
    .string({ required_error: 'Club ID is required.' })
    .trim()
    .min(1, 'Club ID must not be empty.'),
  q: z
    .string({ required_error: 'Search query is required.' })
    .trim()
    .min(2, 'Search query must be at least 2 characters long.'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform((val) => Number.parseInt(val, 10))
    .pipe(z.number().int().min(1).max(25))
    .optional(),
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
    clubId: searchParams.get('clubId'),
    q: searchParams.get('q'),
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    limit: searchParams.get('limit'),
  });

  if (!parsed.success) {
    logger.warn('LiveRC event search request failed validation.', {
      event: 'liverc.events.search.invalid_request',
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

  const { clubId, q, startDate, endDate, limit } = parsed.data;

  try {
    const searchTerm = q.trim();

    const events = await liveRcEventSearchService.searchEvents(
      clubId,
      searchTerm,
      startDate,
      endDate,
      limit ?? 10,
    );

    const payload = events.map((event) => ({
      eventRef: event.eventRef,
      title: event.title,
      whenIso: event.whenIso,
      clubId: event.clubId,
      clubSubdomain: event.clubSubdomain,
    }));

    logger.info('LiveRC event search completed.', {
      event: 'liverc.events.search.success',
      outcome: 'success',
      clubId,
      matchCount: payload.length,
    });

    return buildJsonResponse(
      200,
      {
        data: { events: payload },
        requestId,
      },
      requestId,
    );
  } catch (error) {
    logger.error('Failed to search LiveRC events.', {
      event: 'liverc.events.search.error',
      outcome: 'error',
      clubId,
      error,
    });

    return buildJsonResponse(
      500,
      {
        error: {
          code: 'EVENT_SEARCH_FAILED',
          message: 'Unable to search events right now. Please try again shortly.',
        },
        requestId,
      },
      requestId,
    );
  }
}


/**
 * Project: My Race Engineer
 * File: src/app/api/connectors/liverc/discover/route.ts
 * Summary: API route that proxies LiveRC discovery requests and returns normalized responses.
 */
// No React types in server routes by design.

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { type NextRequest } from 'next/server';

import { liveRcDiscoveryService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';
import { LiveRcClientError } from '@core/app/connectors/liverc/client';

const ROUTE_PATH = '/api/connectors/liverc/discover';
const ALLOW_HEADER = 'OPTIONS, POST';

const baseHeaders = {
  'Cache-Control': 'no-store',
  Allow: ALLOW_HEADER,
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

// Canonical API contract: accept { clubId, startDate, endDate, limit? } per
// ADR-20251120-liverc-club-based-discovery to stay aligned with the club-based design.
// Any free-text track field support is legacy and should be removed in favour of clubId.
const MAX_RANGE_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const Body = z
  .object({
    clubId: z.string().trim().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    const start = parseDateOnly(value.startDate);
    const end = parseDateOnly(value.endDate);

    if (!start || !end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate and endDate must be valid YYYY-MM-DD dates',
      });
      return;
    }

    if (start.getTime() > end.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate must be <= endDate',
        path: ['startDate'],
      });
    }

    // Keep the inclusive range within the existing seven-day window guardrail so
    // LiveRC scraping remains bounded and predictable.
    const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / DAY_IN_MS) + 1;
    if (inclusiveDays > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Date range must not exceed ${MAX_RANGE_DAYS} days`,
        path: ['endDate'],
      });
    }
  });

// Parse YYYY-MM-DD into a UTC Date object; return null for invalid values so
// validation can emit a clear error.
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

const buildJsonResponse = (status: number, payload: unknown, requestId: string): Response =>
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

const formatUpstreamPath = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Preserve the original value when URL parsing fails so we do not hide
    // potentially useful diagnostics.
    return url;
  }
};

const normaliseEventRefWithBase = (eventRef: string, baseOrigin: string): string => {
  try {
    const url = new URL(eventRef, baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`);
    url.hash = '';
    url.search = '';
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}`;
  } catch {
    // Preserve the original reference when normalisation fails so callers still
    // receive a usable link instead of an empty string.
    return eventRef;
  }
};

const buildLiveRcErrorResponse = (error: LiveRcClientError, requestId: string) => {
  const upstreamStatus = error.status;
  const upstreamPath = formatUpstreamPath(error.url);

  const messageBase = (() => {
    if (error.code === 'MAX_RETRIES_EXCEEDED' || error.code === 'RETRYABLE_STATUS') {
      return 'LiveRC did not respond after multiple attempts. Please try again shortly.';
    }

    if (upstreamStatus) {
      const pathSuffix = upstreamPath ? ` for ${upstreamPath}` : '';
      return `LiveRC responded with status ${upstreamStatus}${pathSuffix}.`;
    }

    return 'Unable to discover LiveRC events for the requested criteria.';
  })();

  return {
    status: 502,
    payload: {
      error: {
        code: error.code ?? 'DISCOVERY_FAILED',
        message: messageBase,
        details: {
          upstreamStatus,
          upstreamPath,
        },
      },
      requestId,
    },
  } as const;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: baseHeaders,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = buildRequestLogger(requestId);

  let requestBody: unknown;
  try {
    const rawBody: unknown = await request.json();
    requestBody = rawBody;
  } catch (error) {
    logger.warn('LiveRC discovery request payload is not valid JSON.', {
      event: 'liverc.discovery.invalid_json',
      outcome: 'invalid-payload',
      error,
    });

    return buildJsonResponse(
      400,
      {
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
        requestId,
      },
      requestId,
    );
  }

  const parsed = Body.safeParse(requestBody);
  if (!parsed.success) {
    logger.warn('LiveRC discovery request failed validation.', {
      event: 'liverc.discovery.invalid_request',
      outcome: 'invalid-payload',
      details: { issues: parsed.error.issues },
    });

    return buildJsonResponse(
      400,
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'LiveRC discovery request payload is invalid.',
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

  try {
    const result = await liveRcDiscoveryService.discoverByClubAndDateRange(parsed.data);
    const events = result.events.map((event) => ({
      ...event,
      eventRef: normaliseEventRefWithBase(event.eventRef, result.clubBaseOrigin),
    }));

    logger.info('LiveRC discovery request succeeded.', {
      event: 'liverc.discovery.success',
      outcome: 'success',
      clubId: parsed.data.clubId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      matchCount: events.length,
    });

    return buildJsonResponse(
      200,
      {
        data: { events },
        requestId,
      },
      requestId,
    );
  } catch (error) {
    if (error instanceof LiveRcClientError) {
      // Preserve upstream status/path details to help operators distinguish between
      // LiveRC HTTP errors (e.g. 403/404) and transient availability issues.
      const { status, payload } = buildLiveRcErrorResponse(error, requestId);
      logger.error('LiveRC discovery request failed due to upstream error.', {
        event: 'liverc.discovery.failure',
        outcome: 'failure',
        upstreamStatus: error.status,
        upstreamPath: formatUpstreamPath(error.url),
        error,
      });

      return buildJsonResponse(status, payload, requestId);
    }

    logger.error('LiveRC discovery request failed.', {
      event: 'liverc.discovery.failure',
      outcome: 'failure',
      error,
    });

    return buildJsonResponse(
      502,
      {
        error: {
          code: 'DISCOVERY_FAILED',
          message: 'Unable to discover LiveRC events for the requested criteria.',
        },
        requestId,
      },
      requestId,
    );
  }
}

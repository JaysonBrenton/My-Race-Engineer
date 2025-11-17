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

const Body = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    track: z.string().trim().min(2),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'startDate must be <= endDate',
  })
  .refine(
    ({ startDate, endDate }) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return false;
      }

      const rangeDays = (end.getTime() - start.getTime()) / 86400000 + 1;
      return rangeDays <= 7;
    },
    {
      message: 'Date range must be 7 days or fewer',
    },
  );

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

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeRequestBody = (body: unknown): unknown => {
  if (!isJsonObject(body)) {
    return body;
  }

  if ('track' in body) {
    return body;
  }

  if ('trackOrClub' in body) {
    const { trackOrClub } = body;
    if (typeof trackOrClub === 'string') {
      return {
        ...body,
        track: trackOrClub,
      } satisfies Record<string, unknown>;
    }
  }

  return body;
};

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = buildRequestLogger(requestId);

  let requestBody: unknown;
  try {
    const rawBody: unknown = await request.json();
    requestBody = normalizeRequestBody(rawBody);
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
    const result = await liveRcDiscoveryService.discoverByDateRangeAndTrack(parsed.data);

    logger.info('LiveRC discovery request succeeded.', {
      event: 'liverc.discovery.success',
      outcome: 'success',
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      track: parsed.data.track,
      matchCount: result.events.length,
    });

    return buildJsonResponse(
      200,
      {
        data: { events: result.events },
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

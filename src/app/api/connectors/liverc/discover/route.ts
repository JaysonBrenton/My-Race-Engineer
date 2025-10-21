import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { liveRcDiscoveryService } from '@/dependencies/liverc';
import { applicationLogger } from '@/dependencies/logger';

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
  .refine(({ startDate, endDate }) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }

    const rangeDays = (end.getTime() - start.getTime()) / 86400000 + 1;
    return rangeDays <= 7;
  }, {
    message: 'Date range must be 7 days or fewer',
  });

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: baseHeaders,
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = buildRequestLogger(requestId);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
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

  const parsed = Body.safeParse(rawBody);
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

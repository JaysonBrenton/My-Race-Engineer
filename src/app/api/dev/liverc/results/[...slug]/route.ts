import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const proxyParamValues = new Set(['1', 'true', 'yes']);

const isValidPathSegment = (segment: string | undefined) =>
  typeof segment === 'string' && segment.trim().length > 0 && !segment.includes('/');

const ensureJsonFileName = (fileName: string) =>
  fileName.toLowerCase().endsWith('.json') ? fileName : `${fileName}.json`;

const isValidSlug = (slug: string[]) => {
  if (!Array.isArray(slug)) {
    return false;
  }

  if (slug.length === 3) {
    const [eventSlug, classSlug, fileName] = slug;
    return (
      isValidPathSegment(eventSlug) &&
      isValidPathSegment(classSlug) &&
      typeof fileName === 'string' &&
      ensureJsonFileName(fileName) === 'entry-list.json'
    );
  }

  if (slug.length === 4) {
    const [eventSlug, classSlug, roundSlug, fileName] = slug;
    return (
      isValidPathSegment(eventSlug) &&
      isValidPathSegment(classSlug) &&
      isValidPathSegment(roundSlug) &&
      typeof fileName === 'string' &&
      ensureJsonFileName(fileName).endsWith('.json') &&
      fileName.trim().length > 0
    );
  }

  return false;
};

const jsonResponse = (status: number, payload: unknown, requestId: string) =>
  NextResponse.json(payload, {
    status,
    headers: {
      ...baseHeaders,
      'x-request-id': requestId,
    },
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await params;
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/dev/liverc/results',
  });

  if (!isValidSlug(slug)) {
    logger.warn('LiveRC dev proxy received an invalid slug.', {
      event: 'liverc.dev.invalid_slug',
      outcome: 'invalid-request',
      slug,
    });

    return jsonResponse(
      400,
      {
        error: {
          code: 'INVALID_LIVERC_PATH',
          message: 'LiveRC proxy requires an event, class, and JSON resource path.',
          details: { slug },
        },
        requestId,
      },
      requestId,
    );
  }

  const url = new URL(request.url);
  const proxyParam = url.searchParams.get('proxy');

  if (!proxyParam || !proxyParamValues.has(proxyParam.toLowerCase())) {
    logger.warn('LiveRC dev proxy invoked without ?proxy=1 flag.', {
      event: 'liverc.dev.proxy_disabled',
      outcome: 'invalid-request',
      slug,
    });

    return jsonResponse(
      400,
      {
        error: {
          code: 'PROXY_DISABLED',
          message: 'LiveRC proxy requires ?proxy=1 in development.',
        },
        requestId,
      },
      requestId,
    );
  }

  const normalizedSlug = slug.map((segment, index) => {
    if (index === slug.length - 1 && typeof segment === 'string') {
      return ensureJsonFileName(segment);
    }

    return segment;
  });

  const upstreamUrl = `https://liverc.com/results/${normalizedSlug
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MyRaceEngineerDevProxy/1.0',
      },
      cache: 'no-store',
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.set('cache-control', baseHeaders['Cache-Control']);
    headers.set('x-robots-tag', baseHeaders['X-Robots-Tag']);
    headers.set('x-request-id', requestId);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers,
    });
  } catch (error) {
    logger.error('LiveRC dev proxy failed to fetch upstream resource.', {
      event: 'liverc.dev.proxy_failure',
      outcome: 'failure',
      slug,
      upstreamUrl,
      error,
    });

    return jsonResponse(
      502,
      {
        error: {
          code: 'LIVERC_PROXY_ERROR',
          message: 'Failed to proxy LiveRC response.',
        },
        requestId,
      },
      requestId,
    );
  }
}

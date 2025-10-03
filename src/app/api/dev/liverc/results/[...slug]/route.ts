import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const proxyParamValues = new Set(['1', 'true', 'yes']);

const isValidPathSegment = (segment: string | undefined) =>
  typeof segment === 'string' && segment.trim().length > 0 && !segment.includes('/');

const isValidSlug = (slug: string[]) => {
  if (!Array.isArray(slug)) {
    return false;
  }

  if (slug.length === 3) {
    const [eventSlug, classSlug, fileName] = slug;
    return (
      isValidPathSegment(eventSlug) &&
      isValidPathSegment(classSlug) &&
      fileName === 'entry-list.json'
    );
  }

  if (slug.length === 4) {
    const [eventSlug, classSlug, roundSlug, fileName] = slug;
    return (
      isValidPathSegment(eventSlug) &&
      isValidPathSegment(classSlug) &&
      isValidPathSegment(roundSlug) &&
      typeof fileName === 'string' &&
      fileName.endsWith('.json') &&
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

type RouteContext = {
  params: {
    slug?: string[];
  };
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const slug = context.params.slug ?? [];

  if (!isValidSlug(slug)) {
    console.warn('liverc.dev.invalid_slug', { requestId, slug });

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
    console.warn('liverc.dev.proxy_disabled', { requestId, slug });

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

  const upstreamUrl = `https://liverc.com/results/${slug
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
    console.error('liverc.dev.proxy_failure', { requestId, slug, error });

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

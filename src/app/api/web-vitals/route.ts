import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { applicationLogger } from '@/dependencies/logger';

type WebVitalsPayload = {
  id: string;
  name: string;
  label: string;
  value: number;
  page: string;
  timestamp: number;
};

type ValidationResult = { ok: true; payload: WebVitalsPayload } | { ok: false; errors: string[] };

const baseHeaders = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
} as const;

function validatePayload(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null) {
    return {
      ok: false,
      errors: ['Request body must be a JSON object.'],
    };
  }

  const errors: string[] = [];

  const { id, name, label, value, page, timestamp } = data as Record<string, unknown>;

  const isNonEmptyString = (input: unknown, field: string) => {
    if (typeof input !== 'string' || input.trim().length === 0) {
      errors.push(`${field} must be a non-empty string.`);
      return undefined;
    }

    return input.trim();
  };

  const isFiniteNumber = (input: unknown, field: string) => {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
      errors.push(`${field} must be a finite number.`);
      return undefined;
    }

    return input;
  };

  const sanitizedId = isNonEmptyString(id, 'id');
  const sanitizedName = isNonEmptyString(name, 'name');
  const sanitizedLabel = isNonEmptyString(label, 'label');
  const sanitizedPage = isNonEmptyString(page, 'page');
  const sanitizedValue = isFiniteNumber(value, 'value');
  const sanitizedTimestamp = isFiniteNumber(timestamp, 'timestamp');

  if (typeof sanitizedTimestamp === 'number' && sanitizedTimestamp <= 0) {
    errors.push('timestamp must be greater than zero.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      id: sanitizedId!,
      name: sanitizedName!,
      label: sanitizedLabel!,
      page: sanitizedPage!,
      value: sanitizedValue!,
      timestamp: sanitizedTimestamp!,
    },
  };
}

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/web-vitals',
  });
  let data: unknown;

  try {
    data = await request.json();
  } catch (error) {
    logger.warn('Failed to parse web-vitals request body.', {
      event: 'web-vitals.invalid_json',
      outcome: 'invalid-payload',
      error,
    });
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: { ...baseHeaders, 'x-request-id': requestId },
      },
    );
  }

  const validation = validatePayload(data);

  if (!validation.ok) {
    logger.warn('Web vitals payload failed validation.', {
      event: 'web-vitals.invalid_payload',
      outcome: 'invalid-payload',
      errors: validation.errors,
    });
    return NextResponse.json(
      { error: 'Invalid payload.', details: validation.errors },
      {
        status: 422,
        headers: { ...baseHeaders, 'x-request-id': requestId },
      },
    );
  }

  logger.info('Received web vitals measurement.', {
    event: 'web-vitals.received',
    outcome: 'success',
    id: validation.payload.id,
    name: validation.payload.name,
    value: validation.payload.value,
    page: validation.payload.page,
    label: validation.payload.label,
    timestamp: validation.payload.timestamp,
  });

  return new NextResponse(null, {
    status: 204,
    headers: { ...baseHeaders, 'x-request-id': requestId },
  });
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: {
      ...baseHeaders,
      Allow: 'POST',
    },
  });
}

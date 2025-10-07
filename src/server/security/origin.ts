import type { Logger } from '@core/app';

import { applicationLogger } from '@/dependencies/logger';

import { getAllowedOrigins } from '../runtime';

type HeaderGetter = Pick<Headers, 'get'>;

export type OriginValidationResult = 'ok' | 'missing' | 'mismatch';

const normalizeOriginValue = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
};

export const validateOrigin = (headers: HeaderGetter): OriginValidationResult => {
  const allowedOrigins = getAllowedOrigins();
  const originHeader = headers.get('origin')?.trim();

  if (originHeader) {
    const normalizedOrigin = normalizeOriginValue(originHeader);

    if (!normalizedOrigin) {
      return 'mismatch';
    }

    return allowedOrigins.includes(normalizedOrigin) ? 'ok' : 'mismatch';
  }

  const refererHeader = headers.get('referer')?.trim();

  if (!refererHeader) {
    return 'missing';
  }

  const normalizedReferer = normalizeOriginValue(refererHeader);

  if (!normalizedReferer) {
    return 'mismatch';
  }

  return allowedOrigins.includes(normalizedReferer) ? 'ok' : 'mismatch';
};

export const guardAuthPostOrigin = (
  headers: HeaderGetter,
  onFailure: () => never,
  options?: { logger?: Logger; route?: string },
): void => {
  const result = validateOrigin(headers);

  if (result === 'ok') {
    return;
  }

  const logger = options?.logger ?? applicationLogger;

  logger.warn('auth.post_origin_denied', {
    route: options?.route,
    reason: `origin_${result}`,
  });

  onFailure();
};

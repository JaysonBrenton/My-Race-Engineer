/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Adapt core origin guard logic for server actions with diagnostic logging.
 * License: MIT
 */

import type { Logger } from '@core/app';

import { applicationLogger } from '@/dependencies/logger';
import {
  effectiveRequestOrigin,
  guardAuthPostOrigin as evaluateAuthOrigin,
  parseAllowedOrigins,
} from '@/core/security/origin';

const SYNTHETIC_HEADER_KEYS = [
  'origin',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-for',
  'host',
  'referer',
] as const;

type HeaderGetter = Pick<Headers, 'get'>;

type GuardReason = 'mismatch' | 'missing' | 'invalid';

const shouldLogDiagnostics = () => process.env.NODE_ENV !== 'production';

const buildGuardRequest = (headers: HeaderGetter, route: string, allowed: string[]): Request => {
  const guardHeaders = new Headers();

  for (const key of SYNTHETIC_HEADER_KEYS) {
    const value = headers.get(key);
    if (value) {
      guardHeaders.set(key, value);
    }
  }

  const referer = guardHeaders.get('referer');
  const fallbackBase = allowed[0] ?? 'http://localhost:3001';
  const resolvedRoute = route.startsWith('/') ? route : `/${route}`;
  const guardUrl = referer?.startsWith('http')
    ? referer
    : new URL(resolvedRoute, fallbackBase).toString();

  return new Request(guardUrl, { headers: guardHeaders });
};

const logBlock = (
  logger: Logger,
  route: string,
  reason: GuardReason,
  request: Request,
  allowedOrigins: string[],
) => {
  if (!shouldLogDiagnostics()) {
    return;
  }

  logger.warn('auth.origin_guard.server_action_blocked', {
    route,
    reason,
    allowedOrigins,
    effectiveOrigin: effectiveRequestOrigin(request),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedFor: request.headers.get('x-forwarded-for'),
  });
};

export const guardAuthPostOrigin = (
  headers: HeaderGetter,
  onFailure: () => never,
  options?: { logger?: Logger; route?: string },
): void => {
  const route = options?.route ?? '/auth';
  const allowedOrigins = parseAllowedOrigins(process.env);
  const request = buildGuardRequest(headers, route, allowedOrigins);
  const result = evaluateAuthOrigin(request, allowedOrigins);

  if (result.ok) {
    return;
  }

  const logger = options?.logger ?? applicationLogger;
  logBlock(logger, route, result.reason, request, allowedOrigins);

  onFailure();
};

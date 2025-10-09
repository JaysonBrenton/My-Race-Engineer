/**
 * Filename: src/server/security/origin.ts
 * Purpose: Adapt origin evaluation for server actions and emit diagnostic logs on failures.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import type { Logger } from '@core/app';

import { applicationLogger } from '@/dependencies/logger';
import {
  evaluateOriginHeader,
  effectiveRequestOrigin,
  parseAllowedOrigins,
  type OriginEvaluation,
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

type GuardOptions = {
  logger?: Logger;
  route?: string;
};

type GuardReason = Extract<
  OriginEvaluation['reason'],
  'origin-not-allowed' | 'invalid-origin-header'
>;

const shouldLogDiagnostics = () => process.env.NODE_ENV !== 'production';

const buildSyntheticRequest = (
  headers: HeaderGetter,
  route: string,
  allowedOrigins: string[],
): Request => {
  const guardHeaders = new Headers();

  for (const key of SYNTHETIC_HEADER_KEYS) {
    const value = headers.get(key);
    if (value) {
      guardHeaders.set(key, value);
    }
  }

  const referer = guardHeaders.get('referer');
  const fallbackBase = allowedOrigins[0] ?? 'http://localhost:3001';
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
  decision: OriginEvaluation,
) => {
  if (!shouldLogDiagnostics()) {
    return;
  }

  logger.warn('auth.origin_guard.server_action_blocked', {
    route,
    reason,
    allowedOrigins,
    origin: decision.origin,
    effectiveOrigin: effectiveRequestOrigin(request),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedFor: request.headers.get('x-forwarded-for'),
  });
};

export const guardAuthPostOrigin = (
  headers: HeaderGetter,
  onFailure: () => never,
  options?: GuardOptions,
): void => {
  const route = options?.route ?? '/auth';
  const allowedOrigins = parseAllowedOrigins(process.env);
  const decision = evaluateOriginHeader(headers.get('origin'), allowedOrigins);

  if (decision.allowed) {
    return;
  }

  const logger = options?.logger ?? applicationLogger;
  const requestForLog = buildSyntheticRequest(headers, route, allowedOrigins);
  const reason: GuardReason =
    decision.reason === 'invalid-origin-header' ? 'invalid-origin-header' : 'origin-not-allowed';

  logBlock(logger, route, reason, requestForLog, allowedOrigins, decision);

  onFailure();
};

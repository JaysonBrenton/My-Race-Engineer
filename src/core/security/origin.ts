/**
 * Filename: src/core/security/origin.ts
 * Purpose: Normalise origin values and evaluate authentication requests against the allow list.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import type { Logger } from '@core/app';

const TRAILING_SLASH_REGEX = /\/+$/;
const LOCAL_DEV_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://10.211.55.13:3001',
];

type OriginLogger = Pick<Logger, 'debug' | 'warn'>;

type OriginSource = 'ALLOWED_ORIGINS' | 'APP_URL' | 'DEV_DEFAULT';

type TryAddOriginOptions = {
  logger?: OriginLogger;
  source: OriginSource;
};

type ParseAllowedOriginsOptions = {
  logger?: OriginLogger;
};

type EvaluateOriginHeaderOptions = {
  logger?: OriginLogger;
  route?: string;
};

type GuardAuthPostOriginOptions = {
  logger?: OriginLogger;
  route?: string;
};

const firstHeaderValue = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const [first] = value.split(',');
  return first?.trim() ?? null;
};

export const normalizeOrigin = (input: string): string => {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('Origin cannot be empty.');
  }

  const withoutSlash = trimmed.replace(TRAILING_SLASH_REGEX, '');
  const parsed = new URL(withoutSlash);

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : '';

  return `${protocol}//${hostname}${port}`;
};

type AllowedOriginsEnv = {
  APP_URL?: string | undefined;
  ALLOWED_ORIGINS?: string | undefined;
  DEV_TRUST_LOCAL_ORIGINS?: string | undefined;
  [key: string]: string | undefined;
};

const tryAddOrigin = (
  candidate: string | undefined,
  accumulator: Map<string, true>,
  options: TryAddOriginOptions,
) => {
  const { logger, source } = options;

  if (!candidate) {
    if (source !== 'ALLOWED_ORIGINS') {
      logger?.warn('security.origin.missing_candidate', { source });
    }
    return;
  }

  try {
    const normalized = normalizeOrigin(candidate);
    const alreadyPresent = accumulator.has(normalized);
    accumulator.set(normalized, true);

    if (alreadyPresent) {
      logger?.debug('security.origin.duplicate_allowed_origin', {
        origin: normalized,
        source,
      });
      return;
    }

    logger?.debug('security.origin.allowed_origin_added', {
      origin: normalized,
      source,
    });
  } catch (error) {
    logger?.warn('security.origin.invalid_candidate', {
      source,
      candidate,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const parseAllowedOrigins = (
  env: AllowedOriginsEnv,
  options: ParseAllowedOriginsOptions = {},
): string[] => {
  const { logger } = options;
  const allowed = new Map<string, true>();

  if (env.ALLOWED_ORIGINS) {
    env.ALLOWED_ORIGINS.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .forEach((entry) => {
        tryAddOrigin(entry, allowed, { logger, source: 'ALLOWED_ORIGINS' });
      });
  }

  if (allowed.size === 0) {
    tryAddOrigin(env.APP_URL, allowed, { logger, source: 'APP_URL' });
  }

  if (env.DEV_TRUST_LOCAL_ORIGINS === 'true') {
    for (const origin of LOCAL_DEV_ORIGINS) {
      tryAddOrigin(origin, allowed, { logger, source: 'DEV_DEFAULT' });
    }
  }

  const origins = Array.from(allowed.keys());
  logger?.debug('security.origin.allowed_origins_finalised', {
    origins,
  });

  return origins;
};

export type OriginEvaluationReason =
  | 'allowed'
  | 'no-origin-header'
  | 'invalid-origin-header'
  | 'origin-not-allowed';

export type OriginEvaluation = {
  allowed: boolean;
  origin?: string;
  reason: OriginEvaluationReason;
};

export const evaluateOriginHeader = (
  originHeader: string | null | undefined,
  allowedOrigins: readonly string[],
  options: EvaluateOriginHeaderOptions = {},
): OriginEvaluation => {
  const { logger, route } = options;

  if (!originHeader) {
    logger?.debug('security.origin.no_origin_header', {
      route,
    });
    return { allowed: true, reason: 'no-origin-header' };
  }

  try {
    const normalized = normalizeOrigin(originHeader);
    if (allowedOrigins.includes(normalized)) {
      logger?.debug('security.origin.origin_allowed', {
        route,
        origin: normalized,
      });
      return { allowed: true, origin: normalized, reason: 'allowed' };
    }

    logger?.warn('security.origin.origin_not_allowed', {
      route,
      origin: normalized,
      allowedOrigins,
    });
    return { allowed: false, origin: normalized, reason: 'origin-not-allowed' };
  } catch (error) {
    logger?.warn('security.origin.invalid_origin_header', {
      route,
      header: originHeader,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: false, reason: 'invalid-origin-header' };
  }
};

export const effectiveRequestOrigin = (req: Request): string | null => {
  const originHeader = req.headers.get('origin');

  if (originHeader) {
    try {
      return normalizeOrigin(originHeader);
    } catch {
      return null;
    }
  }

  const forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const forwardedHost = firstHeaderValue(req.headers.get('x-forwarded-host'));

  if (forwardedProto && forwardedHost) {
    try {
      return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
    } catch {
      // Fall through to host header handling.
    }
  }

  const host = firstHeaderValue(req.headers.get('host'));
  if (host) {
    try {
      const url = new URL(req.url);
      const protocol = url.protocol || 'https:';
      return normalizeOrigin(`${protocol}//${host}`);
    } catch {
      return null;
    }
  }

  return null;
};

export type GuardAuthPostOriginResult =
  | { ok: true; decision: OriginEvaluation }
  | { ok: false; redirectTo: string; reason: 'mismatch' | 'invalid' };

export const guardAuthPostOrigin = (
  req: Request,
  allowedOrigins: string[],
  options: GuardAuthPostOriginOptions = {},
): GuardAuthPostOriginResult => {
  const { logger, route } = options;
  const decision = evaluateOriginHeader(req.headers.get('origin'), allowedOrigins, {
    logger,
    route,
  });

  if (decision.allowed) {
    logger?.debug('security.origin.guard_request_allowed', {
      route,
      reason: decision.reason,
      origin: decision.origin ?? null,
    });
    return { ok: true, decision };
  }

  const redirectUrl = new URL(req.url);
  redirectUrl.searchParams.set('error', 'invalid-origin');

  logger?.warn('security.origin.guard_request_blocked', {
    route,
    reason: decision.reason,
    origin: decision.origin ?? null,
  });

  if (decision.reason === 'invalid-origin-header') {
    return { ok: false, redirectTo: redirectUrl.toString(), reason: 'invalid' };
  }

  return { ok: false, redirectTo: redirectUrl.toString(), reason: 'mismatch' };
};

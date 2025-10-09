/**
 * Filename: src/core/security/origin.ts
 * Purpose: Normalise origin values and evaluate authentication requests against the allow list.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

const TRAILING_SLASH_REGEX = /\/+$/;
const LOCAL_DEV_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://10.211.55.13:3001',
];

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

const tryAddOrigin = (candidate: string | undefined, accumulator: Map<string, true>) => {
  if (!candidate) {
    return;
  }

  try {
    const normalized = normalizeOrigin(candidate);
    accumulator.set(normalized, true);
  } catch {
    // Ignore malformed origins; the guard will surface configuration issues via redirects/logs.
  }
};

export const parseAllowedOrigins = (env: AllowedOriginsEnv): string[] => {
  const allowed = new Map<string, true>();

  if (env.ALLOWED_ORIGINS) {
    env.ALLOWED_ORIGINS.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .forEach((entry) => {
        tryAddOrigin(entry, allowed);
      });
  }

  if (allowed.size === 0) {
    tryAddOrigin(env.APP_URL, allowed);
  }

  if (env.DEV_TRUST_LOCAL_ORIGINS === 'true') {
    for (const origin of LOCAL_DEV_ORIGINS) {
      if (!allowed.has(origin)) {
        allowed.set(origin, true);
      }
    }
  }

  return Array.from(allowed.keys());
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
): OriginEvaluation => {
  if (!originHeader) {
    return { allowed: true, reason: 'no-origin-header' };
  }

  try {
    const normalized = normalizeOrigin(originHeader);
    if (allowedOrigins.includes(normalized)) {
      return { allowed: true, origin: normalized, reason: 'allowed' };
    }

    return { allowed: false, origin: normalized, reason: 'origin-not-allowed' };
  } catch {
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
): GuardAuthPostOriginResult => {
  const decision = evaluateOriginHeader(req.headers.get('origin'), allowedOrigins);

  if (decision.allowed) {
    return { ok: true, decision };
  }

  const redirectUrl = new URL(req.url);
  redirectUrl.searchParams.set('error', 'invalid-origin');

  if (decision.reason === 'invalid-origin-header') {
    return { ok: false, redirectTo: redirectUrl.toString(), reason: 'invalid' };
  }

  return { ok: false, redirectTo: redirectUrl.toString(), reason: 'mismatch' };
};

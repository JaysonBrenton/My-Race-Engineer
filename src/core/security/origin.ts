/**
 * Author: Jayson Brenton
 * Date: 2025-03-12
 * Purpose: Provide origin normalisation and guard utilities for auth requests.
 * License: MIT
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

const safeNormalize = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    return normalizeOrigin(value);
  } catch {
    return null;
  }
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

export const parseAllowedOrigins = (env: AllowedOriginsEnv): string[] => {
  const allowed = new Map<string, true>();

  if (env.ALLOWED_ORIGINS) {
    env.ALLOWED_ORIGINS.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .forEach((entry) => {
        try {
          allowed.set(normalizeOrigin(entry), true);
        } catch {
          // Ignore malformed entries so valid origins still take effect.
        }
      });
  }

  if (allowed.size === 0 && env.APP_URL) {
    try {
      allowed.set(normalizeOrigin(env.APP_URL), true);
    } catch {
      // Ignore invalid APP_URL so misconfiguration surfaces via guard failure.
    }
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

export const effectiveRequestOrigin = (req: Request): string | null => {
  const originHeader = req.headers.get('origin');
  const normalizedOrigin = safeNormalize(originHeader);

  if (originHeader) {
    return normalizedOrigin;
  }

  const forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const forwardedHost = firstHeaderValue(req.headers.get('x-forwarded-host'));

  if (forwardedProto && forwardedHost) {
    const fromForwarded = safeNormalize(`${forwardedProto}://${forwardedHost}`);
    if (fromForwarded) {
      return fromForwarded;
    }
  }

  const host = firstHeaderValue(req.headers.get('host'));
  if (host) {
    const url = new URL(req.url);
    const protocol = url.protocol || 'https:';
    return safeNormalize(`${protocol}//${host}`);
  }

  return null;
};

export type GuardAuthPostOriginResult =
  | { ok: true }
  | { ok: false; redirectTo: string; reason: 'mismatch' | 'missing' | 'invalid' };

export const guardAuthPostOrigin = (
  req: Request,
  allowedOrigins: string[],
): GuardAuthPostOriginResult => {
  const allowed = new Set(allowedOrigins);
  const redirectUrl = new URL(req.url);
  redirectUrl.searchParams.set('error', 'invalid-origin');

  const originHeader = req.headers.get('origin');
  if (originHeader) {
    try {
      const normalized = normalizeOrigin(originHeader);
      if (allowed.has(normalized)) {
        return { ok: true };
      }
      return { ok: false, redirectTo: redirectUrl.toString(), reason: 'mismatch' };
    } catch {
      return { ok: false, redirectTo: redirectUrl.toString(), reason: 'invalid' };
    }
  }

  const fallbackRequest = originHeader
    ? new Request(req.url, {
        headers: (() => {
          const headers = new Headers(req.headers);
          headers.delete('origin');
          return headers;
        })(),
      })
    : req;

  const derivedOrigin = effectiveRequestOrigin(fallbackRequest);
  if (!derivedOrigin) {
    return { ok: false, redirectTo: redirectUrl.toString(), reason: 'missing' };
  }

  if (!allowed.has(derivedOrigin)) {
    return { ok: false, redirectTo: redirectUrl.toString(), reason: 'mismatch' };
  }

  return { ok: true };
};

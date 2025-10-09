/**
 * Filename: src/server/runtime.ts
 * Purpose: Provide server-side runtime helpers for URL parsing and cookie security flags.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

export const getAppUrl = (): URL => {
  const raw = process.env.APP_URL?.trim();

  if (!raw) {
    throw new Error('APP_URL is not configured');
  }

  try {
    return new URL(raw);
  } catch {
    throw new Error('APP_URL is invalid');
  }
};

export const isCookieSecure = (): boolean => {
  // Session cookies must ship with the `Secure` attribute in production to prevent
  // browsers from sending them over plaintext HTTP.  During local development we
  // intentionally disable the flag because most setups run over http://localhost,
  // and modern browsers silently drop cookies marked `Secure` on non-HTTPS origins.
  return process.env.NODE_ENV === 'production';
};

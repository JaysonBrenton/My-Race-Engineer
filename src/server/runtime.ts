/**
 * Filename: src/server/runtime.ts
 * Purpose: Provide server-side runtime helpers for URL parsing.
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

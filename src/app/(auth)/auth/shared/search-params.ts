/**
 * Shared utilities for working with Next.js search parameters on auth routes.
 * These helpers centralise common logic such as normalising repeated params and
 * safely parsing JSON blobs used for form prefills.
 */

export type SearchParamValue = string | string[] | undefined;

export type SearchParams = Record<string, SearchParamValue>;

/**
 * Return the first string value from a search parameter. Next.js may supply
 * values as arrays when query keys are repeated, so we normalise to a single
 * string to keep UI logic deterministic.
 */
export function firstParamValue(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
}

/**
 * Parse a JSON blob and ensure the result is an object we can safely inspect.
 * Invalid JSON or non-object values return `null` so callers can fall back to
 * defaults without throwing.
 */
export function safeParseJsonRecord(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Convenience helper to coerce a value to a trimmed string. Non-string inputs
 * result in `undefined` so that callers can fall back to server-provided
 * defaults without leaking implementation details into the UI.
 */
export function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

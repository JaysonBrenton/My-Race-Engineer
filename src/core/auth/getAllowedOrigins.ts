const normalizeTrailingSlash = (value: string): string => {
  let normalized = value;

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const normalizeOrigin = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    const trimmed = normalizeTrailingSlash(value.trim());
    if (!trimmed) {
      return null;
    }

    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
};

export const getAllowedOrigins = (): Set<string> => {
  const allowed = new Set<string>();

  const raw = process.env.ALLOWED_ORIGINS;
  if (raw) {
    raw
      .split(',')
      .map((entry) => normalizeOrigin(entry))
      .filter((origin): origin is string => Boolean(origin))
      .forEach((origin) => allowed.add(origin));
  }

  if (allowed.size === 0) {
    const fallback = normalizeOrigin(process.env.APP_URL);
    if (fallback) {
      allowed.add(fallback);
    }
  }

  return allowed;
};

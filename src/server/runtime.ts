const normalizeTrailingSlash = (value: string) => {
  let normalized = value;

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

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
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }

  return getAppUrl().protocol === 'https:';
};

const normalizeOrigin = (value: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const origin = new URL(normalizeTrailingSlash(value)).origin.toLowerCase();
    return origin;
  } catch {
    return null;
  }
};

export const getAllowedOrigins = (): string[] => {
  const raw = process.env.ALLOWED_ORIGINS;

  const configuredOrigins = raw
    ?.split(',')
    .map((value) => normalizeOrigin(value.trim()))
    .filter((origin): origin is string => Boolean(origin));

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  const fallbackAppUrl = process.env.APP_URL?.trim();
  const fallbackOrigin = normalizeOrigin(fallbackAppUrl ?? '');

  return fallbackOrigin ? [fallbackOrigin] : [];
};

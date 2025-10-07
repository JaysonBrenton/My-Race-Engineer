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

export const getAllowedOrigins = (): string[] => {
  const raw = process.env.ALLOWED_ORIGINS;

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeTrailingSlash(value).toLowerCase())
    .filter(Boolean);
};

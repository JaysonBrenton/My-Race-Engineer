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

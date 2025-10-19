export const ensureError = (value: unknown, fallbackMessage = 'Unknown error'): Error => {
  if (value instanceof Error) {
    return value;
  }

  if (value && typeof value === 'object' && 'message' in (value as Record<string, unknown>)) {
    const message = (value as { message?: unknown }).message;
    return new Error(typeof message === 'string' ? message : fallbackMessage);
  }

  return new Error(typeof value === 'string' ? value : fallbackMessage);
};

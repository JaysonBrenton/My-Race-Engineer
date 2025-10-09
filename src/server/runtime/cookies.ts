import { headers } from 'next/headers';

export type CookieSecureStrategy = 'auto' | 'always' | 'never';

export function computeCookieSecure(opts?: {
  strategy?: CookieSecureStrategy;
  trustProxy?: boolean;
  appUrl?: string | null;
  forwardedProto?: string | null;
}): boolean {
  const strategy = opts?.strategy ?? 'auto';
  if (strategy === 'always') {
    return true;
  }

  if (strategy === 'never') {
    return false;
  }

  const trustProxy = opts?.trustProxy ?? false;
  const xf =
    (opts?.forwardedProto ?? (trustProxy ? headers().get('x-forwarded-proto') : null)) || '';
  const first = xf.split(',')[0]?.trim().toLowerCase();
  if (first === 'https') {
    return true;
  }

  const appUrl = (opts?.appUrl ?? process.env.APP_URL ?? '').trim();
  try {
    if (appUrl) {
      return new URL(appUrl).protocol === 'https:';
    }
  } catch {}

  return false;
}

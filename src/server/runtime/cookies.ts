import { headers } from 'next/headers';

export type CookieSecureStrategy = 'auto' | 'always' | 'never';

export async function computeCookieSecure(opts?: {
  strategy?: CookieSecureStrategy;
  trustProxy?: boolean;
  appUrl?: string | null;
  forwardedProto?: string | null;
}): Promise<boolean> {
  const strategy = opts?.strategy ?? 'auto';
  if (strategy === 'always') {
    return true;
  }

  if (strategy === 'never') {
    return false;
  }

  const trustProxy = opts?.trustProxy ?? false;
  let forwardedProto = opts?.forwardedProto ?? null;

  if (!forwardedProto && trustProxy) {
    const headerSnapshot = await headers();
    forwardedProto = headerSnapshot.get('x-forwarded-proto');
  }

  const xf = (forwardedProto ?? '') || '';
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

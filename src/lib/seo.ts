const resolveDefaultAppUrl = () => {
  const port = process.env.PORT?.trim() || '3001';
  return `http://localhost:${port}`;
};

let cachedAppUrl: URL | null = null;

const normalizeUrl = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value);

const computeAppUrl = () => {
  const preferred = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (preferred && preferred.length > 0) {
    return new URL(normalizeUrl(preferred));
  }

  const raw = process.env.APP_URL?.trim();
  if (raw && raw.length > 0) {
    return new URL(normalizeUrl(raw));
  }

  const legacyPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (legacyPublic && legacyPublic.length > 0) {
    return new URL(normalizeUrl(legacyPublic));
  }

  const fallback = resolveDefaultAppUrl();

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `APP_URL environment variable is missing. Falling back to ${fallback}. Set APP_URL or NEXT_PUBLIC_BASE_URL to the canonical origin to silence this warning.`,
    );
  }

  return new URL(normalizeUrl(fallback));
};

export function getAppUrl(): URL {
  if (!cachedAppUrl) {
    cachedAppUrl = computeAppUrl();
  }

  return cachedAppUrl;
}

export function absUrl(pathname: string | URL): string {
  if (pathname instanceof URL) {
    return pathname.toString();
  }

  const base = getAppUrl();
  if (!pathname || pathname === '/') {
    return base.toString();
  }

  const candidate = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(candidate, base).toString();
}

export function canonicalFor(pathname?: string | URL): string {
  if (!pathname) {
    return absUrl('/');
  }
  return absUrl(pathname);
}

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absUrl(item.path),
    })),
  } as const;
}

export function buildOrganizationJsonLd(params: {
  name: string;
  url: string;
  logoUrl?: string;
  sameAs?: string[];
}) {
  const { name, url, logoUrl, sameAs } = params;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    ...(logoUrl ? { logo: logoUrl } : {}),
    ...(sameAs && sameAs.length > 0 ? { sameAs } : {}),
  } as const;
}

export function buildWebsiteJsonLd(params: { name: string; url: string; searchUrl?: string }) {
  const { name, url, searchUrl } = params;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url,
    ...(searchUrl
      ? {
          potentialAction: {
            '@type': 'SearchAction',
            target: `${searchUrl}{search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }
      : {}),
  } as const;
}

export function buildSiteNavigationJsonLd(items: BreadcrumbItem[]) {
  return items.map((item) => ({
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: item.name,
    url: absUrl(item.path),
  }));
}

export function __resetAppUrlCacheForTests() {
  cachedAppUrl = null;
}

const appUrlCache = (() => {
  const value = process.env.APP_URL?.trim();
  if (!value) {
    throw new Error('APP_URL environment variable must be defined to generate absolute URLs.');
  }
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  return new URL(normalized);
})();

export function getAppUrl(): URL {
  return new URL(appUrlCache.toString());
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

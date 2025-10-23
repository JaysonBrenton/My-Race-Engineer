export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  Deprecation: 'true',
  Sunset: '2025-06-30',
  Link: '</dashboard>; rel="alternate"',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, Allow: 'OPTIONS' } });
}

export function POST() {
  const body = {
    error: {
      code: 'GONE',
      message: 'This importer is retired. Use the connector-based flow from the dashboard.',
      docs: '/docs/importer-retired',
    },
  };
  return new Response(JSON.stringify(body), { status: 410, headers });
}

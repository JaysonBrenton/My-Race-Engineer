import { NextResponse } from 'next/server';

import { absUrl } from '@/lib/seo';

const DISALLOWED_PATHS = [
  '/admin',
  '/auth',
  '/dashboard',
  '/settings',
  '/api/internal',
  '/api/web-vitals',
];

export function GET() {
  const lines = [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    `Sitemap: ${absUrl('/sitemap.xml')}`,
  ];

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

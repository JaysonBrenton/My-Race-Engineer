import { NextResponse } from 'next/server';

type WebVitalsPayload = {
  id: string;
  name: string;
  label: string;
  value: number;
  page: string;
  timestamp: number;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as WebVitalsPayload;

  console.info('web-vitals', {
    id: payload.id,
    name: payload.name,
    value: payload.value,
    page: payload.page,
    label: payload.label,
    timestamp: payload.timestamp,
  });

  return new NextResponse(null, {
    status: 204,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: {
      Allow: 'POST',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

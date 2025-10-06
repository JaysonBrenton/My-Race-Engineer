import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import packageInfo from '../../../../package.json';
import { applicationLogger } from '@/dependencies/logger';

export const dynamic = 'force-dynamic';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

type VersionPayload = {
  name: string;
  version: string;
  commitSha?: string;
  buildTime?: string;
};

const versionPayload: VersionPayload = {
  name: packageInfo.name,
  version: packageInfo.version,
};

if (process.env.VERCEL_GIT_COMMIT_SHA) {
  versionPayload.commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
} else if (process.env.COMMIT_SHA) {
  versionPayload.commitSha = process.env.COMMIT_SHA;
}

if (process.env.BUILD_TIMESTAMP) {
  versionPayload.buildTime = process.env.BUILD_TIMESTAMP;
} else if (process.env.BUILD_TIME) {
  versionPayload.buildTime = process.env.BUILD_TIME;
}

export function GET(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/version',
  });

  const payload = {
    status: 'ok' as const,
    requestId,
    timestamp: new Date().toISOString(),
    version: versionPayload,
  };

  logger.info('Version endpoint served.', {
    event: 'version.ok',
    outcome: 'success',
    version: versionPayload.version,
    commitSha: versionPayload.commitSha,
  });

  return NextResponse.json(payload, {
    status: 200,
    headers: { ...baseHeaders, 'x-request-id': requestId },
  });
}

export function POST() {
  return methodNotAllowedResponse();
}

export function PUT() {
  return methodNotAllowedResponse();
}

export function PATCH() {
  return methodNotAllowedResponse();
}

export function DELETE() {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse() {
  return new NextResponse(null, {
    status: 405,
    headers: {
      ...baseHeaders,
      Allow: 'GET',
    },
  });
}

import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import type { Logger } from '@core/app';
import { applicationLogger } from '@/dependencies/logger';
import { getPrismaClient, isPrismaClientInitializationError } from '@core/infra';

export const dynamic = 'force-dynamic';

const MIGRATIONS_DIRECTORY = join(process.cwd(), 'prisma', 'migrations');

const baseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

type CheckStatus = 'ok' | 'error';

type DatabaseCheck = {
  status: CheckStatus;
  details?: string;
};

type MigrationCheck = {
  status: CheckStatus;
  pending: string[];
  details?: string;
};

type ReadinessChecks = {
  database: DatabaseCheck;
  migrations: MigrationCheck;
};

type ReadinessEvaluation = {
  ok: boolean;
  checks: ReadinessChecks;
};

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/ready',
  });

  const evaluation = await evaluateReadiness(logger);

  if (!evaluation.ok) {
    logger.error('Readiness check failed.', {
      event: 'readiness.failed',
      outcome: 'unhealthy',
      checks: evaluation.checks,
    });

    return NextResponse.json(
      {
        status: 'error' as const,
        requestId,
        timestamp: new Date().toISOString(),
        checks: evaluation.checks,
      },
      {
        status: 503,
        headers: { ...baseHeaders, 'x-request-id': requestId },
      },
    );
  }

  logger.info('Readiness check succeeded.', {
    event: 'readiness.ok',
    outcome: 'healthy',
    checks: evaluation.checks,
  });

  return NextResponse.json(
    {
      status: 'ok' as const,
      requestId,
      timestamp: new Date().toISOString(),
      checks: evaluation.checks,
    },
    {
      status: 200,
      headers: { ...baseHeaders, 'x-request-id': requestId },
    },
  );
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

async function evaluateReadiness(logger: Logger): Promise<ReadinessEvaluation> {
  const checks: ReadinessChecks = {
    database: { status: 'ok' },
    migrations: { status: 'ok', pending: [] },
  };

  const checkMigrations = (process.env.READY_CHECK_MIGRATIONS ?? 'true') !== 'false';

  if (!process.env.DATABASE_URL) {
    checks.database = {
      status: 'error',
      details: 'DATABASE_URL environment variable is not configured.',
    };
    return { ok: false, checks };
  }

  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    checks.database = {
      status: 'error',
      details: isPrismaClientInitializationError(error)
        ? 'Failed to initialise Prisma client.'
        : 'Database connectivity check failed.',
    };

    logger.error('Database connectivity check failed.', {
      event: 'readiness.database_unavailable',
      outcome: 'unhealthy',
      error,
    });

    return { ok: false, checks };
  }

  if (!checkMigrations) {
    return { ok: true, checks };
  }

  let expectedMigrations: string[] = [];
  try {
    const entries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
    expectedMigrations = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      checks.migrations = {
        status: 'error',
        pending: [],
        details: 'Failed to read migrations directory.',
      };

      logger.error('Unable to read migrations directory.', {
        event: 'readiness.migrations_directory_unavailable',
        outcome: 'unhealthy',
        error,
      });

      return { ok: false, checks };
    }
  }

  if (expectedMigrations.length === 0) {
    return { ok: true, checks };
  }

  try {
    const prisma = getPrismaClient();

    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = '_prisma_migrations'
      ) AS exists
    `;

    if (!tableExists[0]?.exists) {
      checks.migrations = {
        status: 'error',
        pending: expectedMigrations,
        details: 'Migrations table is missing.',
      };

      logger.error('Prisma migrations table is missing.', {
        event: 'readiness.migrations_table_missing',
        outcome: 'unhealthy',
      });

      return { ok: false, checks };
    }

    const appliedMigrations = await prisma.$queryRaw<
      Array<{ migration_name: string | null; finished_at: Date | null }>
    >`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY finished_at DESC NULLS LAST, started_at DESC NULLS LAST
    `;

    const finishedMigrations = new Set(
      appliedMigrations
        .filter((migration) => migration.finished_at !== null && migration.migration_name)
        .map((migration) => migration.migration_name as string),
    );

    const inProgressMigrations = appliedMigrations
      .filter((migration) => migration.finished_at === null && migration.migration_name)
      .map((migration) => migration.migration_name as string);

    const pendingMigrations = expectedMigrations.filter(
      (migration) => !finishedMigrations.has(migration),
    );

    const outstandingMigrations = [...new Set([...pendingMigrations, ...inProgressMigrations])];

    if (outstandingMigrations.length > 0) {
      checks.migrations = {
        status: 'error',
        pending: outstandingMigrations,
        details: 'Pending migrations detected.',
      };

      logger.error('Pending migrations detected.', {
        event: 'readiness.migrations_pending',
        outcome: 'unhealthy',
        pendingMigrations: outstandingMigrations,
      });

      return { ok: false, checks };
    }
  } catch (error) {
    checks.migrations = {
      status: 'error',
      pending: [],
      details: 'Unable to verify applied migrations.',
    };

    logger.error('Failed to query Prisma migrations table.', {
      event: 'readiness.migrations_query_failed',
      outcome: 'unhealthy',
      error,
    });

    return { ok: false, checks };
  }

  return { ok: true, checks };
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

import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import type { Logger } from '@core/app';
import { applicationLogger } from '@/dependencies/logger';
import { evaluateProcessEnvironment, type EnvDoctorOutcome } from '@/server/config/env-status';
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

type EnvHint = {
  status: 'ok' | 'warn';
  missingKeys: string[];
  message: string;
};

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const logger = applicationLogger.withContext({
    requestId,
    route: '/api/ready',
  });

  const envReportPromise = evaluateProcessEnvironment();
  const evaluation = await evaluateReadiness(logger);
  const envHint = buildEnvHint(await envReportPromise);

  if (!evaluation.ok) {
    logger.error('Readiness check failed.', {
      event: 'readiness.failed',
      outcome: 'unhealthy',
      checks: evaluation.checks,
      env: envHint,
    });

    return NextResponse.json(
      {
        status: 'error' as const,
        requestId,
        timestamp: new Date().toISOString(),
        checks: evaluation.checks,
        env: envHint,
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
    env: envHint,
  });

  return NextResponse.json(
    {
      status: 'ok' as const,
      requestId,
      timestamp: new Date().toISOString(),
      checks: evaluation.checks,
      env: envHint,
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
      Array<{
        migration_name: string | null;
        finished_at: Date | null;
        rolled_back_at: Date | null;
        started_at: Date | null;
      }>
    >`
      SELECT migration_name, finished_at, rolled_back_at, started_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC NULLS LAST, finished_at DESC NULLS LAST
    `;

    const normalizeMigrationName = (migration: string) => migration.trim();

    const migrationStatuses = new Map<string, 'applied' | 'in_progress' | 'rolled_back'>();

    for (const migration of appliedMigrations) {
      if (!migration.migration_name) {
        continue;
      }

      const name = normalizeMigrationName(migration.migration_name);

      if (migrationStatuses.has(name)) {
        continue;
      }

      if (migration.rolled_back_at !== null) {
        migrationStatuses.set(name, 'rolled_back');
        continue;
      }

      if (migration.finished_at !== null) {
        migrationStatuses.set(name, 'applied');
        continue;
      }

      migrationStatuses.set(name, 'in_progress');
    }

    const normalizedExpectedMigrations = expectedMigrations.map((migration) =>
      normalizeMigrationName(migration),
    );

    const pendingMigrations = normalizedExpectedMigrations.filter((migration) => {
      const status = migrationStatuses.get(migration);
      return !status || status === 'rolled_back';
    });

    const inProgressMigrations = normalizedExpectedMigrations.filter(
      (migration) => migrationStatuses.get(migration) === 'in_progress',
    );

    const orphanMigrations = Array.from(migrationStatuses.entries())
      .filter(
        ([migration, status]) =>
          !normalizedExpectedMigrations.includes(migration) && status !== 'applied',
      )
      .map(([migration]) => migration);

    const outstandingMigrations = [
      ...new Set([...pendingMigrations, ...inProgressMigrations, ...orphanMigrations]),
    ];

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

function buildEnvHint(report: EnvDoctorOutcome): EnvHint {
  const keysNeedingAttention = Array.from(
    new Set([
      ...report.missingKeys,
      ...report.invalidKeys.map((issue) => issue.key),
    ]),
  ).sort();

  if (report.isHealthy) {
    return {
      status: 'ok',
      missingKeys: [],
      message: 'Environment configuration looks complete.',
    };
  }

  return {
    status: 'warn',
    missingKeys: keysNeedingAttention,
    message: "Run `npm run env:sync` then open .env to fill values.",
  };
}

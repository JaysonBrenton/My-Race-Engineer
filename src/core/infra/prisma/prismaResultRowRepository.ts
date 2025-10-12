import type { ResultRowRepository, ResultRowUpsertInput } from '@core/app';
import type { ResultRow } from '@core/domain';
import type { ResultRow as PrismaResultRow } from '@prisma/client';

import { getPrismaClient } from './prismaClient';

const toDomain = (row: PrismaResultRow): ResultRow => ({
  id: row.id,
  sessionId: row.sessionId,
  driverId: row.driverId,
  position: row.position,
  carNumber: row.carNumber,
  laps: row.laps,
  totalTimeMs: row.totalTimeMs,
  behindMs: row.behindMs,
  fastestLapMs: row.fastestLapMs,
  fastestLapNum: row.fastestLapNum,
  avgLapMs: row.avgLapMs,
  avgTop5Ms: row.avgTop5Ms,
  avgTop10Ms: row.avgTop10Ms,
  avgTop15Ms: row.avgTop15Ms,
  top3ConsecMs: row.top3ConsecMs,
  stdDevMs: row.stdDevMs,
  consistencyPct: row.consistencyPct,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaResultRowRepository implements ResultRowRepository {
  async upsertBySessionAndDriver(input: ResultRowUpsertInput): Promise<ResultRow> {
    const prisma = getPrismaClient();

    const row = await prisma.resultRow.upsert({
      where: { sessionId_driverId: { sessionId: input.sessionId, driverId: input.driverId } },
      update: {
        position: input.position ?? null,
        carNumber: input.carNumber ?? null,
        laps: input.laps ?? null,
        totalTimeMs: input.totalTimeMs ?? null,
        behindMs: input.behindMs ?? null,
        fastestLapMs: input.fastestLapMs ?? null,
        fastestLapNum: input.fastestLapNum ?? null,
        avgLapMs: input.avgLapMs ?? null,
        avgTop5Ms: input.avgTop5Ms ?? null,
        avgTop10Ms: input.avgTop10Ms ?? null,
        avgTop15Ms: input.avgTop15Ms ?? null,
        top3ConsecMs: input.top3ConsecMs ?? null,
        stdDevMs: input.stdDevMs ?? null,
        consistencyPct: input.consistencyPct ?? null,
      },
      create: {
        sessionId: input.sessionId,
        driverId: input.driverId,
        position: input.position ?? null,
        carNumber: input.carNumber ?? null,
        laps: input.laps ?? null,
        totalTimeMs: input.totalTimeMs ?? null,
        behindMs: input.behindMs ?? null,
        fastestLapMs: input.fastestLapMs ?? null,
        fastestLapNum: input.fastestLapNum ?? null,
        avgLapMs: input.avgLapMs ?? null,
        avgTop5Ms: input.avgTop5Ms ?? null,
        avgTop10Ms: input.avgTop10Ms ?? null,
        avgTop15Ms: input.avgTop15Ms ?? null,
        top3ConsecMs: input.top3ConsecMs ?? null,
        stdDevMs: input.stdDevMs ?? null,
        consistencyPct: input.consistencyPct ?? null,
      },
    });

    return toDomain(row);
  }
}

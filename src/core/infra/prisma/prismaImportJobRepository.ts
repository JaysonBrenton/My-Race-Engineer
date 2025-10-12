import type {
  CreateImportJobInput,
  ImportJobRecord,
  ImportJobRepository,
  UpdateImportJobItemInput,
} from '@core/app/ports/importJobRepository';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { getPrismaClient } from './prismaClient';

const importJobItemSchema = z.object({
  id: z.string(),
  targetType: z.union([z.literal('EVENT'), z.literal('SESSION')]),
  targetRef: z.string(),
  state: z.union([
    z.literal('QUEUED'),
    z.literal('RUNNING'),
    z.literal('SUCCEEDED'),
    z.literal('FAILED'),
  ]),
  message: z.string().nullable(),
  countsJson: z.unknown().nullable(),
});

const importJobSchema = z.object({
  id: z.string(),
  state: z.union([
    z.literal('QUEUED'),
    z.literal('RUNNING'),
    z.literal('SUCCEEDED'),
    z.literal('FAILED'),
  ]),
  progressPct: z.number().nullable().optional(),
  message: z.string().nullable().optional(),
  items: z.array(importJobItemSchema),
});

type ImportJobRow = z.infer<typeof importJobSchema>;

type TransactionClient = Prisma.TransactionClient;

const mapJob = (job: ImportJobRow): ImportJobRecord => ({
  jobId: job.id,
  state: job.state,
  progressPct: job.progressPct ?? 0,
  message: job.message ?? undefined,
  items: job.items.map((item) => ({
    id: item.id,
    targetType: item.targetType,
    targetRef: item.targetRef,
    state: item.state,
    message: item.message ?? undefined,
    counts: item.countsJson ?? undefined,
  })),
});

const toJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
};

const parseJob = (job: unknown): ImportJobRow => {
  const result = importJobSchema.safeParse(job);

  if (!result.success) {
    throw new Error('Failed to parse import job record.');
  }

  return result.data;
};

const updateItemsState = async (
  tx: TransactionClient,
  jobId: string,
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED',
) => {
  await tx.importJobItem.updateMany({
    where: { jobId },
    data: { state, message: null },
  });
};

export class PrismaImportJobRepository implements ImportJobRepository {
  async createJob(input: CreateImportJobInput): Promise<{ jobId: string }> {
    const prisma = getPrismaClient();

    const result = await prisma.importJob.create({
      data: {
        planHash: input.planHash,
        mode: input.mode,
        state: 'QUEUED',
        progressPct: 0,
        items: {
          create: input.items.map((item) => ({
            targetType: item.targetType,
            targetRef: item.targetRef,
            countsJson: toJsonInput(item.counts),
            state: 'QUEUED',
          })),
        },
      },
      select: { id: true },
    });

    return { jobId: result.id };
  }

  async getJob(jobId: string): Promise<ImportJobRecord | null> {
    const prisma = getPrismaClient();

    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        state: true,
        progressPct: true,
        message: true,
        items: {
          select: {
            id: true,
            targetType: true,
            targetRef: true,
            state: true,
            message: true,
            countsJson: true,
          },
        },
      },
    });

    if (!job) {
      return null;
    }

    return mapJob(parseJob(job));
  }

  async takeNextQueuedJob(): Promise<ImportJobRecord | null> {
    const prisma = getPrismaClient();

    return prisma.$transaction(async (tx) => {
      const queuedJob = await tx.importJob.findFirst({
        where: { state: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          state: true,
          progressPct: true,
          message: true,
          items: {
            select: {
              id: true,
              targetType: true,
              targetRef: true,
              state: true,
              message: true,
              countsJson: true,
            },
          },
        },
      });

      if (!queuedJob) {
        return null;
      }

      const updated = await tx.importJob.updateMany({
        where: { id: queuedJob.id, state: 'QUEUED' },
        data: { state: 'RUNNING', progressPct: 0, message: null },
      });

      if (updated.count === 0) {
        return null;
      }

      await updateItemsState(tx, queuedJob.id, 'RUNNING');

      const job = await tx.importJob.findUnique({
        where: { id: queuedJob.id },
        select: {
          id: true,
          state: true,
          progressPct: true,
          message: true,
          items: {
            select: {
              id: true,
              targetType: true,
              targetRef: true,
              state: true,
              message: true,
              countsJson: true,
            },
          },
        },
      });

      if (!job) {
        return null;
      }

      return mapJob(parseJob(job));
    });
  }

  async markJobSucceeded(jobId: string): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: { state: 'SUCCEEDED', progressPct: 100, message: null },
      });

      await updateItemsState(tx, jobId, 'SUCCEEDED');
    });
  }

  async markJobFailed(jobId: string, message: string): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: { state: 'FAILED', message },
      });

      await tx.importJobItem.updateMany({
        where: { jobId, NOT: { state: 'SUCCEEDED' } },
        data: { state: 'FAILED', message },
      });
    });
  }

  async updateJobProgress(jobId: string, progressPct: number): Promise<void> {
    const prisma = getPrismaClient();
    const clamped = Math.max(0, Math.min(100, progressPct));

    await prisma.importJob.update({
      where: { id: jobId },
      data: { progressPct: clamped },
    });
  }

  async updateJobItem(input: UpdateImportJobItemInput): Promise<void> {
    const prisma = getPrismaClient();

    const data: Prisma.ImportJobItemUpdateInput = {};

    if (input.state) {
      data.state = input.state;
    }

    if (input.message !== undefined) {
      data.message = input.message;
    }

    if (input.counts !== undefined) {
      data.countsJson = toJsonInput(input.counts);
    }

    if (Object.keys(data).length === 0) {
      return;
    }

    await prisma.importJobItem.update({
      where: { id: input.itemId },
      data,
    });
  }
}

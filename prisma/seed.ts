import { PrismaClient } from '@prisma/client';

import { applicationLogger } from '../src/dependencies/logger';

const prisma = new PrismaClient();
const logger = applicationLogger.withContext({ route: 'prisma/seed' });

async function main() {
  const sourceEventId = 'liverc-event-baseline';
  const existingEvent = await prisma.event.findUnique({ where: { sourceEventId } });

  if (existingEvent) {
    logger.info('Seed skipped: baseline LiveRC event already exists.', {
      event: 'seed.skip_existing_event',
      outcome: 'skipped',
    });
    return;
  }

  const event = await prisma.event.create({
    data: {
      id: 'baseline-event',
      name: 'Baseline Invitational',
      sourceEventId,
      sourceUrl: 'https://liverc.com/events/baseline',
    },
  });

  const raceClass = await prisma.raceClass.create({
    data: {
      id: 'baseline-race-class',
      eventId: event.id,
      name: 'Pro Lite',
      classCode: 'PRO-LITE',
      sourceUrl: 'https://liverc.com/events/baseline/classes/pro-lite',
    },
  });

  const session = await prisma.session.create({
    data: {
      id: 'baseline-session',
      eventId: event.id,
      raceClassId: raceClass.id,
      name: 'Heat 1',
      sourceSessionId: 'liverc-session-baseline',
      sourceUrl: 'https://liverc.com/events/baseline/classes/pro-lite/heat-1',
    },
  });

  const entrant = await prisma.entrant.create({
    data: {
      id: 'baseline-entrant',
      eventId: event.id,
      raceClassId: raceClass.id,
      sessionId: session.id,
      displayName: 'Baseline Driver',
      carNumber: '7',
      sourceEntrantId: 'liverc-entrant-baseline',
      sourceTransponderId: 'TX-BASELINE-7',
    },
  });

  await prisma.lap.createMany({
    data: [
      { id: 'baseline-lap-1', entrantId: entrant.id, sessionId: session.id, lapNumber: 1, lapTimeMs: 92345 },
      { id: 'baseline-lap-2', entrantId: entrant.id, sessionId: session.id, lapNumber: 2, lapTimeMs: 91012 },
      { id: 'baseline-lap-3', entrantId: entrant.id, sessionId: session.id, lapNumber: 3, lapTimeMs: 90567 },
    ],
    skipDuplicates: true,
  });

  logger.info('Seed completed: inserted baseline LiveRC entities and laps.', {
    event: 'seed.completed',
    outcome: 'success',
  });
}

main()
  .catch((error) => {
    logger.error('Seed failed.', {
      event: 'seed.failed',
      outcome: 'failure',
      error,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

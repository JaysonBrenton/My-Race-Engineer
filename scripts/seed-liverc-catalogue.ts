import { PrismaClient, SessionType } from '@prisma/client';

import { applicationLogger } from '../src/dependencies/logger';

const prisma = new PrismaClient();
const logger = applicationLogger.withContext({ route: 'scripts/seed-liverc-catalogue' });

type CatalogueSession = {
  sourceSessionId: string;
  name: string;
  sourceUrl: string;
  type: SessionType;
  scheduledStart?: string;
};

type CatalogueRaceClass = {
  classCode: string;
  name: string;
  sourceUrl: string;
  sessions: CatalogueSession[];
};

type CatalogueEvent = {
  sourceEventId: string;
  providerEventId?: string;
  name: string;
  sourceUrl: string;
  startDate?: string;
  endDate?: string;
  entriesCount?: number;
  driversCount?: number;
  raceClasses: CatalogueRaceClass[];
};

type CatalogueClub = {
  slug: string;
  name: string;
  subdomain: string;
  region?: string;
  timezone?: string;
  events: CatalogueEvent[];
};

const catalogue: CatalogueClub[] = [
  {
    slug: 'the-dirt',
    name: 'The Dirt Racing',
    subdomain: 'thedirt',
    region: 'US-CA',
    timezone: 'America/Los_Angeles',
    events: [
      {
        sourceEventId: '2024-the-dirt-nitro-challenge',
        providerEventId: '2024-the-dirt-nitro-challenge',
        name: '2024 The Dirt Nitro Challenge',
        sourceUrl: 'https://www.liverc.com/results/2024-the-dirt-nitro-challenge',
        startDate: '2024-02-19',
        endDate: '2024-02-25',
        entriesCount: 420,
        driversCount: 360,
        raceClasses: [
          {
            classCode: 'PRO-NITRO-BUGGY',
            name: 'Pro Nitro Buggy',
            sourceUrl:
              'https://www.liverc.com/results/2024-the-dirt-nitro-challenge/pro-nitro-buggy',
            sessions: [
              {
                sourceSessionId:
                  '2024-the-dirt-nitro-challenge/pro-nitro-buggy/main-events/a-main',
                name: 'A-Main',
                sourceUrl:
                  'https://www.liverc.com/results/2024-the-dirt-nitro-challenge/pro-nitro-buggy/main-events/a-main',
                type: SessionType.MAIN,
                scheduledStart: '2024-02-25T18:00:00-08:00',
              },
              {
                sourceSessionId:
                  '2024-the-dirt-nitro-challenge/pro-nitro-buggy/qualifying/round-5-heat-1',
                name: 'Qualifying Round 5 Heat 1',
                sourceUrl:
                  'https://www.liverc.com/results/2024-the-dirt-nitro-challenge/pro-nitro-buggy/qualifying/round-5/heat-1',
                type: SessionType.QUAL,
                scheduledStart: '2024-02-23T09:00:00-08:00',
              },
            ],
          },
          {
            classCode: 'PRO-TRUGGY',
            name: 'Pro Nitro Truggy',
            sourceUrl:
              'https://www.liverc.com/results/2024-the-dirt-nitro-challenge/pro-truggy',
            sessions: [
              {
                sourceSessionId:
                  '2024-the-dirt-nitro-challenge/pro-truggy/main-events/a-main',
                name: 'A-Main',
                sourceUrl:
                  'https://www.liverc.com/results/2024-the-dirt-nitro-challenge/pro-truggy/main-events/a-main',
                type: SessionType.MAIN,
                scheduledStart: '2024-02-24T18:30:00-08:00',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'silver-state',
    name: 'Silver State RC Race',
    subdomain: 'silverstate',
    region: 'US-NV',
    timezone: 'America/Los_Angeles',
    events: [
      {
        sourceEventId: '2024-silver-state-indoor-championships',
        providerEventId: '2024-silver-state-indoor-championships',
        name: '2024 Silver State Indoor Championships',
        sourceUrl: 'https://www.liverc.com/results/2024-silver-state-indoor-championships',
        startDate: '2024-05-01',
        endDate: '2024-05-05',
        entriesCount: 510,
        driversCount: 400,
        raceClasses: [
          {
            classCode: 'PRO-EP-BUGGY',
            name: 'Pro Electric Buggy',
            sourceUrl:
              'https://www.liverc.com/results/2024-silver-state-indoor-championships/pro-ep-buggy',
            sessions: [
              {
                sourceSessionId:
                  '2024-silver-state-indoor-championships/pro-ep-buggy/main-events/a-main',
                name: 'A-Main',
                sourceUrl:
                  'https://www.liverc.com/results/2024-silver-state-indoor-championships/pro-ep-buggy/main-events/a-main',
                type: SessionType.MAIN,
                scheduledStart: '2024-05-05T17:30:00-07:00',
              },
              {
                sourceSessionId:
                  '2024-silver-state-indoor-championships/pro-ep-buggy/qualifying/round-4-heat-3',
                name: 'Qualifying Round 4 Heat 3',
                sourceUrl:
                  'https://www.liverc.com/results/2024-silver-state-indoor-championships/pro-ep-buggy/qualifying/round-4/heat-3',
                type: SessionType.QUAL,
                scheduledStart: '2024-05-04T11:00:00-07:00',
              },
            ],
          },
          {
            classCode: 'PRO-40-NITRO',
            name: '40+ Nitro Buggy',
            sourceUrl:
              'https://www.liverc.com/results/2024-silver-state-indoor-championships/pro-40-nitro-buggy',
            sessions: [
              {
                sourceSessionId:
                  '2024-silver-state-indoor-championships/pro-40-nitro-buggy/main-events/a-main',
                name: 'A-Main',
                sourceUrl:
                  'https://www.liverc.com/results/2024-silver-state-indoor-championships/pro-40-nitro-buggy/main-events/a-main',
                type: SessionType.MAIN,
                scheduledStart: '2024-05-05T14:30:00-07:00',
              },
            ],
          },
        ],
      },
    ],
  },
];

const toDate = (value: string | undefined) => (value ? new Date(value) : undefined);

async function seedCatalogue() {
  let clubsInserted = 0;
  let clubsUpdated = 0;
  let eventsInserted = 0;
  let eventsUpdated = 0;
  let classesInserted = 0;
  let classesUpdated = 0;
  let sessionsInserted = 0;
  let sessionsUpdated = 0;

  for (const entry of catalogue) {
    const club = await prisma.club.upsert({
      where: { slug: entry.slug },
      create: {
        slug: entry.slug,
        name: entry.name,
        subdomain: entry.subdomain,
        region: entry.region ?? null,
        timezone: entry.timezone ?? null,
      },
      update: {
        name: entry.name,
        subdomain: entry.subdomain,
        region: entry.region ?? null,
        timezone: entry.timezone ?? null,
      },
    });

    if (club.createdAt.getTime() === club.updatedAt.getTime()) {
      clubsInserted += 1;
    } else {
      clubsUpdated += 1;
    }

    for (const eventDef of entry.events) {
      const existingEvent = await prisma.event.findUnique({
        where: { sourceEventId: eventDef.sourceEventId },
      });

      const event = await prisma.event.upsert({
        where: { sourceEventId: eventDef.sourceEventId },
        update: {
          name: eventDef.name,
          sourceUrl: eventDef.sourceUrl,
          providerEventId: eventDef.providerEventId ?? null,
          clubId: club.id,
          startDate: toDate(eventDef.startDate) ?? null,
          endDate: toDate(eventDef.endDate) ?? null,
          entriesCount: eventDef.entriesCount ?? null,
          driversCount: eventDef.driversCount ?? null,
        },
        create: {
          name: eventDef.name,
          sourceEventId: eventDef.sourceEventId,
          sourceUrl: eventDef.sourceUrl,
          providerEventId: eventDef.providerEventId ?? null,
          clubId: club.id,
          startDate: toDate(eventDef.startDate) ?? null,
          endDate: toDate(eventDef.endDate) ?? null,
          entriesCount: eventDef.entriesCount ?? null,
          driversCount: eventDef.driversCount ?? null,
        },
      });

      if (existingEvent) {
        eventsUpdated += 1;
      } else {
        eventsInserted += 1;
      }

      for (const classDef of eventDef.raceClasses) {
        const raceClass = await prisma.raceClass.upsert({
          where: {
            eventId_classCode: {
              eventId: event.id,
              classCode: classDef.classCode,
            },
          },
          update: {
            name: classDef.name,
            sourceUrl: classDef.sourceUrl,
          },
          create: {
            eventId: event.id,
            classCode: classDef.classCode,
            name: classDef.name,
            sourceUrl: classDef.sourceUrl,
          },
        });

        if (raceClass.createdAt.getTime() === raceClass.updatedAt.getTime()) {
          classesInserted += 1;
        } else {
          classesUpdated += 1;
        }

        for (const sessionDef of classDef.sessions) {
          const session = await prisma.session.upsert({
            where: { sourceSessionId: sessionDef.sourceSessionId },
            update: {
              name: sessionDef.name,
              sourceUrl: sessionDef.sourceUrl,
              type: sessionDef.type,
              scheduledStart: toDate(sessionDef.scheduledStart) ?? null,
              raceClassId: raceClass.id,
              eventId: event.id,
            },
            create: {
              sourceSessionId: sessionDef.sourceSessionId,
              sourceUrl: sessionDef.sourceUrl,
              name: sessionDef.name,
              type: sessionDef.type,
              scheduledStart: toDate(sessionDef.scheduledStart) ?? null,
              raceClassId: raceClass.id,
              eventId: event.id,
            },
          });

          if (session.createdAt.getTime() === session.updatedAt.getTime()) {
            sessionsInserted += 1;
          } else {
            sessionsUpdated += 1;
          }
        }
      }
    }
  }

  logger.info('LiveRC catalogue seed completed.', {
    event: 'seed.livercCatalogue.completed',
    outcome: 'success',
    stats: {
      clubsInserted,
      clubsUpdated,
      eventsInserted,
      eventsUpdated,
      classesInserted,
      classesUpdated,
      sessionsInserted,
      sessionsUpdated,
    },
  });
}

seedCatalogue()
  .catch((error) => {
    logger.error('LiveRC catalogue seed failed.', {
      event: 'seed.livercCatalogue.failed',
      outcome: 'failure',
      error,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

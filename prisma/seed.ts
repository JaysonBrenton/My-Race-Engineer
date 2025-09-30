import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const driverName = 'Baseline Driver';
  const existing = await prisma.lap.count({ where: { driverName } });

  if (existing > 0) {
    console.info('Seed skipped: sample laps already exist.');
    return;
  }

  await prisma.lap.createMany({
    data: [
      { driverName, lapNumber: 1, lapTimeMs: 92345 },
      { driverName, lapNumber: 2, lapTimeMs: 91012 },
      { driverName, lapNumber: 3, lapTimeMs: 90567 },
    ],
    skipDuplicates: true,
  });

  console.info('Seed completed: inserted sample laps.');
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

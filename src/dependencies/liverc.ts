import {
  LiveRcImportPlanService,
  LiveRcImportService,
  LiveRcJobQueue,
  LiveRcSummaryImporter,
} from '@core/app';
import { HttpLiveRcClient } from '@core/app/connectors/liverc/client';
import {
  LiveRcHttpClient,
  PrismaEntrantRepository,
  PrismaEventRepository,
  PrismaImportPlanRepository,
  PrismaLapRepository,
  PrismaImportJobRepository,
  PrismaRaceClassRepository,
  PrismaSessionRepository,
  PrismaDriverRepository,
  PrismaResultRowRepository,
  isPrismaClientInitializationError,
} from '@core/infra';

import { applicationLogger } from '@/dependencies/logger';

const liveRcJsonClient = new LiveRcHttpClient();
const liveRcHtmlClient = new HttpLiveRcClient();
const eventRepository = new PrismaEventRepository();
const raceClassRepository = new PrismaRaceClassRepository();
const sessionRepository = new PrismaSessionRepository();
const entrantRepository = new PrismaEntrantRepository();
const lapRepository = new PrismaLapRepository();
const importPlanRepository = new PrismaImportPlanRepository();
const importJobRepository = new PrismaImportJobRepository();
const driverRepository = new PrismaDriverRepository();
const resultRowRepository = new PrismaResultRowRepository();

const liveRcSummaryImporter = new LiveRcSummaryImporter({
  client: liveRcHtmlClient,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  driverRepository,
  resultRowRepository,
  entrantRepository,
  lapRepository,
  logger: applicationLogger,
});

export const liveRcImportService = new LiveRcImportService({
  liveRcClient: liveRcJsonClient,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  entrantRepository,
  lapRepository,
  logger: applicationLogger,
});

export const liveRcImportPlanService = new LiveRcImportPlanService({
  client: liveRcHtmlClient,
  repository: importPlanRepository,
});

export const liveRcImportJobQueue = new LiveRcJobQueue({
  repository: importJobRepository,
  summaryImporter: liveRcSummaryImporter,
  logger: applicationLogger,
});

export const liveRcDependencies = {
  liveRcJsonClient,
  liveRcHtmlClient,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  entrantRepository,
  lapRepository,
  importPlanRepository,
  importJobRepository,
  driverRepository,
  resultRowRepository,
  summaryImporter: liveRcSummaryImporter,
  jobQueue: liveRcImportJobQueue,
  logger: applicationLogger,
};

export const isPrismaUnavailableError = isPrismaClientInitializationError;

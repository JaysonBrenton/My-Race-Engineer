/**
 * Project: My Race Engineer
 * File: src/dependencies/liverc.ts
 * Summary: Wiring for LiveRC services, repositories, and background jobs.
 */

import {
  LiveRcClubCatalogueService,
  LiveRcClubSearchService,
  LiveRcEventSearchService,
  LiveRcImportPlanService,
  LiveRcImportService,
  LiveRcJobQueue,
  LiveRcSummaryImporter,
} from '@core/app';
import { HttpLiveRcClient } from '@core/app/connectors/liverc/client';
import { LiveRcDiscoveryService } from '@core/app/connectors/liverc/discovery';
import {
  LiveRcHttpClient,
  PrismaClubRepository,
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
import { livercTelemetry } from '@/dependencies/telemetry';

const liveRcJsonClient = new LiveRcHttpClient();
const liveRcHtmlClient = new HttpLiveRcClient();
const clubRepository = new PrismaClubRepository();
export const liveRcDiscoveryService = new LiveRcDiscoveryService({
  client: liveRcHtmlClient,
  clubRepository,
  logger: applicationLogger,
});
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
  telemetry: livercTelemetry,
});

// Lightweight lookup service for powering UI search against the club catalogue.
export const liveRcClubSearchService = new LiveRcClubSearchService({
  repository: clubRepository,
});

// Service for searching LiveRC club events by query term, similar to club search.
export const liveRcEventSearchService = new LiveRcEventSearchService({
  discoveryService: liveRcDiscoveryService,
  clubRepository,
  logger: applicationLogger,
});

// Dedicated service responsible for synchronising the LiveRC club catalogue
// so downstream features can rely on a consistent list of tracks.
export const liveRcClubCatalogueService = new LiveRcClubCatalogueService({
  client: liveRcHtmlClient,
  repository: clubRepository,
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

export const liveRcImportPlanService = new LiveRcImportPlanService(
  {
    client: liveRcHtmlClient,
    repository: importPlanRepository,
  },
  {
    includeExistingEvents:
      process.env.LIVERC_INCLUDE_EXISTING_EVENTS === '1' ||
      process.env.LIVERC_INCLUDE_EXISTING_EVENTS?.toLowerCase() === 'true',
  },
);

export const liveRcImportJobQueue = new LiveRcJobQueue({
  repository: importJobRepository,
  summaryImporter: liveRcSummaryImporter,
  logger: applicationLogger,
  telemetry: livercTelemetry,
});

export const startLiveRcImportJobQueue = () => liveRcImportJobQueue.start();

export const stopLiveRcImportJobQueue = () => liveRcImportJobQueue.stop();

export const liveRcDependencies = {
  liveRcJsonClient,
  liveRcHtmlClient,
  liveRcDiscoveryService,
  liveRcClubCatalogueService,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  entrantRepository,
  lapRepository,
  importPlanRepository,
  importJobRepository,
  driverRepository,
  resultRowRepository,
  clubRepository,
  clubSearchService: liveRcClubSearchService,
  summaryImporter: liveRcSummaryImporter,
  jobQueue: liveRcImportJobQueue,
  logger: applicationLogger,
  telemetry: livercTelemetry,
};

export const isPrismaUnavailableError = isPrismaClientInitializationError;

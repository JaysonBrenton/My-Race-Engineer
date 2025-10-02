import { LiveRcImportService } from '@core/app';
import {
  LiveRcHttpClient,
  PrismaEntrantRepository,
  PrismaEventRepository,
  PrismaLapRepository,
  PrismaRaceClassRepository,
  PrismaSessionRepository,
  isPrismaClientInitializationError,
} from '@core/infra';

const liveRcClient = new LiveRcHttpClient();
const eventRepository = new PrismaEventRepository();
const raceClassRepository = new PrismaRaceClassRepository();
const sessionRepository = new PrismaSessionRepository();
const entrantRepository = new PrismaEntrantRepository();
const lapRepository = new PrismaLapRepository();

export const liveRcImportService = new LiveRcImportService({
  liveRcClient,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  entrantRepository,
  lapRepository,
});

export const liveRcDependencies = {
  liveRcClient,
  eventRepository,
  raceClassRepository,
  sessionRepository,
  entrantRepository,
  lapRepository,
};

export const isPrismaUnavailableError = isPrismaClientInitializationError;

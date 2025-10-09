import type { Logger, LoggerContext } from '@core/app';
import { createPinoLogger } from '@core/infra';

const logDirectory = process.env.LOG_DIR || './_logs';
const logLevel = process.env.LOG_LEVEL ?? 'info';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const disableFileLogs = isBuildPhase || process.env.DISABLE_FILE_LOGS === 'true';

export const loggerEnvironmentConfig = {
  logDirectory,
  disableFileLogs,
  level: logLevel,
} as const;

export const applicationLogger: Logger = createPinoLogger(loggerEnvironmentConfig);

export const getRequestLogger = (context: LoggerContext): Logger =>
  applicationLogger.withContext(context);

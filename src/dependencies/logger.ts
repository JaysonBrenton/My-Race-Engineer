import type { Logger, LoggerContext } from '@core/app';
import { createPinoLogger } from '@core/infra';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const disableFileLogs = isBuildPhase || process.env.DISABLE_FILE_LOGS === 'true';

export const applicationLogger: Logger = createPinoLogger({
  logDirectory: process.env.LOG_DIR || './_logs',
  disableFileLogs,
  level: process.env.LOG_LEVEL ?? 'info',
});

export const getRequestLogger = (context: LoggerContext): Logger =>
  applicationLogger.withContext(context);

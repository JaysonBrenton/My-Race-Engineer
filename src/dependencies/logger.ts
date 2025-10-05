import type { Logger, LoggerContext } from '@core/app';
import { createPinoLogger } from '@core/infra';

const disableFileLogs = process.env.DISABLE_FILE_LOGS === 'true';

export const applicationLogger: Logger = createPinoLogger({
  level: process.env.LOG_LEVEL,
  disableFileLogs,
});

export const getRequestLogger = (context: LoggerContext): Logger =>
  applicationLogger.withContext(context);

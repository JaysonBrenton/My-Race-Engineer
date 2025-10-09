import { isAbsolute, join } from 'node:path';

import type { Logger, LoggerContext } from '@core/app';
import { createPinoLogger } from '@core/infra';

type Env = NodeJS.ProcessEnv;

const resolveEnv = (env: Env, key: string): string | undefined => {
  const value = env[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveBooleanEnv = (env: Env, key: string): boolean | undefined => {
  const value = resolveEnv(env, key);
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value.toLowerCase() === 'true') {
    return true;
  }

  if (value.toLowerCase() === 'false') {
    return false;
  }

  return undefined;
};

const resolveLogDirectory = (env: Env): string => {
  const override = resolveEnv(env, 'LOG_DIR');
  if (!override) {
    return join(process.cwd(), '_logs');
  }

  return isAbsolute(override) ? override : join(process.cwd(), override);
};

const resolveDisableFileLogs = (env: Env): boolean => {
  const nextPhase = resolveEnv(env, 'NEXT_PHASE');
  if (nextPhase === 'phase-production-build') {
    return true;
  }

  return resolveBooleanEnv(env, 'DISABLE_FILE_LOGS') ?? false;
};

const resolveLogLevel = (env: Env): string => resolveEnv(env, 'LOG_LEVEL') ?? 'info';

export const loggerEnvironmentConfig = {
  logDirectory: resolveLogDirectory(process.env),
  disableFileLogs: resolveDisableFileLogs(process.env),
  level: resolveLogLevel(process.env),
} as const;

export const applicationLogger: Logger = createPinoLogger(loggerEnvironmentConfig);

export const getRequestLogger = (context: LoggerContext): Logger =>
  applicationLogger.withContext(context);

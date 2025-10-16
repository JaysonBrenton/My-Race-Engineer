import type { LoggerContext } from '@core/app';

export type LoggableError = {
  name: string;
  message: string;
  stack?: string;
};

const isRecordWithMessage = (value: unknown): value is { message?: unknown } =>
  typeof value === 'object' && value !== null;

export const toLoggableError = (error: unknown): LoggableError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? undefined,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }

  if (isRecordWithMessage(error) && typeof error.message === 'string') {
    return {
      name: 'Error',
      message: error.message,
    };
  }

  return {
    name: 'UnknownError',
    message: 'Unknown error',
  };
};

export const createErrorLogContext = (
  base: Omit<LoggerContext, 'error'>,
  error: unknown,
): LoggerContext => {
  if (error == null) {
    return { ...base };
  }

  return {
    ...base,
    error: toLoggableError(error),
  };
};

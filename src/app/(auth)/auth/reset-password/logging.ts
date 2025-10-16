import type { LoggerContext } from '@core/app';

export type LoggableError = {
  name: string;
  message: string;
  stack?: string;
};

export const toLoggableError = (error: unknown): LoggableError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? undefined,
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown error',
  };
};

export const createErrorLogContext = (
  base: Omit<LoggerContext, 'error'>,
  error: unknown,
): LoggerContext => ({
  ...base,
  // The logger serialiser safely normalises unknown error inputs.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  error: toLoggableError(error),
});

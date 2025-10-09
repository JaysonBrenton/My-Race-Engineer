import type { Logger, LoggerContext } from '@core/app/ports/logger';

class CompositeLogger implements Logger {
  constructor(private readonly delegates: Logger[]) {}

  debug(message: string, context?: LoggerContext): void {
    for (const logger of this.delegates) {
      logger.debug(message, context);
    }
  }

  info(message: string, context?: LoggerContext): void {
    for (const logger of this.delegates) {
      logger.info(message, context);
    }
  }

  warn(message: string, context?: LoggerContext): void {
    for (const logger of this.delegates) {
      logger.warn(message, context);
    }
  }

  error(message: string, context?: LoggerContext): void {
    for (const logger of this.delegates) {
      logger.error(message, context);
    }
  }

  withContext(context: LoggerContext): Logger {
    return new CompositeLogger(this.delegates.map((logger) => logger.withContext(context)));
  }
}

export const createCompositeLogger = (...loggers: Logger[]): Logger => {
  if (loggers.length === 0) {
    throw new Error('createCompositeLogger requires at least one logger instance.');
  }

  if (loggers.length === 1) {
    return loggers[0];
  }

  return new CompositeLogger(loggers);
};

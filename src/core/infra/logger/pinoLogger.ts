import path from 'node:path';

import pino, {
  type DestinationStream,
  type Logger as PinoInstance,
  type TransportMultiOptions,
  type TransportTargetOptions,
} from 'pino';

import type { Logger, LoggerContext, LogLevel } from '@core/app/ports/logger';

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_LOG_DIRECTORY = path.join(process.cwd(), 'logs');

export type CreatePinoLoggerOptions = {
  level?: string;
  disableFileLogs?: boolean;
  logDirectory?: string;
};

const serializeError = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Error) {
    const serialised: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };

    if (value.stack) {
      serialised.stack = value.stack;
    }

    if ('code' in value && typeof (value as { code?: unknown }).code !== 'undefined') {
      serialised.code = (value as { code?: unknown }).code;
    }

    if (value.cause !== undefined) {
      serialised.cause = serializeError(value.cause);
    }

    return serialised;
  }

  if (typeof value === 'object') {
    return { ...(value as Record<string, unknown>) };
  }

  return { value: String(value) };
};

const serializeContext = (context?: LoggerContext): Record<string, unknown> | undefined => {
  if (!context) {
    return undefined;
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'undefined') {
      continue;
    }

    if (key === 'error') {
      const serialisedError = serializeError(value);
      if (serialisedError) {
        output.error = serialisedError;
      }
      continue;
    }

    output[key] = value;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

class PinoLoggerAdapter implements Logger {
  constructor(private readonly instance: PinoInstance) {}

  debug(message: string, context?: LoggerContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LoggerContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LoggerContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LoggerContext): void {
    this.write('error', message, context);
  }

  withContext(context: LoggerContext): Logger {
    const serialised = serializeContext(context) ?? {};
    return new PinoLoggerAdapter(this.instance.child(serialised));
  }

  private write(level: LogLevel, message: string, context?: LoggerContext) {
    const serialised = serializeContext(context);

    if (serialised) {
      this.instance[level](serialised, message);
      return;
    }

    this.instance[level](message);
  }
}

const buildTransportTargets = (
  options: Required<Pick<CreatePinoLoggerOptions, 'disableFileLogs'>> & {
    logDirectory: string;
  },
): TransportTargetOptions[] => {
  const targets: TransportTargetOptions[] = [
    {
      target: 'pino/file',
      options: { destination: 1 },
    },
  ];

  if (!options.disableFileLogs) {
    targets.push(
      {
        target: 'pino/file',
        options: {
          destination: path.join(options.logDirectory, 'app.log'),
          mkdir: true,
          append: true,
          rotate: { interval: '1d', maxFiles: 7, size: '50m' },
        },
      },
      {
        level: 'warn',
        target: 'pino/file',
        options: {
          destination: path.join(options.logDirectory, 'error.log'),
          mkdir: true,
          append: true,
          rotate: { interval: '1d', maxFiles: 7, size: '20m' },
        },
      },
    );
  }

  return targets;
};

export const createPinoLogger = (options: CreatePinoLoggerOptions = {}): Logger => {
  const level = options.level ?? DEFAULT_LOG_LEVEL;
  const disableFileLogs = options.disableFileLogs ?? false;
  const logDirectory = options.logDirectory ?? DEFAULT_LOG_DIRECTORY;

  const transportOptions: TransportMultiOptions = {
    targets: buildTransportTargets({ disableFileLogs, logDirectory }),
  };

  const transport = pino.transport(transportOptions) as DestinationStream;

  const instance = pino(
    {
      level,
      base: undefined,
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    },
    transport,
  );

  return new PinoLoggerAdapter(instance);
};

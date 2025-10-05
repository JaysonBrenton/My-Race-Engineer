import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import pino, {
  type DestinationStream,
  type Logger as PinoInstance,
  type LoggerOptions,
} from 'pino';

import type { Logger, LoggerContext, LogLevel } from '@core/app/ports/logger';

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_LOG_DIRECTORY = join(process.cwd(), 'logs');

// Detect Next build step
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

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

type PinoDestinationFn = (options: {
  dest: string | number;
  mkdir?: boolean;
  append?: boolean;
  sync?: boolean;
}) => DestinationStream;
type PinoMultistreamFn = (
  streams: Array<{ stream: DestinationStream; level?: LogLevel }>,
) => DestinationStream;

type PinoExport = {
  (options?: LoggerOptions, destination?: DestinationStream): PinoInstance;
  destination: PinoDestinationFn;
  multistream: PinoMultistreamFn;
};

const pinoExport = pino as unknown as PinoExport;

const fileStream = (
  filePath: string,
  level?: LogLevel,
): { stream: DestinationStream; level?: LogLevel } => {
  const stream = pinoExport.destination({ dest: filePath, mkdir: true, append: true, sync: false });
  return level ? { stream, level } : { stream };
};

export const createPinoLogger = (options: CreatePinoLoggerOptions = {}): Logger => {
  const level = options.level ?? DEFAULT_LOG_LEVEL;
  const disableFileLogs = (options.disableFileLogs ?? false) || isBuildPhase;
  const logDirectory = options.logDirectory ?? DEFAULT_LOG_DIRECTORY;

  const streams: Array<{ stream: DestinationStream; level?: LogLevel }> = [
    { stream: pinoExport.destination({ dest: 1, sync: false }) },
  ];

  if (!disableFileLogs) {
    mkdirSync(logDirectory, { recursive: true });

    streams.push(
      fileStream(join(logDirectory, 'app.log')),
      fileStream(join(logDirectory, 'error.log'), 'warn'),
    );
  }

  const instance = pinoExport(
    {
      level,
      base: undefined,
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    },
    pinoExport.multistream(streams),
  );

  return new PinoLoggerAdapter(instance);
};

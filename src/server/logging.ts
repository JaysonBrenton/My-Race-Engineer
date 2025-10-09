/**
 * Filename: src/server/logging.ts
 * Purpose: Emit structured log entries for server-side and middleware diagnostics.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const consoleForLevel: Record<LogLevel, (message?: unknown, ...optionalParams: unknown[]) => void> =
  {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

const sanitizeFields = (fields: LogFields): LogFields => {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
};

export const logSecurityEvent = (level: LogLevel, event: string, fields: LogFields): void => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeFields(fields),
  };

  const logger = consoleForLevel[level] ?? console.info.bind(console);
  logger(JSON.stringify(payload));
};

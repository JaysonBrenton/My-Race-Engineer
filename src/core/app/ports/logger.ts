export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LoggerContext = {
  /**
   * Correlation identifier propagated from incoming requests (e.g. `x-request-id`).
   */
  requestId?: string;
  /** The HTTP route or logical operation the log pertains to. */
  route?: string;
  /**
   * Anonymous user identifier derived from session/cookie state. Never include
   * PII in this field.
   */
  userAnonId?: string;
  /** Machine friendly event name for querying (e.g. `liverc.import.success`). */
  event?: string;
  /** Duration of the operation in milliseconds when applicable. */
  durationMs?: number;
  /** Outcome keyword such as `success`, `failure`, or `skipped`. */
  outcome?: string;
  /** Optional error instance or metadata to serialise. */
  error?: unknown;
  /** Additional structured properties to enrich the log entry. */
  [key: string]: unknown;
};

export interface Logger {
  debug(message: string, context?: LoggerContext): void;
  info(message: string, context?: LoggerContext): void;
  warn(message: string, context?: LoggerContext): void;
  error(message: string, context?: LoggerContext): void;
  withContext(context: LoggerContext): Logger;
}

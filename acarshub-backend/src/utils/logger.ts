/**
 * Logging utility for ACARS Hub Backend
 *
 * Matches the frontend logging structure (acarshub-react/src/utils/logger.ts)
 * Uses Pino for structured logging with levels.
 *
 * ## Why sync: true + direct stream instead of transport worker thread
 *
 * The `transport: { target: 'pino-pretty' }` pattern spawns a worker thread and
 * sends log records to it via an async sonic-boom pipe. Because better-sqlite3
 * executes SQLite operations synchronously (blocking the Node.js event loop),
 * the async pipe flushes are deferred until the event loop resumes — which means
 * all log lines written during a long migration (e.g. FTS rebuild + VACUUM) are
 * buffered in memory and only reach Docker's log collector as a single burst
 * when the migration finishes.
 *
 * The fix: pass a pino-pretty stream created directly in the main thread with
 * `sync: true`. This makes pino-pretty call fs.writeSync() for every line,
 * bypassing the event loop and ensuring each log line reaches stdout immediately
 * regardless of how long the event loop is blocked.
 */

import pino from "pino";
import pretty from "pino-pretty";

/**
 * Log levels (matching frontend)
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Logger interface (compatible with frontend logger API)
 */
export interface Logger {
  trace(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Get log level from environment
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL || "info";
  const validLevels: LogLevel[] = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ];

  // if the log level is a number, map the number to a log level string
  if (!Number.isNaN(Number(level))) {
    const numericLevel = Number(level);
    if (numericLevel > 6) return "fatal";
    if (numericLevel === 6) return "trace";
    if (numericLevel === 5) return "debug";
    if (numericLevel === 4) return "info";
    if (numericLevel === 3) return "warn";
    if (numericLevel <= 2) return "error";
  }

  return validLevels.includes(level.toLowerCase() as LogLevel)
    ? (level as LogLevel)
    : "info";
}

/**
 * Create a synchronous pino-pretty stream.
 *
 * Running pino-pretty in the main thread with sync: true means every log line
 * is written to stdout via fs.writeSync(), which is not subject to event-loop
 * scheduling. This prevents the "log burst at migration end" problem caused by
 * long-running synchronous SQLite operations blocking the event loop.
 */
const prettyStream = pretty({
  colorize: true,
  translateTime: "HH:MM:ss",
  ignore: "pid,hostname",
  sync: true,
});

/**
 * Root Pino logger — shared by all namespaced child loggers.
 *
 * Note: no `transport` option here; the stream is passed as the second
 * argument so pino-pretty runs in-process rather than in a worker thread.
 */
const pinoLogger = pino(
  {
    level: getLogLevel(),
  },
  prettyStream,
);

/**
 * Create a namespaced logger
 *
 * @param namespace Logger namespace (e.g., 'database', 'socket', 'server')
 * @returns Logger instance with namespace
 */
export function createLogger(namespace: string): Logger {
  const childLogger = pinoLogger.child({ namespace });

  return {
    trace: (message: string, meta?: Record<string, unknown>) => {
      childLogger.trace(meta || {}, message);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      childLogger.debug(meta || {}, message);
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      childLogger.info(meta || {}, message);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      childLogger.warn(meta || {}, message);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      childLogger.error(meta || {}, message);
    },
    fatal: (message: string, meta?: Record<string, unknown>) => {
      childLogger.fatal(meta || {}, message);
    },
  };
}

/**
 * Default logger (no namespace)
 */
export const logger = createLogger("app");

/**
 * Logging utility for ACARS Hub Backend
 *
 * Matches the frontend logging structure (acarshub-react/src/utils/logger.ts)
 * Uses Pino for structured logging with levels.
 */

import pino from "pino";

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
    console.log(`LOG_LEVEL is a number: ${level}, mapping to log level string`);
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
 * Create Pino logger instance
 */
const pinoLogger = pino({
  level: getLogLevel(),
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
});

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

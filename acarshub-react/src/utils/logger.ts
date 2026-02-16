// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import log from "loglevel";

/**
 * Log levels supported by the logger
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

/**
 * Individual log entry stored in the buffer
 */
export interface LogEntry {
  timestamp: string;
  level: Exclude<LogLevel, "silent">;
  module?: string;
  message: string[];
  stack?: string;
}

/**
 * In-memory log buffer for storing recent logs
 * Provides subscribe/unsubscribe for reactive updates
 */
class LogBuffer {
  private buffer: LogEntry[] = [];
  private maxSize = 1000; // Keep last 1000 logs
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private storageKey = "acarshub-logs";
  private persistenceEnabled = false;

  constructor() {
    // Load from localStorage if persistence is enabled
    this.loadFromStorage();
  }

  /**
   * Add a log entry to the buffer
   */
  add(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift(); // Remove oldest
    }

    // Save to localStorage if persistence is enabled
    if (this.persistenceEnabled) {
      this.saveToStorage();
    }

    this.notifyListeners();
  }

  /**
   * Get all logs in the buffer
   */
  getLogs(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Clear all logs from the buffer
   */
  clear(): void {
    this.buffer = [];
    if (this.persistenceEnabled) {
      localStorage.removeItem(this.storageKey);
    }
    this.notifyListeners();
  }

  /**
   * Subscribe to log updates
   * @returns Unsubscribe function
   */
  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Enable or disable localStorage persistence
   */
  setPersistence(enabled: boolean): void {
    this.persistenceEnabled = enabled;
    if (enabled) {
      this.saveToStorage();
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Get current persistence state
   */
  getPersistence(): boolean {
    return this.persistenceEnabled;
  }

  /**
   * Export logs as plain text
   */
  exportLogs(): string {
    return this.buffer
      .map((entry) => {
        const modulePrefix = entry.module ? ` [${entry.module}]` : "";
        const message = entry.message.join(" ");
        const stackSuffix = entry.stack ? `\n${entry.stack}` : "";
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${modulePrefix} ${message}${stackSuffix}`;
      })
      .join("\n");
  }

  /**
   * Export logs as JSON
   */
  exportLogsJSON(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  /**
   * Get statistics about the log buffer
   */
  getStats(): {
    total: number;
    error: number;
    warn: number;
    info: number;
    debug: number;
    trace: number;
  } {
    return {
      total: this.buffer.length,
      error: this.buffer.filter((l) => l.level === "error").length,
      warn: this.buffer.filter((l) => l.level === "warn").length,
      info: this.buffer.filter((l) => l.level === "info").length,
      debug: this.buffer.filter((l) => l.level === "debug").length,
      trace: this.buffer.filter((l) => l.level === "trace").length,
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener(this.getLogs());
    });
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          enabled: boolean;
          logs: LogEntry[];
        };
        this.persistenceEnabled = parsed.enabled || false;
        if (this.persistenceEnabled && parsed.logs) {
          this.buffer = parsed.logs;
        }
      }
    } catch (e) {
      console.error("Failed to load logs from storage", e);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        enabled: this.persistenceEnabled,
        logs: this.buffer,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (_e) {
      // Storage quota exceeded, clear old logs
      this.buffer = this.buffer.slice(-500);
      try {
        const data = {
          enabled: this.persistenceEnabled,
          logs: this.buffer,
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      } catch (e2) {
        console.error("Failed to save logs to storage", e2);
      }
    }
  }
}

/**
 * Global log buffer instance
 */
export const logBuffer = new LogBuffer();

/**
 * Serialize a value for logging (handles objects, errors, etc.)
 */
function serializeValue(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Initialize the logger with custom method factory
 * Intercepts all log calls to add timestamps and store in buffer
 */
function initLogger(): void {
  const originalFactory = log.methodFactory;

  log.methodFactory = (methodName, logLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);

    return (...messages: unknown[]) => {
      const timestamp = new Date().toISOString();
      const level = methodName as Exclude<LogLevel, "silent">;

      // Serialize messages
      const serializedMessages = messages.map(serializeValue);

      // Extract stack trace if first argument is an Error
      const stack =
        messages[0] instanceof Error ? messages[0].stack : undefined;

      // Convert loggerName to string or undefined
      const moduleName =
        typeof loggerName === "string" ? loggerName : undefined;

      // Add to buffer
      logBuffer.add({
        timestamp,
        level,
        module: moduleName,
        message: serializedMessages,
        stack,
      });

      // Still log to console
      const prefix = moduleName ? `[${moduleName}]` : "";
      rawMethod(`[${timestamp}]${prefix}`, ...messages);
    };
  };

  // Set default level based on environment
  const defaultLevel = import.meta.env.PROD ? "warn" : "debug";
  log.setLevel(defaultLevel);
}

// Initialize on module load
initLogger();

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  log.setLevel(level);
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return log.getLevel() as unknown as LogLevel;
}

/**
 * Sync logger with settings store
 * Call this after settings store is initialized
 */
export function syncLoggerWithSettings(
  logLevel: LogLevel,
  persistLogs: boolean,
): void {
  setLogLevel(logLevel);
  logBuffer.setPersistence(persistLogs);
}

/**
 * Create a module-specific logger
 * @param moduleName - Name of the module (e.g., 'socket', 'map', 'store')
 */
export function createLogger(moduleName: string): log.Logger {
  return log.getLogger(moduleName);
}

/**
 * Default logger instance
 */
export default log;

/**
 * Pre-configured module loggers for common areas
 */
export const socketLogger = createLogger("socket");
export const mapLogger = createLogger("map");
export const storeLogger = createLogger("store");
export const uiLogger = createLogger("ui");

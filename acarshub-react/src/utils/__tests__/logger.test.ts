// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

// ----------------------------------------------------------------------------
// logger.ts — frontend loglevel wrapper + in-memory LogBuffer.
//
// Surface under test:
//
//   LogBuffer
//     - add(): id increments, ring-buffer trim at maxSize (1000), listener
//       notification, optional localStorage persistence
//     - getLogs(): defensive copy
//     - clear(): empties buffer, clears storage, notifies
//     - subscribe()/unsubscribe via returned disposer
//     - setPersistence(true)  — saves snapshot
//     - setPersistence(false) — removes storage key
//     - getStats(): per-level counts
//     - exportLogs() / exportLogsJSON(): formatting
//     - constructor loads from storage when persistence flag is true
//     - storage-quota-exceeded fallback: truncate to last 500 and retry
//
//   loglevel methodFactory wiring (verified indirectly)
//     - createLogger("x").info("hello") puts a LogEntry in the buffer with
//       the matching module, level, timestamp, and serialized message
//     - first-arg Error captures .stack
//     - non-string moduleName (loglevel allows symbols internally) coerces
//       to undefined
//     - objects round-trip via JSON.stringify; circular objects fall back
//       to String()
//
//   setLogLevel / getLogLevel / syncLoggerWithSettings
//
// Because LogBuffer is a module-level singleton (`export const logBuffer`),
// every test that wants a fresh buffer must `vi.resetModules()` + dynamic
// import. We also clear localStorage before each import so the constructor's
// loadFromStorage() doesn't carry state across tests.
// ----------------------------------------------------------------------------

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

type LoggerModule = typeof import("../logger");

async function importFresh(): Promise<LoggerModule> {
  vi.resetModules();
  // Clear *before* import so the module's constructor sees an empty store.
  localStorage.clear();

  // CRITICAL: vi.resetModules() does NOT reset externalized node_modules
  // like `loglevel`, so the named-logger cache (`_loggersByName`) survives
  // across tests. That cache holds Logger instances whose method factories
  // were captured at *first* construction time — which means a `socketLogger`
  // created in test N+1's fresh module will be the SAME object as test N's,
  // closing over test N's `logBuffer`, not the new one.
  //
  // Workaround: load loglevel ourselves, grab its `_loggersByName` accessor
  // via the public `getLoggers()` API, and wipe it. This forces the
  // about-to-be-imported logger.ts to create fresh named-logger instances
  // with the current methodFactory and current logBuffer reference.
  const loglevel = (await import("loglevel")).default;
  const loggers = loglevel.getLoggers();
  for (const k of Object.keys(loggers)) delete loggers[k];

  return import("../logger");
}

let consoleErrorSpy: MockInstance;

beforeEach(() => {
  // Silence the intentional console.error calls in loadFromStorage /
  // saveToStorage fallbacks so test output stays readable.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// LogBuffer.add / getLogs
// ---------------------------------------------------------------------------

describe("logBuffer.add", () => {
  it("appends entries with monotonically increasing ids", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t1",
      level: "info",
      message: ["a"],
    });
    logBuffer.add({
      timestamp: "t2",
      level: "info",
      message: ["b"],
    });
    const logs = logBuffer.getLogs();
    expect(logs.map((l) => l.id)).toEqual([1, 2]);
  });

  it("evicts the oldest entry once the 1000-entry cap is exceeded", async () => {
    const { logBuffer } = await importFresh();
    for (let i = 0; i < 1001; i++) {
      logBuffer.add({
        timestamp: String(i),
        level: "debug",
        message: [String(i)],
      });
    }
    const logs = logBuffer.getLogs();
    expect(logs).toHaveLength(1000);
    // First surviving entry should be the one with original index 1.
    expect(logs[0]?.timestamp).toBe("1");
    expect(logs.at(-1)?.timestamp).toBe("1000");
  });

  it("does not persist to localStorage when persistence is disabled", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["no-persist"],
    });
    expect(localStorage.getItem("acarshub-logs")).toBeNull();
  });
});

describe("logBuffer.getLogs", () => {
  it("returns a defensive copy", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    const first = logBuffer.getLogs();
    first.length = 0;
    expect(logBuffer.getLogs()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LogBuffer.clear
// ---------------------------------------------------------------------------

describe("logBuffer.clear", () => {
  it("empties the buffer and notifies listeners", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    const listener = vi.fn();
    logBuffer.subscribe(listener);
    logBuffer.clear();
    expect(logBuffer.getLogs()).toEqual([]);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it("removes the storage key when persistence is enabled", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.setPersistence(true);
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    expect(localStorage.getItem("acarshub-logs")).not.toBeNull();
    logBuffer.clear();
    expect(localStorage.getItem("acarshub-logs")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LogBuffer.subscribe
// ---------------------------------------------------------------------------

describe("logBuffer.subscribe", () => {
  it("fires the listener with a snapshot after each add()", async () => {
    const { logBuffer } = await importFresh();
    const listener = vi.fn();
    logBuffer.subscribe(listener);
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("returns an unsubscribe function that stops further notifications", async () => {
    const { logBuffer } = await importFresh();
    const listener = vi.fn();
    const unsub = logBuffer.subscribe(listener);
    unsub();
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LogBuffer.setPersistence + persistence reload
// ---------------------------------------------------------------------------

describe("logBuffer.setPersistence", () => {
  it("saves the current buffer when enabled", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "warn",
      message: ["before"],
    });
    logBuffer.setPersistence(true);
    const stored = JSON.parse(localStorage.getItem("acarshub-logs") ?? "null");
    expect(stored?.enabled).toBe(true);
    expect(stored?.logs).toHaveLength(1);
  });

  it("clears the storage key when disabled", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.setPersistence(true);
    logBuffer.add({
      timestamp: "t",
      level: "warn",
      message: ["x"],
    });
    logBuffer.setPersistence(false);
    expect(localStorage.getItem("acarshub-logs")).toBeNull();
    expect(logBuffer.getPersistence()).toBe(false);
  });

  it("getPersistence reflects the current state", async () => {
    const { logBuffer } = await importFresh();
    expect(logBuffer.getPersistence()).toBe(false);
    logBuffer.setPersistence(true);
    expect(logBuffer.getPersistence()).toBe(true);
  });
});

describe("LogBuffer constructor reload-from-storage", () => {
  it("restores prior logs when storage contains { enabled:true, logs:[...] }", async () => {
    localStorage.setItem(
      "acarshub-logs",
      JSON.stringify({
        enabled: true,
        logs: [
          { id: 7, timestamp: "old", level: "info", message: ["restored"] },
        ],
      }),
    );
    // No explicit clear in importFresh; emulate by manually resetting modules
    // without clearing storage.
    vi.resetModules();
    const { logBuffer } = await import("../logger");
    expect(logBuffer.getPersistence()).toBe(true);
    expect(logBuffer.getLogs()).toEqual([
      { id: 7, timestamp: "old", level: "info", message: ["restored"] },
    ]);
  });

  it("does not load logs when persistence flag is false in storage", async () => {
    localStorage.setItem(
      "acarshub-logs",
      JSON.stringify({
        enabled: false,
        logs: [
          { id: 1, timestamp: "x", level: "info", message: ["should-skip"] },
        ],
      }),
    );
    vi.resetModules();
    const { logBuffer } = await import("../logger");
    expect(logBuffer.getPersistence()).toBe(false);
    expect(logBuffer.getLogs()).toEqual([]);
  });

  it("survives malformed JSON in storage (logs to console.error, starts empty)", async () => {
    localStorage.setItem("acarshub-logs", "{not valid json");
    vi.resetModules();
    const { logBuffer } = await import("../logger");
    expect(logBuffer.getLogs()).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LogBuffer.saveToStorage quota-exceeded fallback
// ---------------------------------------------------------------------------

describe("logBuffer storage-quota fallback", () => {
  it("truncates to the last 500 entries and retries when setItem throws", async () => {
    const { logBuffer } = await importFresh();

    // Seed >500 entries WITHOUT persistence so we don't touch storage yet.
    for (let i = 0; i < 600; i++) {
      logBuffer.add({
        timestamp: String(i),
        level: "info",
        message: ["x"],
      });
    }

    // jsdom's localStorage installs setItem as an own-property on the
    // localStorage instance, not on Storage.prototype, so vi.spyOn(prototype)
    // never sees the calls. Replace the method on the instance instead.
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let calls = 0;
    const fakeSetItem = vi.fn((key: string, value: string) => {
      calls++;
      if (calls === 1) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      // 2nd call (truncate-retry) succeeds — delegate to the real impl
      // so the test environment behaves normally afterward.
      originalSetItem(key, value);
    });
    localStorage.setItem = fakeSetItem;

    try {
      logBuffer.setPersistence(true); // triggers saveToStorage → throw → truncate → retry

      expect(fakeSetItem).toHaveBeenCalledTimes(2);
      expect(logBuffer.getLogs().length).toBeLessThanOrEqual(500);
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  it("logs a console.error when even the truncated retry fails", async () => {
    const { logBuffer } = await importFresh();
    for (let i = 0; i < 600; i++) {
      logBuffer.add({
        timestamp: String(i),
        level: "info",
        message: ["x"],
      });
    }
    consoleErrorSpy.mockClear();

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const alwaysThrow = vi.fn(() => {
      throw new DOMException("still full", "QuotaExceededError");
    });
    localStorage.setItem = alwaysThrow;

    try {
      logBuffer.setPersistence(true); // both setItem calls throw

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to save logs to storage",
        expect.any(DOMException),
      );
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });
});

// ---------------------------------------------------------------------------
// LogBuffer.getStats / exportLogs / exportLogsJSON
// ---------------------------------------------------------------------------

describe("logBuffer.getStats", () => {
  it("counts entries per level", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({ timestamp: "1", level: "error", message: ["x"] });
    logBuffer.add({ timestamp: "2", level: "error", message: ["x"] });
    logBuffer.add({ timestamp: "3", level: "warn", message: ["x"] });
    logBuffer.add({ timestamp: "4", level: "info", message: ["x"] });
    logBuffer.add({ timestamp: "5", level: "debug", message: ["x"] });
    logBuffer.add({ timestamp: "6", level: "trace", message: ["x"] });
    expect(logBuffer.getStats()).toEqual({
      total: 6,
      error: 2,
      warn: 1,
      info: 1,
      debug: 1,
      trace: 1,
    });
  });

  it("returns zeros for an empty buffer", async () => {
    const { logBuffer } = await importFresh();
    expect(logBuffer.getStats()).toEqual({
      total: 0,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0,
    });
  });
});

describe("logBuffer.exportLogs (text format)", () => {
  it("formats each entry as [timestamp] [LEVEL] [module] message", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "2026-01-01T00:00:00Z",
      level: "info",
      module: "socket",
      message: ["connected", "to", "server"],
    });
    expect(logBuffer.exportLogs()).toBe(
      "[2026-01-01T00:00:00Z] [INFO] [socket] connected to server",
    );
  });

  it("omits the module prefix when module is undefined", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "warn",
      message: ["bare"],
    });
    expect(logBuffer.exportLogs()).toBe("[t] [WARN] bare");
  });

  it("appends the stack trace on a new line when present", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "error",
      message: ["boom"],
      stack: "Error: boom\n  at foo",
    });
    expect(logBuffer.exportLogs()).toBe(
      "[t] [ERROR] boom\nError: boom\n  at foo",
    );
  });
});

describe("logBuffer.exportLogsJSON", () => {
  it("returns indented JSON of the buffer", async () => {
    const { logBuffer } = await importFresh();
    logBuffer.add({
      timestamp: "t",
      level: "info",
      message: ["x"],
    });
    const parsed = JSON.parse(logBuffer.exportLogsJSON());
    expect(parsed).toEqual([
      { id: 1, timestamp: "t", level: "info", message: ["x"] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// methodFactory wiring — createLogger().<level>(...) feeds the buffer
// ---------------------------------------------------------------------------

describe("createLogger wiring", () => {
  it("captures level, module, and serialized message in the buffer", async () => {
    const { createLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("trace"); // ensure the level is permissive
    const moduleLog = createLogger("test-module");

    moduleLog.info("hello", 42, { k: "v" });

    const logs = logBuffer.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry?.level).toBe("info");
    expect(entry?.module).toBe("test-module");
    expect(entry?.message[0]).toBe("hello");
    expect(entry?.message[1]).toBe("42");
    expect(entry?.message[2]).toContain('"k": "v"'); // pretty-printed JSON
    expect(entry?.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
    );
  });

  it("extracts .stack when the first argument is an Error", async () => {
    const { createLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("trace");
    const err = new Error("oops");
    createLogger("err-mod").error(err);
    const entry = logBuffer.getLogs()[0];
    expect(entry?.stack).toBe(err.stack);
    // serializeValue returns err.message for Errors, not the full string
    expect(entry?.message[0]).toBe("oops");
  });

  it("serializes circular objects via String() fallback", async () => {
    const { createLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("trace");
    const circ: Record<string, unknown> = { name: "loop" };
    circ.self = circ;
    createLogger("circ").info(circ);
    const entry = logBuffer.getLogs()[0];
    // String({}) returns "[object Object]" — that's the documented fallback.
    expect(entry?.message[0]).toBe("[object Object]");
  });

  it("skips buffer entries when the level is below the configured threshold", async () => {
    const { createLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("error");
    createLogger("mod").debug("should be filtered");
    expect(logBuffer.getLogs()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setLogLevel / getLogLevel / syncLoggerWithSettings
// ---------------------------------------------------------------------------

describe("setLogLevel / getLogLevel", () => {
  it("round-trips: setLogLevel updates what getLogLevel returns", async () => {
    const { setLogLevel, getLogLevel } = await importFresh();
    setLogLevel("warn");
    // loglevel returns the numeric level; getLogLevel() casts to LogLevel.
    // We accept either the string "warn" or the numeric index 3 — pin the
    // behaviour to what loglevel actually emits today.
    const level = getLogLevel();
    // loglevel's getLevel() returns a number, so the cast is lossy but stable.
    expect([3, "warn"]).toContain(level as unknown);
  });

  it("'silent' suppresses all buffer writes", async () => {
    const { createLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("silent");
    createLogger("x").error("should not appear");
    expect(logBuffer.getLogs()).toEqual([]);
  });
});

describe("syncLoggerWithSettings", () => {
  it("applies both log level and persistence flag", async () => {
    const { syncLoggerWithSettings, logBuffer, createLogger } =
      await importFresh();
    syncLoggerWithSettings("error", true);

    expect(logBuffer.getPersistence()).toBe(true);

    const log = createLogger("x");
    log.debug("filtered");
    expect(logBuffer.getLogs()).toEqual([]);

    log.error("kept");
    expect(logBuffer.getLogs()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pre-configured module loggers
// ---------------------------------------------------------------------------

describe("pre-configured module loggers", () => {
  it("exposes named loggers for socket / map / store / ui", async () => {
    const mod = await importFresh();
    expect(mod.socketLogger).toBeDefined();
    expect(mod.mapLogger).toBeDefined();
    expect(mod.storeLogger).toBeDefined();
    expect(mod.uiLogger).toBeDefined();
  });

  it("uses the module name as the LogEntry.module field when invoked", async () => {
    const { socketLogger, logBuffer, setLogLevel } = await importFresh();
    setLogLevel("trace");
    socketLogger.info("connect");
    const entry = logBuffer.getLogs().at(-1);
    expect(entry?.module).toBe("socket");
  });
});

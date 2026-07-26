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
// logger.ts — backend Pino wrapper.
//
// The module is largely a thin facade around pino, but it carries two pieces of
// real logic worth pinning down:
//
//   1. getLogLevel() — env-var coercion with two notable branches:
//        - numeric strings ("0".."6") map to levels (6+ → trace, 5 → debug,
//          4 → info, 3 → warn, 2 → error, ≤1 → fatal)
//        - non-numeric strings fall through to a whitelist check
//          (case-insensitive); unknown values default to "info"
//
//   2. createLogger(namespace) — returns the public Logger API and forwards
//        each call to a pino child, passing the meta object first and the
//        message second (the opposite order of the public API).
//
// Because getLogLevel() runs at module-import time, we must `vi.resetModules()`
// + dynamic-import the module under test once per env-variation case. That is
// also why pino + pino-pretty are mocked via `vi.mock(...)` factories instead
// of `vi.doMock` — top-level mocks are hoisted before the dynamic import.
// ----------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock pino-pretty: the production code calls `pretty(...)` to build a
// Writable; we don't care about the return value, just that pino receives
// *something*. Return a sentinel.
// ---------------------------------------------------------------------------

vi.mock("pino-pretty", () => ({
  default: vi.fn(() => ({ __isMockStream: true })),
}));

// ---------------------------------------------------------------------------
// Mock pino. The factory captures the level passed at construction so tests
// can assert on it, and returns a child-logger spy whose level methods are
// individually observable.
// ---------------------------------------------------------------------------

interface ChildSpy {
  trace: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
}

let lastConstructorOptions: { level?: string } | undefined;
let lastChildBindings: Record<string, unknown> | undefined;
let childSpy: ChildSpy;

function makeChildSpy(): ChildSpy {
  const spy: ChildSpy = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    // child() returns another spy so namespaced loggers behave identically.
    child: vi.fn((bindings: Record<string, unknown>) => {
      lastChildBindings = bindings;
      return spy;
    }),
  };
  return spy;
}

vi.mock("pino", () => ({
  default: vi.fn((options: { level?: string }) => {
    lastConstructorOptions = options;
    childSpy = makeChildSpy();
    return childSpy;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Re-import the logger module after resetting Vitest's module cache. Use
 * this whenever a test mutates `process.env.MIN_LOG_LEVEL` — `getLogLevel()`
 * runs at import time, not on each createLogger call.
 */
async function importFresh(): Promise<typeof import("../logger.js")> {
  vi.resetModules();
  return import("../logger.js");
}

const originalLogLevel = process.env.MIN_LOG_LEVEL;

beforeEach(() => {
  lastConstructorOptions = undefined;
  lastChildBindings = undefined;
});

afterEach(() => {
  // Restore the env so tests run in any order without leaking state.
  if (originalLogLevel === undefined) {
    delete process.env.MIN_LOG_LEVEL;
  } else {
    process.env.MIN_LOG_LEVEL = originalLogLevel;
  }
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getLogLevel — exercised indirectly via the constructor options passed to
// pino. The function is not exported, so this is the only honest way to
// test it: import the module under different MIN_LOG_LEVEL values and check
// what level the singleton ends up configured with.
// ---------------------------------------------------------------------------

describe("getLogLevel (via pino constructor)", () => {
  it("defaults to 'info' when MIN_LOG_LEVEL is unset", async () => {
    delete process.env.MIN_LOG_LEVEL;
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("info");
  });

  it("accepts known string levels verbatim", async () => {
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
      process.env.MIN_LOG_LEVEL = level;
      await importFresh();
      expect(lastConstructorOptions?.level).toBe(level);
    }
  });

  it("accepts known string levels case-insensitively", async () => {
    // Note: the production code lowercases for the whitelist check but
    // returns the original string. That's the contract being pinned.
    process.env.MIN_LOG_LEVEL = "DEBUG";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("DEBUG");
  });

  it("falls back to 'info' for unknown string levels", async () => {
    process.env.MIN_LOG_LEVEL = "verbose";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("info");
  });

  it("maps numeric '6' (and above) to 'trace'", async () => {
    process.env.MIN_LOG_LEVEL = "6";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("trace");

    process.env.MIN_LOG_LEVEL = "99";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("trace");
  });

  it("maps numeric '5' to 'debug'", async () => {
    process.env.MIN_LOG_LEVEL = "5";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("debug");
  });

  it("maps numeric '4' to 'info'", async () => {
    process.env.MIN_LOG_LEVEL = "4";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("info");
  });

  it("maps numeric '3' to 'warn'", async () => {
    process.env.MIN_LOG_LEVEL = "3";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("warn");
  });

  it("maps numeric '2' to 'error'", async () => {
    process.env.MIN_LOG_LEVEL = "2";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("error");
  });

  it("maps numeric '1' and '0' to 'fatal'", async () => {
    process.env.MIN_LOG_LEVEL = "1";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("fatal");

    process.env.MIN_LOG_LEVEL = "0";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("fatal");
  });

  it("treats negative numeric values as 'fatal' (≤1 branch)", async () => {
    process.env.MIN_LOG_LEVEL = "-5";
    await importFresh();
    expect(lastConstructorOptions?.level).toBe("fatal");
  });
});

// ---------------------------------------------------------------------------
// createLogger — public API surface
// ---------------------------------------------------------------------------

describe("createLogger", () => {
  it("creates a pino child logger with the namespace binding", async () => {
    const { createLogger } = await importFresh();
    createLogger("database");
    expect(lastChildBindings).toEqual({ namespace: "database" });
  });

  it("returns an object exposing all six log methods", async () => {
    const { createLogger } = await importFresh();
    const log = createLogger("test");
    for (const method of [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ] as const) {
      expect(typeof log[method]).toBe("function");
    }
  });

  it("forwards .info() to childLogger.info with (meta, message) order", async () => {
    const { createLogger } = await importFresh();
    const log = createLogger("test");
    log.info("hello world", { foo: "bar" });
    expect(childSpy.info).toHaveBeenCalledTimes(1);
    expect(childSpy.info).toHaveBeenCalledWith({ foo: "bar" }, "hello world");
  });

  it("defaults meta to {} when omitted, matching pino's expected signature", async () => {
    const { createLogger } = await importFresh();
    const log = createLogger("test");
    log.warn("no meta");
    expect(childSpy.warn).toHaveBeenCalledWith({}, "no meta");
  });

  it.each([
    ["trace", "trace-msg"],
    ["debug", "debug-msg"],
    ["info", "info-msg"],
    ["warn", "warn-msg"],
    ["error", "error-msg"],
    ["fatal", "fatal-msg"],
  ] as const)(
    "forwards .%s() to the matching pino method",
    async (method, msg) => {
      const { createLogger } = await importFresh();
      const log = createLogger("test");
      log[method](msg, { k: 1 });
      expect(childSpy[method]).toHaveBeenCalledWith({ k: 1 }, msg);
    },
  );

  it("creates independent loggers per call — each gets its own child binding", async () => {
    const { createLogger } = await importFresh();
    createLogger("db");
    expect(lastChildBindings).toEqual({ namespace: "db" });
    createLogger("socket");
    expect(lastChildBindings).toEqual({ namespace: "socket" });
    // child() called three times total: once for the module-level
    // `logger = createLogger("app")` at import, plus the two explicit
    // createLogger() calls above.
    expect(childSpy.child).toHaveBeenCalledTimes(3);
  });

  it("exports a default 'app'-namespaced logger as `logger`", async () => {
    const mod = await importFresh();
    // The module-level `logger` export is created at import time with the
    // 'app' namespace. Because our mock returns the same childSpy regardless
    // of bindings, we verify the binding via lastChildBindings.
    expect(mod.logger).toBeDefined();
    expect(typeof mod.logger.info).toBe("function");
    // The most recent child() call comes from `export const logger =
    // createLogger("app")` running at module load.
    expect(lastChildBindings).toEqual({ namespace: "app" });
  });
});

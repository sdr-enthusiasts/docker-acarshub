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

/**
 * Unit tests for services/timeseries-cache.ts
 *
 * Strategy:
 *  - The database layer (getDatabase, timeseriesStats) is mocked so no SQLite
 *    process is needed.  buildTimeSeriesResponse is also exported and tested
 *    directly to verify the query logic is called with correct parameters.
 *  - vi.useFakeTimers() is used for all timer tests so we can advance time
 *    without real delays.
 *  - resetCacheForTesting() is called in afterEach to restore module state.
 *
 * Coverage:
 *   getCachedTimeSeries       — returns null before init, data after
 *   isCacheReady              — false before / true after all 8 periods warmed
 *   initTimeSeriesCache       — warms all periods, sets broadcaster, arms timers
 *   stopTimeSeriesCache       — clears timers (no callbacks fire after stop)
 *   buildTimeSeriesResponse   — calls DB for each of the two query paths
 *   broadcaster               — called on each scheduled refresh, not at init
 *   wall-clock timer alignment — first refresh fires at next boundary
 *   drift correction          — subsequent refreshes target boundary+N*interval
 *   regression: no DB hit on getCachedTimeSeries
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../db/schema.js", () => ({
  timeseriesStats: {
    timestamp: { name: "timestamp" },
    acarsCount: { name: "acars_count" },
    vdlmCount: { name: "vdlm_count" },
    hfdlCount: { name: "hfdl_count" },
    imslCount: { name: "imsl_count" },
    irdmCount: { name: "irdm_count" },
    totalCount: { name: "total_count" },
    errorCount: { name: "error_count" },
  },
}));

// Stub drizzle-orm operators so the ORM query builder works without a real DB
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  lte: vi.fn((col: unknown, val: unknown) => ({ lte: [col, val] })),
  sql: {
    raw: vi.fn((s: string) => ({ sqlRaw: s })),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { getDatabase } from "../../db/index.js";
import {
  ALL_TIME_PERIODS,
  type TimePeriod,
  type TimeSeriesResponse,
} from "../../utils/timeseries.js";
import {
  buildTimeSeriesResponse,
  getCachedTimeSeries,
  initTimeSeriesCache,
  isCacheReady,
  resetCacheForTesting,
  stopTimeSeriesCache,
} from "../timeseries-cache.js";

// ---------------------------------------------------------------------------
// Typed alias
// ---------------------------------------------------------------------------

const mockGetDatabase = vi.mocked(getDatabase);

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock DB object whose select() chain and all() returns `rows`,
 * and whose all(sqlRaw) also returns `rows`.
 */
function makeMockDb(
  rows: Array<{
    timestamp?: number;
    bucket_timestamp?: number;
    acars_count?: number;
    vdlm_count?: number;
    hfdl_count?: number;
    imsl_count?: number;
    irdm_count?: number;
    total_count?: number;
    error_count?: number;
    acarsCount?: number;
    vdlmCount?: number;
    hfdlCount?: number;
    imslCount?: number;
    irdmCount?: number;
    totalCount?: number;
    errorCount?: number;
  }> = [],
) {
  const allFn = vi.fn().mockReturnValue(rows);
  const orderByFn = vi.fn().mockReturnValue({ all: allFn });
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn, all: allFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, all: allFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  return {
    select: selectFn,
    all: allFn, // for sql.raw path
    _allFn: allFn,
  };
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();

  // Set system time to 1 ms past a minute boundary so that
  // getNextWallClockBoundary(60_000) returns the NEXT minute boundary,
  // which is ~59 999 ms away.  This satisfies two constraints at once:
  //
  //   • Tests that advance 59 s expect NO broadcaster call — 59 000 < 59 999 ✓
  //   • Tests that advance 61 s expect broadcaster calls  — 61 000 > 59 999 ✓
  //
  // Using 30 s past midnight made the next boundary only 30 s away, so the
  // broadcaster fired well within the 59 s advance and the "not called yet"
  // assertion failed.  Using exactly midnight (epoch boundary) would give a
  // zero-delay timer (Math.ceil(0/60000)*60000 === 0) that fires immediately.
  // 1 ms past midnight is the smallest offset that avoids both pitfalls.
  vi.setSystemTime(new Date("2024-01-01T00:00:00.001Z")); // 1 ms past midnight

  // Default: return an empty-row DB mock for every call
  mockGetDatabase.mockReturnValue(
    makeMockDb() as unknown as ReturnType<typeof getDatabase>,
  );
});

afterEach(() => {
  resetCacheForTesting();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getCachedTimeSeries — before init
// ---------------------------------------------------------------------------

describe("getCachedTimeSeries — before initTimeSeriesCache", () => {
  it("returns null for every valid period before init", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(getCachedTimeSeries(period)).toBeNull();
    }
  });

  it("returns null for an invalid period string", () => {
    expect(getCachedTimeSeries("bad_period" as TimePeriod)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isCacheReady — before / after init
// ---------------------------------------------------------------------------

describe("isCacheReady", () => {
  it("returns false before init", () => {
    expect(isCacheReady()).toBe(false);
  });

  it("returns true after all 8 periods are warmed by initTimeSeriesCache", () => {
    initTimeSeriesCache(vi.fn());
    expect(isCacheReady()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// initTimeSeriesCache — initial warm
// ---------------------------------------------------------------------------

describe("initTimeSeriesCache — initial warm", () => {
  it("populates getCachedTimeSeries for all 8 periods", () => {
    initTimeSeriesCache(vi.fn());

    for (const period of ALL_TIME_PERIODS) {
      const result = getCachedTimeSeries(period);
      expect(result).not.toBeNull();
      expect(result?.time_period).toBe(period);
    }
  });

  it("each cached response has start < end", () => {
    initTimeSeriesCache(vi.fn());

    for (const period of ALL_TIME_PERIODS) {
      const result = getCachedTimeSeries(period);
      expect(result?.start).toBeLessThan(result?.end ?? 0);
    }
  });

  it("each cached response has start and end in milliseconds (> 1e12)", () => {
    initTimeSeriesCache(vi.fn());

    for (const period of ALL_TIME_PERIODS) {
      const result = getCachedTimeSeries(period);
      expect(result?.start).toBeGreaterThan(1e12);
      expect(result?.end).toBeGreaterThan(1e12);
    }
  });

  it("each cached response has the correct time_period field", () => {
    initTimeSeriesCache(vi.fn());

    for (const period of ALL_TIME_PERIODS) {
      const result = getCachedTimeSeries(period);
      expect(result?.time_period).toBe(period);
    }
  });

  it("does NOT call the broadcaster during the initial warm", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);
    // The broadcaster should only fire on scheduled refreshes, not at init
    expect(broadcaster).not.toHaveBeenCalled();
  });

  it("is idempotent — subsequent calls are no-ops", () => {
    const broadcaster1 = vi.fn();
    initTimeSeriesCache(broadcaster1);

    // Capture state after first init
    const firstResult = getCachedTimeSeries("1hr");

    // Second call should be ignored
    const broadcaster2 = vi.fn();
    initTimeSeriesCache(broadcaster2);

    // getCachedTimeSeries should still return the first result (same reference)
    expect(getCachedTimeSeries("1hr")).toBe(firstResult);
    // broadcaster2 was never invoked since the second init was a no-op
    expect(broadcaster2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// stopTimeSeriesCache
// ---------------------------------------------------------------------------

describe("stopTimeSeriesCache", () => {
  it("prevents scheduled callbacks from firing after stop", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    stopTimeSeriesCache();

    // Advance past the next minute boundary — no refreshes should fire
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes

    expect(broadcaster).not.toHaveBeenCalled();
  });

  it("is safe to call before init (no-op)", () => {
    expect(() => stopTimeSeriesCache()).not.toThrow();
  });

  it("is safe to call multiple times", () => {
    initTimeSeriesCache(vi.fn());
    expect(() => {
      stopTimeSeriesCache();
      stopTimeSeriesCache();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Broadcaster — called on scheduled refresh, not at init
// ---------------------------------------------------------------------------

describe("broadcaster", () => {
  it("is called once per period on each scheduled refresh tick", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    // At init, broadcaster has NOT been called
    expect(broadcaster).not.toHaveBeenCalled();

    // Advance past the first minute boundary to trigger the 1hr/6hr/12hr timers.
    // getNextWallClockBoundary(60_000) is at most 60 s away.
    vi.advanceTimersByTime(61 * 1000);

    // Three periods share the 1-minute refresh interval (1hr, 6hr, 12hr)
    const calls = broadcaster.mock.calls as [TimePeriod, TimeSeriesResponse][];
    const calledPeriods = calls.map(([period]) => period);

    expect(calledPeriods).toContain("1hr");
    expect(calledPeriods).toContain("6hr");
    expect(calledPeriods).toContain("12hr");
  });

  it("passes the correct time_period in the broadcaster payload", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    vi.advanceTimersByTime(61 * 1000);

    for (const [period, data] of broadcaster.mock.calls as [
      TimePeriod,
      TimeSeriesResponse,
    ][]) {
      expect(data.time_period).toBe(period);
    }
  });

  it("does not call the broadcaster for a period until its own interval elapses", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    // Advance 59 seconds — no timer should have fired yet
    vi.advanceTimersByTime(59 * 1000);
    expect(broadcaster).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Wall-clock timer alignment
// ---------------------------------------------------------------------------

describe("wall-clock timer alignment", () => {
  it("the 1hr/6hr/12hr first refresh fires within 60 s of init", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    // Advance 60 s — every minute-aligned timer should have fired
    vi.advanceTimersByTime(60 * 1000 + 100);

    const calledPeriods = (broadcaster.mock.calls as [TimePeriod][]).map(
      ([p]) => p,
    );
    expect(calledPeriods).toContain("1hr");
    expect(calledPeriods).toContain("6hr");
    expect(calledPeriods).toContain("12hr");
  });

  it("the 24hr timer does NOT fire after only 1 minute", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    vi.advanceTimersByTime(61 * 1000);

    const calledPeriods = (broadcaster.mock.calls as [TimePeriod][]).map(
      ([p]) => p,
    );
    expect(calledPeriods).not.toContain("24hr");
  });

  it("the 24hr timer fires within 5 minutes of init", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    const calledPeriods = (broadcaster.mock.calls as [TimePeriod][]).map(
      ([p]) => p,
    );
    expect(calledPeriods).toContain("24hr");
  });

  it("the 1wk timer fires within 30 minutes of init", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    vi.advanceTimersByTime(30 * 60 * 1000 + 100);

    const calledPeriods = (broadcaster.mock.calls as [TimePeriod][]).map(
      ([p]) => p,
    );
    expect(calledPeriods).toContain("1wk");
  });
});

// ---------------------------------------------------------------------------
// Drift correction — subsequent refreshes target boundary + N * interval
// ---------------------------------------------------------------------------

describe("drift correction", () => {
  it("1hr refreshes again after another 60 s (recursive timer re-arms)", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    // First refresh cycle
    vi.advanceTimersByTime(61 * 1000);
    const countAfterFirst = (broadcaster.mock.calls as [TimePeriod][]).filter(
      ([p]) => p === "1hr",
    ).length;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);

    // Second refresh cycle — advance another full minute
    vi.advanceTimersByTime(60 * 1000);
    const countAfterSecond = (broadcaster.mock.calls as [TimePeriod][]).filter(
      ([p]) => p === "1hr",
    ).length;
    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });

  it("24hr refreshes again after another 5 minutes", () => {
    const broadcaster = vi.fn();
    initTimeSeriesCache(broadcaster);

    // Trigger first 24hr refresh
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);
    const countAfterFirst = (broadcaster.mock.calls as [TimePeriod][]).filter(
      ([p]) => p === "24hr",
    ).length;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);

    // Trigger second 24hr refresh
    vi.advanceTimersByTime(5 * 60 * 1000);
    const countAfterSecond = (broadcaster.mock.calls as [TimePeriod][]).filter(
      ([p]) => p === "24hr",
    ).length;
    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// buildTimeSeriesResponse — DB query paths
// ---------------------------------------------------------------------------

describe("buildTimeSeriesResponse", () => {
  it("returns a TimeSeriesResponse with the correct time_period field", () => {
    const result = buildTimeSeriesResponse("1hr");
    expect(result.time_period).toBe("1hr");
  });

  it("returns start and end in milliseconds (> 1e12)", () => {
    const result = buildTimeSeriesResponse("24hr");
    expect(result.start).toBeGreaterThan(1e12);
    expect(result.end).toBeGreaterThan(1e12);
  });

  it("start is earlier than end", () => {
    const result = buildTimeSeriesResponse("6hr");
    expect(result.start).toBeLessThan(result.end);
  });

  it("points matches data.length", () => {
    const result = buildTimeSeriesResponse("12hr");
    expect(result.points).toBe(result.data.length);
  });

  it("data timestamps are in milliseconds (> 1e12) when rows are present", () => {
    // Provide a single DB row so at least one data point exists
    const nowSec = Math.floor(Date.now() / 1000);
    const mockDb = makeMockDb([
      {
        timestamp: nowSec - 60,
        acarsCount: 3,
        vdlmCount: 0,
        hfdlCount: 0,
        imslCount: 0,
        irdmCount: 0,
        totalCount: 3,
        errorCount: 0,
      },
    ]);
    mockGetDatabase.mockReturnValue(
      mockDb as unknown as ReturnType<typeof getDatabase>,
    );

    const result = buildTimeSeriesResponse("1hr");

    for (const point of result.data) {
      expect(point.timestamp).toBeGreaterThan(1e12);
    }
  });

  it("calls getDatabase() once for the 1-min path (1hr)", () => {
    mockGetDatabase.mockClear();
    buildTimeSeriesResponse("1hr");
    expect(mockGetDatabase).toHaveBeenCalledTimes(1);
  });

  it("calls getDatabase() once for the downsampled path (24hr)", () => {
    mockGetDatabase.mockClear();
    buildTimeSeriesResponse("24hr");
    expect(mockGetDatabase).toHaveBeenCalledTimes(1);
  });

  it("uses sql.raw for periods with downsample > 60 (24hr, 1wk, 30day, 6mon, 1yr)", async () => {
    const { sql } = await import("drizzle-orm");
    const mockSqlRaw = vi.mocked((sql as unknown as { raw: Mock }).raw);

    const downsampledPeriods = ["24hr", "1wk", "30day", "6mon", "1yr"] as const;

    for (const period of downsampledPeriods) {
      mockSqlRaw.mockClear();
      buildTimeSeriesResponse(period);
      expect(mockSqlRaw).toHaveBeenCalledTimes(1);
    }
  });

  it("does NOT use sql.raw for periods with 1-min resolution (1hr, 6hr, 12hr)", async () => {
    const { sql } = await import("drizzle-orm");
    const mockSqlRaw = vi.mocked((sql as unknown as { raw: Mock }).raw);

    const oneMinPeriods = ["1hr", "6hr", "12hr"] as const;

    for (const period of oneMinPeriods) {
      mockSqlRaw.mockClear();
      buildTimeSeriesResponse(period);
      expect(mockSqlRaw).not.toHaveBeenCalled();
    }
  });

  it("zero-fills the result so all data timestamps are in milliseconds with step spacing", () => {
    // With an empty DB the result should still contain zero-filled buckets
    // whose timestamps are multiples of the downsample step (converted to ms)
    const result = buildTimeSeriesResponse("24hr"); // downsample = 300 s

    for (const point of result.data) {
      // Each point's timestamp (ms) rounded to seconds should be on a 300 s grid
      const ts = Math.round(point.timestamp / 1000);
      expect(ts % 300).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

describe("regression", () => {
  it("getCachedTimeSeries does NOT call getDatabase", () => {
    initTimeSeriesCache(vi.fn());
    mockGetDatabase.mockClear();

    getCachedTimeSeries("1hr");
    getCachedTimeSeries("1yr");

    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it("isCacheReady does NOT call getDatabase", () => {
    initTimeSeriesCache(vi.fn());
    mockGetDatabase.mockClear();

    isCacheReady();

    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it("stopTimeSeriesCache does NOT call getDatabase", () => {
    initTimeSeriesCache(vi.fn());
    mockGetDatabase.mockClear();

    stopTimeSeriesCache();

    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it("cached response is returned by reference (no re-query on repeated gets)", () => {
    initTimeSeriesCache(vi.fn());
    mockGetDatabase.mockClear();

    const first = getCachedTimeSeries("24hr");
    const second = getCachedTimeSeries("24hr");

    // Same object reference — no DB re-query
    expect(first).toBe(second);
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it("cache survives a failed DB call during warm — entry stays null, others succeed", () => {
    // Make the first getDatabase() call throw, leaving one period unwarmed
    let callCount = 0;
    mockGetDatabase.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error("DB not ready");
      }
      return makeMockDb() as unknown as ReturnType<typeof getDatabase>;
    });

    // Should not throw even if one period fails
    expect(() => initTimeSeriesCache(vi.fn())).not.toThrow();

    // At least 7 periods should be populated (the one that failed stays null)
    let populated = 0;
    for (const period of ALL_TIME_PERIODS) {
      if (getCachedTimeSeries(period) !== null) populated++;
    }
    expect(populated).toBeGreaterThanOrEqual(ALL_TIME_PERIODS.length - 1);
  });
});

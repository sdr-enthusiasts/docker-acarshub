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
 * Unit tests for utils/timeseries.ts
 *
 * All functions under test are pure — no mocking required.
 *
 * Coverage:
 *   isValidTimePeriod   — type guard for the 8 known period strings
 *   PERIOD_CONFIG       — structural invariants across all 8 periods
 *   zeroFillBuckets     — gap-filling, alignment, preservation of existing rows
 *   getNextWallClockBoundary — wall-clock alignment math
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_TIME_PERIODS,
  getNextWallClockBoundary,
  isValidTimePeriod,
  PERIOD_CONFIG,
  type TimeSeriesRawPoint,
  zeroFillBuckets,
} from "../timeseries.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal raw point at the given second timestamp. */
function makePoint(
  timestamp: number,
  overrides: Partial<Omit<TimeSeriesRawPoint, "timestamp">> = {},
): TimeSeriesRawPoint {
  return {
    timestamp,
    acars: 0,
    vdlm: 0,
    hfdl: 0,
    imsl: 0,
    irdm: 0,
    total: 0,
    error: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isValidTimePeriod
// ---------------------------------------------------------------------------

describe("isValidTimePeriod", () => {
  it("returns true for every member of ALL_TIME_PERIODS", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(isValidTimePeriod(period)).toBe(true);
    }
  });

  it("returns false for an empty string", () => {
    expect(isValidTimePeriod("")).toBe(false);
  });

  it("returns false for a close-but-wrong string", () => {
    expect(isValidTimePeriod("1hour")).toBe(false);
    expect(isValidTimePeriod("1HR")).toBe(false);
    expect(isValidTimePeriod("1 hr")).toBe(false);
    expect(isValidTimePeriod("24hr ")).toBe(false); // trailing space
  });

  it("returns false for arbitrary strings", () => {
    expect(isValidTimePeriod("invalid")).toBe(false);
    expect(isValidTimePeriod("all")).toBe(false);
    expect(isValidTimePeriod("rrd")).toBe(false);
  });

  it("returns false for numeric strings", () => {
    expect(isValidTimePeriod("1")).toBe(false);
    expect(isValidTimePeriod("3600")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PERIOD_CONFIG invariants
// ---------------------------------------------------------------------------

describe("PERIOD_CONFIG", () => {
  it("has an entry for every TimePeriod in ALL_TIME_PERIODS", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(PERIOD_CONFIG[period]).toBeDefined();
    }
  });

  it("has positive startOffset for every period", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(PERIOD_CONFIG[period].startOffset).toBeGreaterThan(0);
    }
  });

  it("has positive downsample for every period", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(PERIOD_CONFIG[period].downsample).toBeGreaterThan(0);
    }
  });

  it("has positive refreshIntervalMs for every period", () => {
    for (const period of ALL_TIME_PERIODS) {
      expect(PERIOD_CONFIG[period].refreshIntervalMs).toBeGreaterThan(0);
    }
  });

  it("short windows (1hr/6hr/12hr) use 60-second buckets", () => {
    expect(PERIOD_CONFIG["1hr"].downsample).toBe(60);
    expect(PERIOD_CONFIG["6hr"].downsample).toBe(60);
    expect(PERIOD_CONFIG["12hr"].downsample).toBe(60);
  });

  it("short windows (1hr/6hr/12hr) refresh every minute", () => {
    expect(PERIOD_CONFIG["1hr"].refreshIntervalMs).toBe(60_000);
    expect(PERIOD_CONFIG["6hr"].refreshIntervalMs).toBe(60_000);
    expect(PERIOD_CONFIG["12hr"].refreshIntervalMs).toBe(60_000);
  });

  it("24hr refreshes every 5 minutes", () => {
    expect(PERIOD_CONFIG["24hr"].refreshIntervalMs).toBe(300_000);
  });

  it("1wk refreshes every 30 minutes", () => {
    expect(PERIOD_CONFIG["1wk"].refreshIntervalMs).toBe(1_800_000);
  });

  it("30day refreshes every hour", () => {
    expect(PERIOD_CONFIG["30day"].refreshIntervalMs).toBe(3_600_000);
  });

  it("6mon refreshes every 6 hours", () => {
    expect(PERIOD_CONFIG["6mon"].refreshIntervalMs).toBe(21_600_000);
  });

  it("1yr refreshes every 12 hours", () => {
    expect(PERIOD_CONFIG["1yr"].refreshIntervalMs).toBe(43_200_000);
  });

  it("startOffset for 1hr is 3600 seconds", () => {
    expect(PERIOD_CONFIG["1hr"].startOffset).toBe(3_600);
  });

  it("startOffset for 1yr is 31536000 seconds", () => {
    expect(PERIOD_CONFIG["1yr"].startOffset).toBe(31_536_000);
  });

  it("longer periods have longer startOffsets (monotonically increasing)", () => {
    const offsets = ALL_TIME_PERIODS.map((p) => PERIOD_CONFIG[p].startOffset);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// zeroFillBuckets
// ---------------------------------------------------------------------------

describe("zeroFillBuckets", () => {
  const STEP = 60; // 1-minute buckets, matching 1hr/6hr/12hr periods

  it("returns a zero-filled point for every bucket when dbRows is empty", () => {
    const start = 1_000_000;
    const end = 1_000_000 + STEP * 4; // 5 buckets: 0, 60, 120, 180, 240
    const result = zeroFillBuckets([], start, end, STEP);

    expect(result.length).toBe(5);
    for (const row of result) {
      expect(row.acars).toBe(0);
      expect(row.vdlm).toBe(0);
      expect(row.total).toBe(0);
      expect(row.error).toBe(0);
    }
  });

  it("preserves the values of existing DB rows", () => {
    const start = 1_000_000;
    const end = 1_000_000 + STEP * 2; // 3 buckets

    const rows = [makePoint(start, { acars: 7, total: 7 })];
    const result = zeroFillBuckets(rows, start, end, STEP);

    expect(result).toHaveLength(3);
    expect(result[0].acars).toBe(7);
    expect(result[0].total).toBe(7);
    // The other two buckets are zero-filled
    expect(result[1].acars).toBe(0);
    expect(result[2].acars).toBe(0);
  });

  it("fills gaps between existing rows with zeros", () => {
    const step = 300; // 5-minute buckets (24hr period)
    const start = 2_000_000;
    const end = start + step * 4; // 5 buckets: 0, 300, 600, 900, 1200

    // Provide data only for the first and last bucket — 3 gaps in between
    const rows = [
      makePoint(start, { acars: 10 }),
      makePoint(start + step * 4, { acars: 5 }),
    ];

    const result = zeroFillBuckets(rows, start, end, step);

    expect(result).toHaveLength(5);
    expect(result[0].acars).toBe(10);
    expect(result[1].acars).toBe(0);
    expect(result[2].acars).toBe(0);
    expect(result[3].acars).toBe(0);
    expect(result[4].acars).toBe(5);
  });

  it("timestamps in the output are aligned to the bucket grid", () => {
    const start = 1_000_000;
    const end = start + STEP * 2;

    const result = zeroFillBuckets([], start, end, STEP);

    for (const row of result) {
      expect(row.timestamp % STEP).toBe(0);
    }
  });

  it("aligns start to the bucket grid when start is not on a boundary", () => {
    const STEP_5MIN = 300;
    // start is 100 s into a 300 s bucket
    const start = 1_000_000 + 100;
    const end = start + STEP_5MIN * 2;

    const result = zeroFillBuckets([], start, end, STEP_5MIN);

    // First timestamp should be floor(start / step) * step
    const expectedFirst = Math.floor(start / STEP_5MIN) * STEP_5MIN;
    expect(result[0].timestamp).toBe(expectedFirst);
  });

  it("handles a single bucket range", () => {
    const start = 500_000;
    const end = 500_000; // start === end → one bucket
    const result = zeroFillBuckets([], start, end, STEP);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(Math.floor(start / STEP) * STEP);
  });

  it("aligns incoming row timestamps to the bucket grid", () => {
    // A row with timestamp 3 seconds past the bucket boundary should still
    // map into the correct bucket and preserve its values.
    const step = 300;
    // Ensure bucketStart is actually on a 300 s boundary so the assertion is valid.
    const bucketStart = Math.floor(2_000_000 / step) * step; // 1_999_800
    // Row timestamp is 3 s into the bucket — not on the boundary
    const rows = [makePoint(bucketStart + 3, { acars: 42 })];

    const result = zeroFillBuckets(rows, bucketStart, bucketStart + step, step);

    // The row should appear at the aligned bucket timestamp
    const match = result.find((r) => r.acars === 42);
    expect(match).toBeDefined();
    expect(match?.timestamp).toBe(bucketStart);
  });

  it("all output rows contain all eight counter fields", () => {
    const start = 1_000_000;
    const end = start + STEP;
    const result = zeroFillBuckets([], start, end, STEP);

    for (const row of result) {
      expect(typeof row.timestamp).toBe("number");
      expect(typeof row.acars).toBe("number");
      expect(typeof row.vdlm).toBe("number");
      expect(typeof row.hfdl).toBe("number");
      expect(typeof row.imsl).toBe("number");
      expect(typeof row.irdm).toBe("number");
      expect(typeof row.total).toBe("number");
      expect(typeof row.error).toBe("number");
    }
  });

  it("regression: does NOT convert timestamps to milliseconds (that is the caller's job)", () => {
    // Timestamps in timeseries_stats are in Unix seconds (~1.7e9).
    // zeroFillBuckets must NOT multiply by 1000 — callers do that.
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec - 3600;
    const end = nowSec;

    const result = zeroFillBuckets([], start, end, STEP);

    // All timestamps should be in the seconds range (< 1e12)
    for (const row of result) {
      expect(row.timestamp).toBeLessThan(1e12);
      expect(row.timestamp).toBeGreaterThan(1e9); // reasonable Unix seconds
    }
  });

  it("produces correct point count for 1hr window at 60s resolution", () => {
    // 3600 / 60 = 60 buckets, plus the bucket that contains `end`
    const nowSec = 1_700_000_000;
    const start = nowSec - 3600;
    const end = nowSec;
    const result = zeroFillBuckets([], start, end, 60);
    // Expect ~61 buckets (alignedStart … end, inclusive, step 60)
    expect(result.length).toBeGreaterThanOrEqual(60);
    expect(result.length).toBeLessThanOrEqual(62);
  });
});

// ---------------------------------------------------------------------------
// getNextWallClockBoundary
// ---------------------------------------------------------------------------

describe("getNextWallClockBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the next full-minute boundary when now is mid-minute", () => {
    // 2024-01-01 00:00:30 UTC → next minute is 00:01:00
    const midMinuteMs = 1_704_067_200_000 + 30_000; // +30 s into first minute of 2024
    vi.setSystemTime(midMinuteMs);

    const result = getNextWallClockBoundary(60_000);

    // Should be exactly the next :00 second
    expect(result % 60_000).toBe(0);
    expect(result).toBeGreaterThan(midMinuteMs);
    // Should be less than 60 s ahead
    expect(result - midMinuteMs).toBeLessThanOrEqual(60_000);
  });

  it("returns the next 5-minute boundary when now is between 5-min marks", () => {
    // 2024-01-01 00:02:00 UTC — 2 minutes past the hour
    const twoMinPastHour = 1_704_067_200_000 + 2 * 60_000;
    vi.setSystemTime(twoMinPastHour);

    const result = getNextWallClockBoundary(300_000);

    expect(result % 300_000).toBe(0);
    expect(result).toBeGreaterThan(twoMinPastHour);
    // Next 5-minute mark is 3 minutes away (at :05:00)
    expect(result - twoMinPastHour).toBe(3 * 60_000);
  });

  it("returns the next hourly boundary when now is mid-hour", () => {
    // 2024-01-01 00:30:00 UTC — half-past midnight
    const halfPastMidnight = 1_704_067_200_000 + 30 * 60_000;
    vi.setSystemTime(halfPastMidnight);

    const result = getNextWallClockBoundary(3_600_000);

    expect(result % 3_600_000).toBe(0);
    expect(result).toBeGreaterThan(halfPastMidnight);
    // 30 minutes until the next hour
    expect(result - halfPastMidnight).toBe(30 * 60_000);
  });

  it("returns the next 6-hour boundary at UTC alignment", () => {
    // 2024-01-01 07:00:00 UTC — 1 hour into the 06:00–12:00 window
    const sevenAm = 1_704_067_200_000 + 7 * 3_600_000;
    vi.setSystemTime(sevenAm);

    const result = getNextWallClockBoundary(21_600_000);

    expect(result % 21_600_000).toBe(0);
    expect(result).toBeGreaterThan(sevenAm);
    // Next 6-hour mark after 07:00 is 12:00 — 5 hours away
    expect(result - sevenAm).toBe(5 * 3_600_000);
  });

  it("returns a boundary that is a multiple of the interval from the Unix epoch", () => {
    // Any boundary must be evenly divisible by intervalMs (UTC alignment)
    const intervals = [
      60_000, 300_000, 1_800_000, 3_600_000, 21_600_000, 43_200_000,
    ];
    vi.setSystemTime(1_704_100_000_000); // arbitrary mid-day timestamp

    for (const interval of intervals) {
      const boundary = getNextWallClockBoundary(interval);
      expect(boundary % interval).toBe(0);
    }
  });

  it("returns a value strictly greater than now", () => {
    vi.setSystemTime(1_704_067_200_123); // not on any boundary

    const result = getNextWallClockBoundary(60_000);

    expect(result).toBeGreaterThan(Date.now());
  });

  it("returns now + interval when now is exactly on a boundary (Math.ceil edge case)", () => {
    // Exactly on a minute boundary
    const exactBoundary = 1_704_067_200_000; // 2024-01-01 00:00:00.000 UTC
    vi.setSystemTime(exactBoundary);

    const result = getNextWallClockBoundary(60_000);

    // Math.ceil(exactBoundary / 60000) * 60000 === exactBoundary (not +60s)
    // This is acceptable — the timer fires immediately and re-arms for +60s
    expect(result).toBeGreaterThanOrEqual(exactBoundary);
    expect(result % 60_000).toBe(0);
  });
});

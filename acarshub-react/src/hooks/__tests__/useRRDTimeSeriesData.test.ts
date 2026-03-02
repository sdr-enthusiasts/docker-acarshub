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

/**
 * Tests for useRRDTimeSeriesData (store-selector mode).
 *
 * The hook no longer emits socket requests or maintains local state.
 * It is a thin Zustand selector over useAppStore.timeSeriesCache.
 *
 * Test strategy:
 *  - Seed the store's timeSeriesCache directly with act() before rendering.
 *  - Assert the hook surfaces the correct data / loading / timeRange values.
 *  - Verify that updating the cache triggers a re-render.
 *  - Verify backward-compat: the unused autoRefresh / refreshInterval params
 *    do not cause errors.
 *  - Regression: no socket.emit should ever be called by this hook.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import type { TimeSeriesCacheEntry } from "../../types/timeseries";
import { useRRDTimeSeriesData } from "../useRRDTimeSeriesData";

// ---------------------------------------------------------------------------
// Mock socket service — must never be called by the new hook
// ---------------------------------------------------------------------------

const mockSocket = {
  connected: true,
  id: "test-socket-id",
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock("../../services/socket", () => ({
  socketService: {
    connect: vi.fn(() => mockSocket),
    disconnect: vi.fn(),
    isInitialized: vi.fn(() => true),
    getSocket: vi.fn(() => mockSocket),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1_704_067_200_000; // 2024-01-01T00:00:00.000Z in ms

/**
 * Build a realistic TimeSeriesCacheEntry for a given period.
 * Data array contains a single zero-filled point for simplicity.
 */
function makeEntry(
  period: TimeSeriesCacheEntry["time_period"],
  overrides: Partial<TimeSeriesCacheEntry> = {},
): TimeSeriesCacheEntry {
  const startOffset =
    period === "1hr"
      ? 3_600_000
      : period === "6hr"
        ? 21_600_000
        : period === "24hr"
          ? 86_400_000
          : 3_600_000;

  return {
    time_period: period,
    data: [
      {
        timestamp: NOW - 60_000,
        acars: 2,
        vdlm: 1,
        hfdl: 0,
        imsl: 0,
        irdm: 0,
        total: 3,
        error: 0,
      },
    ],
    start: NOW - startOffset,
    end: NOW,
    points: 1,
    ...overrides,
  };
}

/**
 * Write an entry into the store's timeSeriesCache.
 */
function seedCache(entry: TimeSeriesCacheEntry): void {
  act(() => {
    useAppStore.getState().setTimeSeriesData(entry.time_period, entry);
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset the time-series cache before each test
  act(() => {
    useAppStore.setState({ timeSeriesCache: new Map() });
  });
  mockSocket.emit.mockClear();
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state — cache miss
// ---------------------------------------------------------------------------

describe("loading state (cache miss)", () => {
  it("returns loading=true when the period is not yet in the cache", () => {
    const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

    expect(result.current.loading).toBe(true);
  });

  it("returns an empty data array when loading", () => {
    const { result } = renderHook(() => useRRDTimeSeriesData("24hr"));

    expect(result.current.data).toHaveLength(0);
  });

  it("returns null timeRange when loading", () => {
    const { result } = renderHook(() => useRRDTimeSeriesData("1wk"));

    expect(result.current.timeRange).toBeNull();
  });

  it("returns null error when loading (no error state in push model)", () => {
    const { result } = renderHook(() => useRRDTimeSeriesData("6hr"));

    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Populated state — cache hit
// ---------------------------------------------------------------------------

describe("populated state (cache hit)", () => {
  it("returns loading=false when the period is in the cache", () => {
    seedCache(makeEntry("1hr"));
    const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

    expect(result.current.loading).toBe(false);
  });

  it("returns the data array from the cache entry", () => {
    const entry = makeEntry("6hr");
    seedCache(entry);
    const { result } = renderHook(() => useRRDTimeSeriesData("6hr"));

    expect(result.current.data).toHaveLength(entry.data.length);
    expect(result.current.data[0].acars).toBe(entry.data[0].acars);
    expect(result.current.data[0].timestamp).toBe(entry.data[0].timestamp);
  });

  it("returns the timeRange with start and end from the cache entry", () => {
    const entry = makeEntry("24hr");
    seedCache(entry);
    const { result } = renderHook(() => useRRDTimeSeriesData("24hr"));

    expect(result.current.timeRange).toEqual({
      start: entry.start,
      end: entry.end,
    });
  });

  it("returns null error even when data is present", () => {
    seedCache(makeEntry("12hr"));
    const { result } = renderHook(() => useRRDTimeSeriesData("12hr"));

    expect(result.current.error).toBeNull();
  });

  it("returns data with correct total count field", () => {
    const entry = makeEntry("1hr", {
      data: [
        {
          timestamp: NOW - 60_000,
          acars: 5,
          vdlm: 3,
          hfdl: 1,
          imsl: 0,
          irdm: 0,
          total: 9,
          error: 0,
        },
      ],
    });
    seedCache(entry);
    const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

    expect(result.current.data[0].total).toBe(9);
    expect(result.current.data[0].error).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reactivity — cache update triggers re-render
// ---------------------------------------------------------------------------

describe("reactivity (cache updates)", () => {
  it("transitions from loading to populated when the cache entry arrives", () => {
    const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Simulate a push from the backend arriving
    seedCache(makeEntry("1hr"));

    // Now populated
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(1);
  });

  it("updates data when the cache entry is refreshed by a new push", () => {
    const firstEntry = makeEntry("6hr", {
      data: [
        {
          timestamp: NOW - 60_000,
          acars: 1,
          vdlm: 0,
          hfdl: 0,
          imsl: 0,
          irdm: 0,
          total: 1,
          error: 0,
        },
      ],
      points: 1,
    });
    seedCache(firstEntry);

    const { result } = renderHook(() => useRRDTimeSeriesData("6hr"));
    expect(result.current.data[0].acars).toBe(1);

    // Backend pushes a refreshed entry
    const secondEntry = makeEntry("6hr", {
      data: [
        {
          timestamp: NOW - 60_000,
          acars: 7,
          vdlm: 2,
          hfdl: 0,
          imsl: 0,
          irdm: 0,
          total: 9,
          error: 0,
        },
      ],
      points: 1,
    });
    seedCache(secondEntry);

    expect(result.current.data[0].acars).toBe(7);
    expect(result.current.data[0].total).toBe(9);
  });

  it("updates timeRange when the cache entry is refreshed", () => {
    const firstEntry = makeEntry("24hr");
    seedCache(firstEntry);

    const { result } = renderHook(() => useRRDTimeSeriesData("24hr"));
    expect(result.current.timeRange?.start).toBe(firstEntry.start);

    const newEnd = NOW + 60_000;
    const secondEntry = makeEntry("24hr", {
      start: NOW - 86_400_000,
      end: newEnd,
    });
    seedCache(secondEntry);

    expect(result.current.timeRange?.end).toBe(newEnd);
  });
});

// ---------------------------------------------------------------------------
// Period isolation — only the requested period is surfaced
// ---------------------------------------------------------------------------

describe("period isolation", () => {
  it("only returns data for the requested period, not other cached periods", () => {
    seedCache(makeEntry("1hr"));
    seedCache(makeEntry("24hr"));
    seedCache(makeEntry("1yr", { data: [], points: 0 }));

    const { result } = renderHook(() => useRRDTimeSeriesData("24hr"));

    expect(result.current.timeRange?.start).toBe(makeEntry("24hr").start);
    // 1yr startOffset is much larger; if we were reading the wrong entry the
    // start would differ significantly.
    expect(result.current.timeRange?.start).not.toBe(
      NOW - 365 * 24 * 60 * 60 * 1000,
    );
  });

  it("returns loading=true for a period not yet in cache even when other periods are warm", () => {
    seedCache(makeEntry("1hr"));
    seedCache(makeEntry("6hr"));
    // "12hr" is intentionally absent

    const { result } = renderHook(() => useRRDTimeSeriesData("12hr"));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it("switching period on re-render reads the new period's cache entry", () => {
    seedCache(makeEntry("1hr"));
    seedCache(makeEntry("6hr", { start: NOW - 21_600_000, end: NOW }));

    const { result, rerender } = renderHook(
      ({ period }: { period: "1hr" | "6hr" }) => useRRDTimeSeriesData(period),
      { initialProps: { period: "1hr" } as { period: "1hr" | "6hr" } },
    );

    expect(result.current.timeRange?.start).toBe(NOW - 3_600_000);

    rerender({ period: "6hr" });

    expect(result.current.timeRange?.start).toBe(NOW - 21_600_000);
  });

  it("returns loading=true immediately when switching to an uncached period", () => {
    seedCache(makeEntry("1hr"));
    // "30day" not seeded

    const { result, rerender } = renderHook(
      ({ period }: { period: "1hr" | "30day" }) => useRRDTimeSeriesData(period),
      { initialProps: { period: "1hr" } as { period: "1hr" | "30day" } },
    );

    expect(result.current.loading).toBe(false);

    rerender({ period: "30day" });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toHaveLength(0);
    expect(result.current.timeRange).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Backward-compat: unused parameters
// ---------------------------------------------------------------------------

describe("backward-compat: ignored parameters", () => {
  it("accepts autoRefresh=true without error or side effects", () => {
    seedCache(makeEntry("1hr"));
    expect(() =>
      renderHook(() => useRRDTimeSeriesData("1hr", true)),
    ).not.toThrow();
  });

  it("accepts autoRefresh=false without error or side effects", () => {
    seedCache(makeEntry("1hr"));
    expect(() =>
      renderHook(() => useRRDTimeSeriesData("1hr", false)),
    ).not.toThrow();
  });

  it("accepts refreshInterval without error or side effects", () => {
    seedCache(makeEntry("1hr"));
    expect(() =>
      renderHook(() => useRRDTimeSeriesData("1hr", false, 30_000)),
    ).not.toThrow();
  });

  it("produces identical output regardless of autoRefresh value", () => {
    seedCache(makeEntry("6hr"));

    const { result: r1 } = renderHook(() => useRRDTimeSeriesData("6hr", true));
    const { result: r2 } = renderHook(() => useRRDTimeSeriesData("6hr", false));

    expect(r1.current.loading).toBe(r2.current.loading);
    expect(r1.current.data).toHaveLength(r2.current.data.length);
    expect(r1.current.timeRange).toEqual(r2.current.timeRange);
    expect(r1.current.error).toBe(r2.current.error);
  });
});

// ---------------------------------------------------------------------------
// Regression: hook never emits a socket request
// ---------------------------------------------------------------------------

describe("regression: no socket.emit", () => {
  it("does not call socket.emit on mount (cache miss)", () => {
    renderHook(() => useRRDTimeSeriesData("1hr"));
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it("does not call socket.emit on mount (cache hit)", () => {
    seedCache(makeEntry("24hr"));
    renderHook(() => useRRDTimeSeriesData("24hr"));
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it("does not call socket.emit when the period changes", () => {
    seedCache(makeEntry("1hr"));
    seedCache(makeEntry("6hr"));

    const { rerender } = renderHook(
      ({ period }: { period: "1hr" | "6hr" }) => useRRDTimeSeriesData(period),
      { initialProps: { period: "1hr" } as { period: "1hr" | "6hr" } },
    );

    rerender({ period: "6hr" });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it("does not register a socket.on listener for rrd_timeseries_data", () => {
    renderHook(() => useRRDTimeSeriesData("1hr"));
    const listenedEvents = (mockSocket.on.mock.calls as unknown[][]).map(
      (call) => call[0] as string,
    );
    expect(listenedEvents).not.toContain("rrd_timeseries_data");
  });

  it("does not call socket.off on unmount", () => {
    const { unmount } = renderHook(() => useRRDTimeSeriesData("1hr"));
    unmount();
    expect(mockSocket.off).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Regression: stale timeRange crash no longer possible (data is period-keyed)
//
// The original hook kept a single timeRange in local state.  When the user
// switched from "1yr" to "6hr", the 1-year range lingered until the 6hr
// response arrived, causing Chart.js to crash trying to render ~525k
// minute-ticks.  The store-selector model is immune because each period has
// its own independent cache entry; switching periods reads a different Map
// slot — there is no stale local state to carry over.
// ---------------------------------------------------------------------------

describe("regression: no stale timeRange on period switch", () => {
  it("reads the new period's timeRange immediately on re-render, never the old one", () => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const yearStart = NOW - oneYearMs;
    const hourStart = NOW - 3_600_000;

    seedCache(makeEntry("1yr", { start: yearStart, end: NOW }));
    seedCache(makeEntry("1hr", { start: hourStart, end: NOW }));

    const { result, rerender } = renderHook(
      ({ period }: { period: "1yr" | "1hr" }) => useRRDTimeSeriesData(period),
      { initialProps: { period: "1yr" } as { period: "1yr" | "1hr" } },
    );

    expect(result.current.timeRange?.start).toBe(yearStart);

    rerender({ period: "1hr" });

    // Must immediately show the 1hr range — not the lingering 1yr range.
    expect(result.current.timeRange?.start).toBe(hourStart);
    expect(result.current.timeRange?.start).not.toBe(yearStart);
  });

  it("never surfaces loading=true after a period switch when both periods are warm", () => {
    seedCache(makeEntry("6hr"));
    seedCache(makeEntry("12hr"));

    const { result, rerender } = renderHook(
      ({ period }: { period: "6hr" | "12hr" }) => useRRDTimeSeriesData(period),
      { initialProps: { period: "6hr" } as { period: "6hr" | "12hr" } },
    );

    expect(result.current.loading).toBe(false);

    rerender({ period: "12hr" });

    // Both are warm — no loading flash.
    expect(result.current.loading).toBe(false);
  });
});

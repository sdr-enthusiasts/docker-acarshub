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

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";

// ---------------------------------------------------------------------------
// Mock socket service
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void;

const mockHandlers = new Map<string, EventHandler>();

const mockSocket = {
  connected: true,
  id: "test-socket-id",
  on: vi.fn((event: string, handler: EventHandler) => {
    mockHandlers.set(event, handler);
  }),
  off: vi.fn((event: string) => {
    mockHandlers.delete(event);
  }),
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

/**
 * Fire the `rrd_timeseries_data` socket event with the given payload so the
 * hook's internal listener processes it.
 */
function emitRRDData(payload: {
  time_period?: string;
  data: unknown[];
  start?: number;
  end?: number;
  points?: number;
  error?: string;
}) {
  const handler = mockHandlers.get("rrd_timeseries_data");
  if (!handler) throw new Error("No rrd_timeseries_data handler registered");
  act(() => {
    handler(payload);
  });
}

/**
 * One year in milliseconds — used to construct a realistic "1yr" timeRange
 * that would trigger the Chart.js "too far apart with stepSize of 1 minute"
 * crash when mistakenly applied to a short period whose unit is "minute".
 */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Import hook AFTER mocks are in place
// ---------------------------------------------------------------------------

import { useRRDTimeSeriesData } from "../useRRDTimeSeriesData";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useRRDTimeSeriesData", () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();

    // Mark the app as connected so the hook's isConnected guard passes
    useAppStore.setState({ isConnected: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe("initial state", () => {
    it("starts in a loading state with empty data and no timeRange", () => {
      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toHaveLength(0);
      expect(result.current.timeRange).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("emits rrd_timeseries to the socket on mount", () => {
      renderHook(() => useRRDTimeSeriesData("1hr"));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "rrd_timeseries",
        { time_period: "1hr" },
        "/main",
      );
    });

    it("registers an rrd_timeseries_data socket listener on mount", () => {
      renderHook(() => useRRDTimeSeriesData("6hr"));
      expect(mockSocket.on).toHaveBeenCalledWith(
        "rrd_timeseries_data",
        expect.any(Function),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Receiving data
  // -------------------------------------------------------------------------

  describe("receiving a valid response", () => {
    it("transitions out of loading state and stores data when a matching response arrives", () => {
      const now = Date.now();
      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      emitRRDData({
        time_period: "1hr",
        data: [
          {
            timestamp: now - 60_000,
            acars: 2,
            vdlm: 1,
            hfdl: 0,
            imsl: 0,
            irdm: 0,
            total: 3,
            error: 0,
          },
        ],
        start: now - 3_600_000,
        end: now,
        points: 1,
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toHaveLength(1);
      expect(result.current.error).toBeNull();
    });

    it("stores the timeRange from the response", () => {
      const now = Date.now();
      const start = now - 3_600_000;
      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      emitRRDData({
        time_period: "1hr",
        data: [],
        start,
        end: now,
        points: 0,
      });

      expect(result.current.timeRange).toEqual({ start, end: now });
    });

    it("ignores responses for a different time_period", () => {
      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      emitRRDData({
        time_period: "24hr", // wrong period
        data: [{ timestamp: Date.now(), acars: 5 }],
        points: 1,
      });

      // Still loading — response was for a different period
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error responses
  // -------------------------------------------------------------------------

  describe("error responses", () => {
    it("sets the error state when the response contains an error field", () => {
      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      emitRRDData({
        time_period: "1hr",
        data: [],
        error: "Invalid time period",
        points: 0,
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("Invalid time period");
      expect(result.current.data).toHaveLength(0);
      expect(result.current.timeRange).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Waiting for connection
  // -------------------------------------------------------------------------

  describe("waiting for connection", () => {
    it("sets an error and stays loading when the socket is not connected", () => {
      useAppStore.setState({ isConnected: false });

      const { result } = renderHook(() => useRRDTimeSeriesData("1hr"));

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toMatch(/waiting for connection/i);
    });
  });

  // -------------------------------------------------------------------------
  // regression: stale timeRange crash when timePeriod changes
  //
  // Scenario:
  //   1. Hook is used with "1yr" — receives a timeRange spanning 1 full year.
  //   2. timePeriod changes to "6hr".
  //   3. The chart options recompute with unit="minute" (correct for 6hr).
  //   4. BUG (before fix): the old 1-year timeRange is still in state, so
  //      Chart.js tries to generate ~525,000 minute-ticks and throws:
  //        "X and Y are too far apart with stepSize of 1 minute"
  //   5. FIX: the hook must clear timeRange (and data) immediately when
  //      timePeriod changes, before the new response arrives.
  // -------------------------------------------------------------------------

  describe("regression: stale timeRange cleared on timePeriod change", () => {
    it("clears timeRange immediately when timePeriod changes away from a long period", () => {
      const now = Date.now();
      const yearStart = now - ONE_YEAR_MS;

      const { result, rerender } = renderHook(
        ({ period }: { period: "1yr" | "6hr" }) => useRRDTimeSeriesData(period),
        { initialProps: { period: "1yr" } as { period: "1yr" | "6hr" } },
      );

      // Simulate the backend responding with 1yr data including a 1-year timeRange
      emitRRDData({
        time_period: "1yr",
        data: [],
        start: yearStart,
        end: now,
        points: 0,
      });

      // Confirm timeRange is set to the full year span
      expect(result.current.timeRange).toEqual({ start: yearStart, end: now });

      // Switch to 6hr — this is the scenario that triggered the crash
      rerender({ period: "6hr" });

      // timeRange MUST be null immediately after the period changes,
      // before any 6hr response arrives.  If it still held the 1yr range,
      // Chart.js would crash trying to draw minute ticks across a 1-year axis.
      expect(result.current.timeRange).toBeNull();
    });

    it("clears data immediately when timePeriod changes", () => {
      const now = Date.now();

      const { result, rerender } = renderHook(
        ({ period }: { period: "24hr" | "1hr" }) =>
          useRRDTimeSeriesData(period),
        { initialProps: { period: "24hr" } as { period: "24hr" | "1hr" } },
      );

      emitRRDData({
        time_period: "24hr",
        data: [
          {
            timestamp: now - 300_000,
            acars: 3,
            vdlm: 2,
            hfdl: 0,
            imsl: 0,
            irdm: 0,
            total: 5,
            error: 0,
          },
        ],
        start: now - 86_400_000,
        end: now,
        points: 1,
      });

      expect(result.current.data).toHaveLength(1);

      // Switch periods — stale data from 24hr must be cleared
      rerender({ period: "1hr" });

      expect(result.current.data).toHaveLength(0);
    });

    it("enters loading state immediately when timePeriod changes", () => {
      const now = Date.now();

      const { result, rerender } = renderHook(
        ({ period }: { period: "1wk" | "1hr" }) => useRRDTimeSeriesData(period),
        { initialProps: { period: "1wk" } as { period: "1wk" | "1hr" } },
      );

      emitRRDData({
        time_period: "1wk",
        data: [],
        start: now - 604_800_000,
        end: now,
        points: 0,
      });

      expect(result.current.loading).toBe(false);

      rerender({ period: "1hr" });

      expect(result.current.loading).toBe(true);
    });

    it("accepts new data after the period change without retaining stale timeRange", () => {
      const now = Date.now();
      const yearStart = now - ONE_YEAR_MS;
      const hourStart = now - 3_600_000;

      const { result, rerender } = renderHook(
        ({ period }: { period: "1yr" | "1hr" }) => useRRDTimeSeriesData(period),
        { initialProps: { period: "1yr" } as { period: "1yr" | "1hr" } },
      );

      // Set a 1yr timeRange
      emitRRDData({
        time_period: "1yr",
        data: [],
        start: yearStart,
        end: now,
        points: 0,
      });

      expect(result.current.timeRange?.start).toBe(yearStart);

      // Switch to 1hr
      rerender({ period: "1hr" });

      // Simulate backend delivering 1hr data
      emitRRDData({
        time_period: "1hr",
        data: [],
        start: hourStart,
        end: now,
        points: 0,
      });

      // timeRange should now reflect the 1hr window, not the old 1yr window
      expect(result.current.timeRange).toEqual({ start: hourStart, end: now });
      expect(result.current.timeRange?.start).not.toBe(yearStart);
    });

    it("ignores a delayed response from the old period arriving after the switch", () => {
      const now = Date.now();
      const yearStart = now - ONE_YEAR_MS;
      const hourStart = now - 3_600_000;

      const { result, rerender } = renderHook(
        ({ period }: { period: "1yr" | "1hr" }) => useRRDTimeSeriesData(period),
        { initialProps: { period: "1yr" } as { period: "1yr" | "1hr" } },
      );

      // Switch to 1hr BEFORE any 1yr response arrives
      rerender({ period: "1hr" });

      // A delayed 1yr response arrives — must be ignored
      emitRRDData({
        time_period: "1yr",
        data: [],
        start: yearStart,
        end: now,
        points: 0,
      });

      // timeRange must remain null — the 1yr response should have been discarded
      expect(result.current.timeRange).toBeNull();

      // Now the correct 1hr response arrives
      emitRRDData({
        time_period: "1hr",
        data: [],
        start: hourStart,
        end: now,
        points: 0,
      });

      expect(result.current.timeRange).toEqual({ start: hourStart, end: now });
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("cleanup", () => {
    it("deregisters the socket listener on unmount", () => {
      const { unmount } = renderHook(() => useRRDTimeSeriesData("1hr"));
      unmount();
      expect(mockSocket.off).toHaveBeenCalledWith(
        "rrd_timeseries_data",
        expect.any(Function),
      );
    });
  });
});

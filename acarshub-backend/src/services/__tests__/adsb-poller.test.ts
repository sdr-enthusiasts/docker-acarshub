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
 * Unit tests for AdsbPoller
 *
 * Tests cover:
 * - Lifecycle: start / stop / running flag
 * - getCachedData returns null before first fetch
 * - Successful fetch: data optimization, cache update, event emission
 * - HTTP errors: emits error event, schedules next poll
 * - Fetch timeout (AbortError): emits error, schedules next poll
 * - Singleton helpers: getAdsbPoller / destroyAdsbPoller
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdsbPoller,
  destroyAdsbPoller,
  getAdsbPoller,
} from "../adsb-poller.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal raw aircraft.json payload from tar1090 */
function makeFetchPayload(aircraft: Record<string, unknown>[] = []): {
  now: number;
  aircraft: Record<string, unknown>[];
} {
  return { now: 1_700_000_000, aircraft };
}

/**
 * Flush all pending fake-timer callbacks and their promise continuations.
 *
 * vi.useFakeTimers() fakes setImmediate, so a plain
 * `await new Promise(resolve => setImmediate(resolve))` never resolves.
 * advanceTimersByTimeAsync(0) advances the fake clock by 0 ms AND drains
 * all queued microtasks / setImmediate callbacks, making async poll()
 * completions visible to the test.
 */
async function flushAsync(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  destroyAdsbPoller();
});

afterEach(() => {
  destroyAdsbPoller();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// AdsbPoller — lifecycle
// ---------------------------------------------------------------------------

describe("AdsbPoller lifecycle", () => {
  it("should not be running before start()", () => {
    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    expect(poller.running).toBe(false);
  });

  it("should be running after start()", async () => {
    // Prevent actual network activity by making fetch hang forever
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => undefined),
    );

    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    poller.start();

    expect(poller.running).toBe(true);
    poller.stop();
  });

  it("should not be running after stop()", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => undefined),
    );

    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    poller.start();
    poller.stop();

    expect(poller.running).toBe(false);
  });

  it("should ignore a second start() call when already running", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 5000,
    });

    poller.start();
    poller.start(); // second call should be a no-op

    // Only one poll should have been initiated
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("should ignore stop() when not running", () => {
    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    expect(() => poller.stop()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AdsbPoller — cache
// ---------------------------------------------------------------------------

describe("AdsbPoller getCachedData", () => {
  it("should return null before any fetch completes", () => {
    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    expect(poller.getCachedData()).toBeNull();
  });

  it("should return null when stopped without fetching", () => {
    const poller = new AdsbPoller({ url: "http://localhost/aircraft.json" });
    poller.stop();
    expect(poller.getCachedData()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AdsbPoller — successful fetch
// ---------------------------------------------------------------------------

describe("AdsbPoller successful fetch", () => {
  it("should populate cache after a successful fetch", async () => {
    const payload = makeFetchPayload([
      {
        hex: "abc123",
        flight: "UAL123 ",
        alt_baro: 35000,
        lat: 40.1,
        lon: -74.2,
      },
    ]);

    // Chain both behaviours on a single spy.  A second vi.spyOn() call would
    // overwrite the first and make ALL fetches hang (including the first one),
    // which causes the test to time out.
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();

    await flushAsync();

    const cached = poller.getCachedData();
    expect(cached).not.toBeNull();
    expect(cached?.aircraft).toHaveLength(1);
    expect(cached?.aircraft[0].hex).toBe("abc123");
    // flight should be trimmed
    expect(cached?.aircraft[0].flight).toBe("UAL123");

    poller.stop();
  });

  it("should strip unknown fields (data optimisation)", async () => {
    const payload = makeFetchPayload([
      {
        hex: "abc123",
        unknown_field: "should be gone",
        squawk: "1200",
        flight: "UAL123",
        alt_baro: 35000,
        gs: 450,
        track: 90,
        lat: 40.1,
        lon: -74.2,
        seen: 1.2,
        seen_pos: 0.5,
        rssi: -18.5,
        messages: 42,
        category: "A3",
      },
    ]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();
    await flushAsync();

    const aircraft = poller.getCachedData()?.aircraft[0];
    expect(aircraft).toBeDefined();
    // Unknown fields must not be present
    expect(aircraft).not.toHaveProperty("unknown_field");
    expect(aircraft).not.toHaveProperty("squawk");
    // Known fields preserved
    expect(aircraft?.hex).toBe("abc123");
    expect(aircraft?.alt_baro).toBe(35000);
    expect(aircraft?.gs).toBe(450);
    expect(aircraft?.track).toBe(90);
    expect(aircraft?.lat).toBe(40.1);
    expect(aircraft?.lon).toBe(-74.2);
    expect(aircraft?.seen).toBe(1.2);
    expect(aircraft?.seen_pos).toBe(0.5);
    expect(aircraft?.rssi).toBe(-18.5);
    expect(aircraft?.messages).toBe(42);
    expect(aircraft?.category).toBe("A3");

    poller.stop();
  });

  it("should emit data event with optimised payload", async () => {
    const payload = makeFetchPayload([{ hex: "aa1122", alt_baro: 10000 }]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });

    const dataHandler = vi.fn();
    poller.on("data", dataHandler);
    poller.start();
    await flushAsync();

    expect(dataHandler).toHaveBeenCalledTimes(1);
    const emitted = dataHandler.mock.calls[0][0];
    expect(emitted.aircraft[0].hex).toBe("aa1122");

    poller.stop();
  });

  it("should handle empty aircraft array", async () => {
    const payload = makeFetchPayload([]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();
    await flushAsync();

    const cached = poller.getCachedData();
    expect(cached?.aircraft).toHaveLength(0);

    poller.stop();
  });

  it("should schedule the next poll after a successful fetch", async () => {
    // First fetch succeeds, then we verify a second fetch is scheduled.
    // Use mockImplementation (not mockResolvedValue) so a fresh Response
    // object is created for every call — a Response body can only be read
    // once, so reusing the same object causes "Body has already been read".
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(makeFetchPayload()), { status: 200 }),
        ),
      );

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 1000,
    });
    poller.start();

    // First poll fires immediately on start()
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance by poll interval to trigger the next scheduled poll
    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});

// ---------------------------------------------------------------------------
// AdsbPoller — HTTP errors
// ---------------------------------------------------------------------------

describe("AdsbPoller HTTP errors", () => {
  it("should emit error event on non-ok HTTP response", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });

    const errorHandler = vi.fn();
    poller.on("error", errorHandler);
    poller.start();
    await flushAsync();

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0][0].message).toMatch(/404/);

    poller.stop();
  });

  it("should leave cache null after HTTP error (no previous fetch)", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("Error", { status: 500 }))
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.on("error", () => undefined); // suppress unhandled EventEmitter error
    poller.start();
    await flushAsync();

    expect(poller.getCachedData()).toBeNull();
    poller.stop();
  });

  it("should retain stale cache after a failed fetch", async () => {
    // First fetch succeeds → cache populated
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeFetchPayload([{ hex: "stale1" }])), {
          status: 200,
        }),
      )
      // Second fetch fails
      .mockResolvedValueOnce(new Response("Error", { status: 503 }))
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 1000,
    });
    poller.on("error", () => undefined); // suppress unhandled EventEmitter error
    poller.start();
    await flushAsync(); // first poll resolves

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync(); // second poll resolves (error)

    // Cache should still contain data from the first successful fetch
    const cached = poller.getCachedData();
    expect(cached?.aircraft[0].hex).toBe("stale1");

    poller.stop();
  });

  it("should schedule next poll even after an HTTP error", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("Error", { status: 500 }));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 1000,
    });
    poller.on("error", () => undefined); // suppress unhandled error

    poller.start();
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});

// ---------------------------------------------------------------------------
// AdsbPoller — timeout (AbortError)
// ---------------------------------------------------------------------------

describe("AdsbPoller fetch timeout", () => {
  it("should emit error event when fetch times out", async () => {
    // Simulate AbortError
    const abortError = new DOMException(
      "The operation was aborted",
      "AbortError",
    );
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(abortError)
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
      timeout: 100,
    });

    const errorHandler = vi.fn();
    poller.on("error", errorHandler);
    poller.start();
    await flushAsync();

    expect(errorHandler).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("should schedule next poll after a timeout", async () => {
    const abortError = new DOMException(
      "The operation was aborted",
      "AbortError",
    );
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(abortError);

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 1000,
      timeout: 100,
    });
    poller.on("error", () => undefined); // suppress unhandled error

    poller.start();
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});

// ---------------------------------------------------------------------------
// getAdsbPoller singleton + destroyAdsbPoller
// ---------------------------------------------------------------------------

describe("getAdsbPoller singleton", () => {
  it("should return the same instance on repeated calls", () => {
    const config = { url: "http://localhost/aircraft.json" };
    const a = getAdsbPoller(config);
    const b = getAdsbPoller(config);
    expect(a).toBe(b);
  });

  it("should return a new instance after destroyAdsbPoller", () => {
    const config = { url: "http://localhost/aircraft.json" };
    const a = getAdsbPoller(config);
    destroyAdsbPoller();
    const b = getAdsbPoller(config);
    expect(a).not.toBe(b);
  });

  it("should stop the poller on destroyAdsbPoller", () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => undefined),
    );

    const poller = getAdsbPoller({ url: "http://localhost/aircraft.json" });
    poller.start();
    expect(poller.running).toBe(true);

    destroyAdsbPoller();
    // After destroy the original reference should reflect stopped state
    expect(poller.running).toBe(false);
  });

  it("should handle destroyAdsbPoller when no singleton exists", () => {
    // Already destroyed in beforeEach; calling again must not throw
    expect(() => destroyAdsbPoller()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Data optimisation edge-cases
// ---------------------------------------------------------------------------

describe("AdsbPoller data optimisation edge cases", () => {
  it("should coerce numeric string fields to numbers", async () => {
    const payload = makeFetchPayload([
      { hex: "abc", alt_baro: "35000", gs: "480.5" },
    ]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();
    await flushAsync();

    const aircraft = poller.getCachedData()?.aircraft[0];
    expect(typeof aircraft?.alt_baro).toBe("number");
    expect(aircraft?.alt_baro).toBe(35000);
    expect(typeof aircraft?.gs).toBe("number");
    expect(aircraft?.gs).toBe(480.5);

    poller.stop();
  });

  it("should handle aircraft with only hex field", async () => {
    const payload = makeFetchPayload([{ hex: "badc0d" }]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();
    await flushAsync();

    const aircraft = poller.getCachedData()?.aircraft[0];
    expect(aircraft?.hex).toBe("badc0d");
    expect(aircraft?.flight).toBeUndefined();
    expect(aircraft?.alt_baro).toBeUndefined();

    poller.stop();
  });

  it("should handle multiple aircraft in a single payload", async () => {
    const payload = makeFetchPayload([
      { hex: "aaa111" },
      { hex: "bbb222" },
      { hex: "ccc333" },
    ]);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    const poller = new AdsbPoller({
      url: "http://localhost/aircraft.json",
      pollInterval: 60_000,
    });
    poller.start();
    await flushAsync();

    const cached = poller.getCachedData();
    expect(cached?.aircraft).toHaveLength(3);
    expect(cached?.aircraft.map((a) => a.hex)).toEqual([
      "aaa111",
      "bbb222",
      "ccc333",
    ]);

    poller.stop();
  });
});

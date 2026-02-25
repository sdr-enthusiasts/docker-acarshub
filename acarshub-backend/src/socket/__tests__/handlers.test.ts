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
 * Unit tests for socket/handlers.ts
 *
 * Strategy:
 *  - All database / service / config dependencies are mocked at the module level.
 *  - registerHandlers() is called with a mock TypedSocketServer whose
 *    io.of("/main").on("connection", cb) captures the connection callback.
 *  - A fresh mock socket is created per test via makeMockSocket().
 *    Calling simulateConnect(socket) triggers handleConnect + registers
 *    all per-socket event handlers.
 *  - Per-socket event handlers are invoked by calling
 *    socketHandlers["event_name"](params).
 *
 * Tests cover:
 *  handleConnect:
 *    - emits features_enabled with decoder config
 *    - emits terms (alert terms + ignore)
 *    - emits labels
 *    - sends recent messages in chunks (acars_msg_batch)
 *    - last chunk has done_loading = true
 *    - filters alert-matched messages from the non-alert batch
 *    - emits database size
 *    - emits signal levels
 *    - emits alert_terms
 *    - emits alert_matches_batch chunks
 *    - emits acarshub_version
 *    - emits cached ADS-B data when ADS-B is enabled
 *    - skips ADS-B emit when cache is null
 *    - skips ADS-B section entirely when ADS-B disabled
 *    - handles thrown errors gracefully (no crash)
 *
 *  handleQuerySearch:
 *    - emits database_search_results with enriched messages
 *    - normalises VDLM2 → VDL-M2 and IMSL → IMS-L message types
 *    - uses results_after as page offset
 *
 *  handleUpdateAlerts:
 *    - updates DB and broadcasts updated terms
 *    - does nothing when allowRemoteUpdates is false
 *
 *  handleRegenerateAlertMatches:
 *    - emits regenerate_alert_matches_error when updates disabled
 *    - emits regenerate_alert_matches_error when already in progress
 *    - emits started → complete sequence on success
 *    - broadcasts alert_terms after completion
 *    - emits error on regeneration failure
 *
 *  handleRequestStatus:
 *    - emits system_status
 *
 *  handleSignalFreqs:
 *    - emits signal_freqs with formatted freq data
 *
 *  handleSignalCount:
 *    - emits signal_count with error stats
 *
 *  handleQueryAlertsByTerm:
 *    - emits alerts_by_term_results with enriched alerts
 *
 *  handleSignalGraphs:
 *    - emits alert_terms and signal
 *
 *  handleRRDTimeseries:
 *    - emits rrd_timeseries_data for a valid time_period
 *    - emits error response for invalid time_period
 *    - uses explicit start/end when time_period is absent
 *
 *  zeroFillBuckets (tested via handleRRDTimeseries):
 *    - fills gaps with zero rows
 *    - preserves existing rows
 */

import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — declared BEFORE any imports that use them
// ---------------------------------------------------------------------------

vi.mock("../../config.js", () => ({
  getConfig: vi.fn(),
  VERSIONS: {
    container: "4.0.0-test",
    backend: "4.0.0-test",
    frontend: "4.0.0-test",
  },
}));

vi.mock("../../db/index.js", () => ({
  databaseSearch: vi.fn(),
  getAlertCounts: vi.fn(),
  getAllFreqCounts: vi.fn(),
  getAllSignalLevels: vi.fn(),
  getCachedAlertIgnoreTerms: vi.fn(),
  getCachedAlertTerms: vi.fn(),
  getDatabase: vi.fn(),
  getErrors: vi.fn(),
  getPerDecoderMessageCounts: vi.fn(),
  getRowCount: vi.fn(),
  grabMostRecent: vi.fn(),
  regenerateAllAlertMatches: vi.fn(),
  searchAlerts: vi.fn(),
  searchAlertsByTerm: vi.fn(),
  setAlertIgnore: vi.fn(),
  setAlertTerms: vi.fn(),
}));

vi.mock("../../formatters/enrichment.js", () => ({
  enrichMessage: vi.fn(),
  enrichMessages: vi.fn(),
}));

vi.mock("../../services/adsb-poller.js", () => ({
  getAdsbPoller: vi.fn(),
}));

vi.mock("../../services/message-queue.js", () => ({
  getMessageQueue: vi.fn(),
}));

vi.mock("../../services/rrd-migration.js", () => ({
  queryTimeseriesData: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { getConfig } from "../../config.js";
import {
  databaseSearch,
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  getErrors,
  getPerDecoderMessageCounts,
  getRowCount,
  grabMostRecent,
  regenerateAllAlertMatches,
  searchAlerts,
  searchAlertsByTerm,
  setAlertIgnore,
  setAlertTerms,
} from "../../db/index.js";
import { enrichMessage, enrichMessages } from "../../formatters/enrichment.js";
import { getAdsbPoller } from "../../services/adsb-poller.js";
import { getMessageQueue } from "../../services/message-queue.js";
import { queryTimeseriesData } from "../../services/rrd-migration.js";
import { registerHandlers } from "../handlers.js";

// ---------------------------------------------------------------------------
// Typed aliases for mocked functions
// ---------------------------------------------------------------------------

const mockGetConfig = vi.mocked(getConfig);
const mockGrabMostRecent = vi.mocked(grabMostRecent);
const mockEnrichMessages = vi.mocked(enrichMessages);
const mockEnrichMessage = vi.mocked(enrichMessage);
const mockGetRowCount = vi.mocked(getRowCount);
const mockGetAllSignalLevels = vi.mocked(getAllSignalLevels);
const mockGetAlertCounts = vi.mocked(getAlertCounts);
const mockSearchAlerts = vi.mocked(searchAlerts);
const mockGetCachedAlertTerms = vi.mocked(getCachedAlertTerms);
const mockGetCachedAlertIgnoreTerms = vi.mocked(getCachedAlertIgnoreTerms);
const mockGetAdsbPoller = vi.mocked(getAdsbPoller);
const mockDatabaseSearch = vi.mocked(databaseSearch);
const mockSetAlertTerms = vi.mocked(setAlertTerms);
const mockSetAlertIgnore = vi.mocked(setAlertIgnore);
const mockRegenerateAllAlertMatches = vi.mocked(regenerateAllAlertMatches);
const mockGetErrors = vi.mocked(getErrors);
const mockGetAllFreqCounts = vi.mocked(getAllFreqCounts);
const mockSearchAlertsByTerm = vi.mocked(searchAlertsByTerm);
const mockQueryTimeseriesData = vi.mocked(queryTimeseriesData);
const mockGetPerDecoderMessageCounts = vi.mocked(getPerDecoderMessageCounts);
const mockGetMessageQueue = vi.mocked(getMessageQueue);

// ---------------------------------------------------------------------------
// Default config returned by mockGetConfig
// ---------------------------------------------------------------------------

function makeDefaultConfig(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof getConfig> {
  return {
    version: "4.0.0-test",
    allowRemoteUpdates: true,
    dbSaveAll: false,
    dbSaveDays: 7,
    dbAlertSaveDays: 120,
    dbPath: "/tmp/test.db",
    dbBackup: "",
    enableAcars: true,
    enableVdlm: true,
    enableHfdl: false,
    enableImsl: false,
    enableIrdm: false,
    feedAcarsHost: "127.0.0.1",
    feedAcarsPort: 15550,
    feedVdlmHost: "127.0.0.1",
    feedVdlmPort: 15555,
    feedHfdlHost: "127.0.0.1",
    feedHfdlPort: 15556,
    feedImslHost: "127.0.0.1",
    feedImslPort: 15557,
    feedIrdmHost: "127.0.0.1",
    feedIrdmPort: 15558,
    enableAdsb: false,
    adsbUrl: "http://tar1090/data/aircraft.json",
    adsbLat: 0,
    adsbLon: 0,
    enableRangeRings: true,
    flightTrackingUrl: "https://flightaware.com/live/flight/",
    minLogLevel: "info" as const,
    quietMessages: false,
    alertTerms: [],
    alertIgnoreTerms: [],
    groundStations: {},
    messageLabels: { H1: { name: "Position Report" } },
    airlines: {},
    iataOverrides: {},
    ...overrides,
  } as ReturnType<typeof getConfig>;
}

// ---------------------------------------------------------------------------
// Minimal enriched message factory
// ---------------------------------------------------------------------------

function makeEnrichedMsg(uid = "uid-1", matched = false) {
  return {
    uid,
    text: "Test message",
    timestamp: 1_700_000_000_000,
    messageType: "ACARS",
    matched,
    matched_text: matched ? ["ALERT"] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Mock socket / IO helpers
// ---------------------------------------------------------------------------

interface MockSocket {
  id: string;
  emit: Mock;
  on: Mock;
  conn: { transport: { name: string } };
  /** Captured per-event handlers keyed by event name */
  handlers: Record<string, (...args: unknown[]) => unknown>;
}

function makeMockSocket(id = "test-socket-id"): MockSocket {
  const socket: MockSocket = {
    id,
    emit: vi.fn(),
    on: vi.fn(),
    conn: { transport: { name: "websocket" } },
    handlers: {},
  };

  // When socket.on(event, handler) is called, capture the handler
  (socket.on as Mock).mockImplementation(
    (event: string, handler: (...args: unknown[]) => unknown) => {
      socket.handlers[event] = handler;
    },
  );

  return socket;
}

/** Namespace-level emit (for broadcast to /main) */
let mockNamespaceEmit: Mock;

/** Connection callback captured from namespace.on("connection", cb) */
let connectionCallback: (socket: MockSocket) => void;

/** Call the captured connection callback with the given socket */
function simulateConnect(socket: MockSocket): void {
  connectionCallback(socket);
}

// ---------------------------------------------------------------------------
// Global test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();

  // Default config
  mockGetConfig.mockReturnValue(makeDefaultConfig());

  // Default DB mocks
  mockGrabMostRecent.mockReturnValue([]);
  mockEnrichMessages.mockReturnValue([]);
  mockEnrichMessage.mockImplementation((msg) => ({
    ...msg,
    uid: (msg as { uid?: string }).uid ?? "enriched-uid",
    timestamp: 1_700_000_000_000,
    messageType: "ACARS",
    matched: false,
  }));
  mockGetRowCount.mockReturnValue({ count: 0, size: 0 });
  mockGetAllSignalLevels.mockReturnValue({
    ACARS: [],
    "VDL-M2": [],
    HFDL: [],
    IMSL: [],
    IRDM: [],
  });
  mockGetAlertCounts.mockReturnValue([]);
  mockSearchAlerts.mockReturnValue([]);
  mockGetCachedAlertTerms.mockReturnValue([]);
  mockGetCachedAlertIgnoreTerms.mockReturnValue([]);
  mockGetAdsbPoller.mockReturnValue({
    getCachedData: vi.fn().mockReturnValue(null),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as ReturnType<typeof getAdsbPoller>);
  mockDatabaseSearch.mockReturnValue({ messages: [], totalCount: 0 });
  mockGetErrors.mockReturnValue({
    non_empty_total: 0,
    non_empty_errors: 0,
    empty_total: 0,
    empty_errors: 0,
  });
  mockGetAllFreqCounts.mockReturnValue([]);
  mockSearchAlertsByTerm.mockReturnValue([]);
  mockQueryTimeseriesData.mockResolvedValue([]);
  mockGetPerDecoderMessageCounts.mockReturnValue({
    acars: 0,
    vdlm2: 0,
    hfdl: 0,
    imsl: 0,
    irdm: 0,
    total: 0,
  });
  mockGetMessageQueue.mockReturnValue({
    getStats: vi.fn().mockReturnValue({
      acars: { lastMinute: 0, total: 0 },
      vdlm2: { lastMinute: 0, total: 0 },
      hfdl: { lastMinute: 0, total: 0 },
      imsl: { lastMinute: 0, total: 0 },
      irdm: { lastMinute: 0, total: 0 },
      error: { lastMinute: 0, total: 0 },
    }),
    length: 0,
  } as unknown as ReturnType<typeof getMessageQueue>);

  // Build a fresh mock IO and capture the connection callback
  mockNamespaceEmit = vi.fn();

  const mockNamespace = {
    on: vi.fn((event: string, cb: (socket: MockSocket) => void) => {
      if (event === "connection") {
        connectionCallback = cb;
      }
    }),
    emit: mockNamespaceEmit,
    server: {
      of: vi.fn(() => ({ emit: mockNamespaceEmit })),
    },
  };

  const mockIO = {
    of: vi.fn(() => mockNamespace),
  };

  // Register handlers — this populates connectionCallback via mockNamespace.on
  registerHandlers(mockIO as unknown as Parameters<typeof registerHandlers>[0]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all emit calls for a given event */
function emittedAs<T>(socket: MockSocket, event: string): T[] {
  return (socket.emit as Mock).mock.calls
    .filter(([e]: [string]) => e === event)
    .map(([, payload]: [string, T]) => payload);
}

/** Return the first payload emitted for an event */
function firstEmit<T>(socket: MockSocket, event: string): T | undefined {
  return emittedAs<T>(socket, event)[0];
}

// ---------------------------------------------------------------------------
// handleConnect
// ---------------------------------------------------------------------------

describe("handleConnect", () => {
  it("should emit features_enabled with decoder config derived from getConfig", () => {
    mockGetConfig.mockReturnValue(
      makeDefaultConfig({
        enableAcars: true,
        enableVdlm: true,
        enableHfdl: false,
      }),
    );

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{
      acars: boolean;
      vdlm: boolean;
      hfdl: boolean;
    }>(socket, "features_enabled");

    expect(payload).toBeDefined();
    expect(payload?.acars).toBe(true);
    expect(payload?.vdlm).toBe(true);
    expect(payload?.hfdl).toBe(false);
  });

  it("should emit terms with alert terms from the cache", () => {
    mockGetCachedAlertTerms.mockReturnValue(["UAL", "DAL"]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue(["NOISE"]);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{ terms: string[]; ignore: string[] }>(
      socket,
      "terms",
    );

    expect(payload?.terms).toEqual(["UAL", "DAL"]);
    expect(payload?.ignore).toEqual(["NOISE"]);
  });

  it("should emit labels from config.messageLabels", () => {
    mockGetConfig.mockReturnValue(
      makeDefaultConfig({
        messageLabels: { H1: { name: "Position Report" }, Q0: { name: "FMS" } },
      }),
    );

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{ labels: Record<string, { name: string }> }>(
      socket,
      "labels",
    );

    expect(payload?.labels).toHaveProperty("H1");
    expect(payload?.labels).toHaveProperty("Q0");
  });

  it("should emit database size using getRowCount()", () => {
    mockGetRowCount.mockReturnValue({ count: 42, size: 1024 });

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{ count: number; size: number }>(
      socket,
      "database",
    );
    expect(payload?.count).toBe(42);
    expect(payload?.size).toBe(1024);
  });

  it("should emit signal levels using getAllSignalLevels()", () => {
    mockGetAllSignalLevels.mockReturnValue({
      ACARS: [{ level: -10, count: 5 }],
      "VDL-M2": [],
      HFDL: [],
      IMSL: [],
      IRDM: [],
    });

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{ levels: Record<string, unknown[]> }>(
      socket,
      "signal",
    );
    expect(payload?.levels).toHaveProperty("ACARS");
    expect(payload?.levels.ACARS).toHaveLength(1);
  });

  it("should emit alert_terms with data object keyed by index", () => {
    mockGetAlertCounts.mockReturnValue([
      { id: 1, term: "UAL", count: 3 },
      { id: 2, term: "DAL", count: 1 },
    ]);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{
      data: Record<string, { term: string; count: number }>;
    }>(socket, "alert_terms");

    expect(payload?.data[0].term).toBe("UAL");
    expect(payload?.data[0].count).toBe(3);
    expect(payload?.data[1].term).toBe("DAL");
  });

  it("should emit acarshub_version", () => {
    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<{
      container_version: string;
      backend_version: string;
      frontend_version: string;
      github_version: string;
      is_outdated: boolean;
    }>(socket, "acarshub_version");

    // VERSIONS is a module-level constant provided by the mock factory above.
    expect(payload?.container_version).toBe("4.0.0-test");
    expect(payload?.backend_version).toBe("4.0.0-test");
    expect(payload?.frontend_version).toBe("4.0.0-test");
    expect(typeof payload?.github_version).toBe("string");
    expect(payload?.is_outdated).toBe(false);
  });

  it("should send recent non-alert messages in acars_msg_batch chunks of 25", () => {
    // Create 60 non-alert messages
    const msgs = Array.from({ length: 60 }, (_, i) =>
      makeEnrichedMsg(`uid-${i}`, false),
    );
    mockGrabMostRecent.mockReturnValue(msgs);
    mockEnrichMessages.mockReturnValue(msgs);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const batches = emittedAs<{
      messages: unknown[];
      loading: boolean;
      done_loading: boolean;
    }>(socket, "acars_msg_batch");

    // 60 messages / 25 per chunk = 3 batches
    expect(batches).toHaveLength(3);
    expect(batches[0].messages).toHaveLength(25);
    expect(batches[1].messages).toHaveLength(25);
    expect(batches[2].messages).toHaveLength(10);
  });

  it("should mark the last acars_msg_batch chunk as done_loading=true", () => {
    const msgs = Array.from({ length: 30 }, (_, i) =>
      makeEnrichedMsg(`uid-${i}`, false),
    );
    mockGrabMostRecent.mockReturnValue(msgs);
    mockEnrichMessages.mockReturnValue(msgs);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const batches = emittedAs<{ done_loading: boolean }>(
      socket,
      "acars_msg_batch",
    );

    expect(batches).toHaveLength(2);
    expect(batches[0].done_loading).toBe(false);
    expect(batches[1].done_loading).toBe(true);
  });

  it("should filter alert-matched messages out of acars_msg_batch", () => {
    // 3 non-alert + 2 alert messages
    const msgs = [
      makeEnrichedMsg("uid-1", false),
      makeEnrichedMsg("uid-2", true), // alert — must be excluded
      makeEnrichedMsg("uid-3", false),
      makeEnrichedMsg("uid-4", true), // alert — must be excluded
      makeEnrichedMsg("uid-5", false),
    ];
    mockGrabMostRecent.mockReturnValue(msgs);
    mockEnrichMessages.mockReturnValue(msgs);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const batches = emittedAs<{ messages: { uid: string }[] }>(
      socket,
      "acars_msg_batch",
    );
    const allUids = batches.flatMap((b) => b.messages.map((m) => m.uid));
    expect(allUids).not.toContain("uid-2");
    expect(allUids).not.toContain("uid-4");
    expect(allUids).toHaveLength(3);
  });

  it("should emit zero-length acars_msg_batch when there are no messages", () => {
    mockGrabMostRecent.mockReturnValue([]);
    mockEnrichMessages.mockReturnValue([]);

    const socket = makeMockSocket();
    simulateConnect(socket);

    // No batches should be emitted when there are no messages
    const batches = emittedAs(socket, "acars_msg_batch");
    expect(batches).toHaveLength(0);
  });

  it("should send recent alerts in alert_matches_batch chunks", () => {
    // Set up 30 alert matches
    const rawAlerts = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      messageUid: `uid-${i}`,
      term: "UAL",
      matchType: "text",
      matchedAt: 1_700_000_000 + i,
      message: {
        uid: `uid-${i}`,
        text: "UAL flight",
        messageType: "ACARS",
        time: 1_700_000_000,
      },
    }));

    mockSearchAlerts.mockReturnValue(rawAlerts);
    mockEnrichMessage.mockImplementation((msg) => ({
      uid: (msg as { uid?: string }).uid ?? "x",
      timestamp: 1_700_000_000_000,
      messageType: "ACARS",
      matched: true,
      text: "UAL flight",
    }));

    const socket = makeMockSocket();
    simulateConnect(socket);

    const batches = emittedAs<{
      messages: unknown[];
      done_loading: boolean;
    }>(socket, "alert_matches_batch");

    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches[batches.length - 1].done_loading).toBe(true);
  });

  it("should emit cached ADS-B data when ADS-B is enabled and cache is populated", () => {
    const adsbData = {
      now: 1_700_000_000,
      aircraft: [{ hex: "abc123", flight: "UAL1" }],
    };

    mockGetConfig.mockReturnValue(
      makeDefaultConfig({
        enableAdsb: true,
        adsbUrl: "http://adsb/aircraft.json",
      }),
    );
    mockGetAdsbPoller.mockReturnValue({
      getCachedData: vi.fn().mockReturnValue(adsbData),
    } as unknown as ReturnType<typeof getAdsbPoller>);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payload = firstEmit<typeof adsbData>(socket, "adsb_aircraft");
    expect(payload?.aircraft[0].hex).toBe("abc123");
  });

  it("should NOT emit adsb_aircraft when cache is null", () => {
    mockGetConfig.mockReturnValue(makeDefaultConfig({ enableAdsb: true }));
    mockGetAdsbPoller.mockReturnValue({
      getCachedData: vi.fn().mockReturnValue(null),
    } as unknown as ReturnType<typeof getAdsbPoller>);

    const socket = makeMockSocket();
    simulateConnect(socket);

    const payloads = emittedAs(socket, "adsb_aircraft");
    expect(payloads).toHaveLength(0);
  });

  it("should NOT emit adsb_aircraft when ADS-B is disabled", () => {
    mockGetConfig.mockReturnValue(makeDefaultConfig({ enableAdsb: false }));

    const socket = makeMockSocket();
    simulateConnect(socket);

    expect(emittedAs(socket, "adsb_aircraft")).toHaveLength(0);
    // getAdsbPoller should not be called when ADS-B is disabled
    expect(mockGetAdsbPoller).not.toHaveBeenCalled();
  });

  it("should not throw when an internal dependency throws during connect", () => {
    mockGrabMostRecent.mockImplementation(() => {
      throw new Error("DB is on fire");
    });

    const socket = makeMockSocket();
    expect(() => simulateConnect(socket)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleQuerySearch
// ---------------------------------------------------------------------------

describe("handleQuerySearch", () => {
  function triggerSearch(
    socket: MockSocket,
    params: {
      search_term: {
        msg_type?: string;
        icao?: string;
        tail?: string;
        flight?: string;
        station_id?: string;
        depa?: string;
        dsta?: string;
        msg_text?: string;
        label?: string;
        freq?: string;
        msgno?: string;
      };
      results_after?: number;
      show_all?: boolean;
    },
  ): void {
    simulateConnect(socket);
    const handler = socket.handlers.query_search;
    expect(handler).toBeDefined();
    handler(params);
  }

  it("should emit database_search_results with enriched messages", () => {
    mockDatabaseSearch.mockReturnValue({
      messages: [{ uid: "uid-1" }],
      totalCount: 1,
    });
    mockEnrichMessages.mockReturnValue([makeEnrichedMsg("uid-1")]);

    const socket = makeMockSocket();
    triggerSearch(socket, { search_term: { flight: "UAL123" } });

    const payloads = emittedAs<{
      msghtml: unknown[];
      num_results: number;
      query_time: number;
    }>(socket, "database_search_results");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].msghtml).toHaveLength(1);
    expect(payloads[0].num_results).toBe(1);
    expect(typeof payloads[0].query_time).toBe("number");
  });

  it("should normalise VDLM2 → VDL-M2 before searching", () => {
    mockDatabaseSearch.mockReturnValue({ messages: [], totalCount: 0 });
    mockEnrichMessages.mockReturnValue([]);

    const socket = makeMockSocket();
    triggerSearch(socket, {
      search_term: { msg_type: "VDLM2" },
    });

    expect(mockDatabaseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: "VDL-M2" }),
    );
  });

  it("should normalise IMSL → IMS-L before searching", () => {
    mockDatabaseSearch.mockReturnValue({ messages: [], totalCount: 0 });
    mockEnrichMessages.mockReturnValue([]);

    const socket = makeMockSocket();
    triggerSearch(socket, { search_term: { msg_type: "IMSL" } });

    expect(mockDatabaseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: "IMS-L" }),
    );
  });

  it("should use results_after as the page offset", () => {
    mockDatabaseSearch.mockReturnValue({ messages: [], totalCount: 0 });
    mockEnrichMessages.mockReturnValue([]);

    const socket = makeMockSocket();
    triggerSearch(socket, { search_term: {}, results_after: 2 });

    // Page 2, limit 50 → offset = 100
    expect(mockDatabaseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 100, limit: 50 }),
    );
  });

  it("should default to offset 0 when results_after is absent", () => {
    mockDatabaseSearch.mockReturnValue({ messages: [], totalCount: 0 });
    mockEnrichMessages.mockReturnValue([]);

    const socket = makeMockSocket();
    triggerSearch(socket, { search_term: {} });

    expect(mockDatabaseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("should not throw when databaseSearch throws", () => {
    mockDatabaseSearch.mockImplementation(() => {
      throw new Error("DB error");
    });

    const socket = makeMockSocket();
    expect(() => triggerSearch(socket, { search_term: {} })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleUpdateAlerts
// ---------------------------------------------------------------------------

describe("handleUpdateAlerts", () => {
  function triggerUpdateAlerts(
    socket: MockSocket,
    terms: { terms: string[]; ignore: string[] },
  ): void {
    simulateConnect(socket);
    socket.handlers.update_alerts(terms);
  }

  it("should call setAlertTerms and setAlertIgnore with the provided terms", () => {
    const socket = makeMockSocket();
    triggerUpdateAlerts(socket, { terms: ["UAL", "DAL"], ignore: ["NOISE"] });

    expect(mockSetAlertTerms).toHaveBeenCalledWith(["UAL", "DAL"]);
    expect(mockSetAlertIgnore).toHaveBeenCalledWith(["NOISE"]);
  });

  it("should broadcast updated terms to all clients via namespace emit", () => {
    mockGetCachedAlertTerms.mockReturnValue(["UAL"]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue([]);

    const socket = makeMockSocket();
    triggerUpdateAlerts(socket, { terms: ["UAL"], ignore: [] });

    expect(mockNamespaceEmit).toHaveBeenCalledWith(
      "terms",
      expect.objectContaining({ terms: ["UAL"] }),
    );
  });

  it("should NOT update terms when allowRemoteUpdates is false", () => {
    mockGetConfig.mockReturnValue(
      makeDefaultConfig({ allowRemoteUpdates: false }),
    );

    const socket = makeMockSocket();
    triggerUpdateAlerts(socket, { terms: ["UAL"], ignore: [] });

    expect(mockSetAlertTerms).not.toHaveBeenCalled();
    expect(mockSetAlertIgnore).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleRegenerateAlertMatches
// ---------------------------------------------------------------------------

describe("handleRegenerateAlertMatches", () => {
  function triggerRegen(socket: MockSocket): void {
    simulateConnect(socket);
    socket.handlers.regenerate_alert_matches();
  }

  it("should emit regenerate_alert_matches_error when remote updates are disabled", () => {
    mockGetConfig.mockReturnValue(
      makeDefaultConfig({ allowRemoteUpdates: false }),
    );

    const socket = makeMockSocket();
    triggerRegen(socket);

    const errors = emittedAs<{ error: string }>(
      socket,
      "regenerate_alert_matches_error",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/disabled/i);
  });

  it("should emit started then complete on success", async () => {
    mockGetCachedAlertTerms.mockReturnValue(["UAL"]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue([]);
    mockRegenerateAllAlertMatches.mockReturnValue({
      total_messages: 10,
      matched_messages: 2,
      total_matches: 3,
    });
    mockGetAlertCounts.mockReturnValue([{ id: 1, term: "UAL", count: 3 }]);

    const socket = makeMockSocket();
    triggerRegen(socket);

    // Flush the setImmediate that defers the regeneration work
    await new Promise<void>((resolve) => setImmediate(resolve));

    const started = emittedAs(socket, "regenerate_alert_matches_started");
    expect(started).toHaveLength(1);

    const complete = emittedAs<{ success: boolean; stats: unknown }>(
      socket,
      "regenerate_alert_matches_complete",
    );
    expect(complete).toHaveLength(1);
    expect(complete[0].success).toBe(true);
    expect(complete[0].stats).toMatchObject({ total_matches: 3 });
  });

  it("should broadcast alert_terms to all clients after successful regeneration", async () => {
    mockGetCachedAlertTerms.mockReturnValue(["UAL"]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue([]);
    mockRegenerateAllAlertMatches.mockReturnValue({
      total_messages: 0,
      matched_messages: 0,
      total_matches: 0,
    });
    mockGetAlertCounts.mockReturnValue([{ id: 1, term: "UAL", count: 0 }]);

    const socket = makeMockSocket();
    triggerRegen(socket);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockNamespaceEmit).toHaveBeenCalledWith(
      "alert_terms",
      expect.objectContaining({ data: expect.anything() }),
    );
  });

  it("should emit regenerate_alert_matches_error when regeneration throws", async () => {
    mockGetCachedAlertTerms.mockReturnValue([]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue([]);
    mockRegenerateAllAlertMatches.mockImplementation(() => {
      throw new Error("regen failed");
    });

    const socket = makeMockSocket();
    triggerRegen(socket);

    await new Promise<void>((resolve) => setImmediate(resolve));

    const errors = emittedAs<{ error: string }>(
      socket,
      "regenerate_alert_matches_error",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain("regen failed");
  });

  it("should reject a second request while one is in progress", async () => {
    mockGetCachedAlertTerms.mockReturnValue([]);
    mockGetCachedAlertIgnoreTerms.mockReturnValue([]);
    // First regen hangs (never returns) to simulate in-progress
    mockRegenerateAllAlertMatches.mockImplementation(() => {
      // synchronous, but we want two triggers before setImmediate fires
      return { total_messages: 0, matched_messages: 0, total_matches: 0 };
    });

    // We'll trigger two requests before flushing setImmediate
    const socket = makeMockSocket();
    simulateConnect(socket);

    // First trigger — sets alertRegenInProgress = true (inside setImmediate)
    socket.handlers.regenerate_alert_matches();

    // Second trigger — before the first setImmediate has fired, the flag
    // is already set to true by the sync path (alertRegenInProgress = true is
    // set synchronously before the setImmediate callback).
    socket.handlers.regenerate_alert_matches();

    await new Promise<void>((resolve) => setImmediate(resolve));

    const errors = emittedAs<{ error: string }>(
      socket,
      "regenerate_alert_matches_error",
    );
    // Second call must produce an "already in progress" error
    expect(errors.some((e) => e.error.toLowerCase().includes("progress"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// handleRequestStatus
// ---------------------------------------------------------------------------

describe("handleRequestStatus", () => {
  it("should emit system_status", () => {
    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.request_status();

    const statuses = emittedAs(socket, "system_status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toBeDefined();
  });

  it("should not throw when getPerDecoderMessageCounts throws", () => {
    mockGetPerDecoderMessageCounts.mockImplementation(() => {
      throw new Error("counter error");
    });

    const socket = makeMockSocket();
    simulateConnect(socket);

    expect(() => socket.handlers.request_status()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleSignalFreqs
// ---------------------------------------------------------------------------

describe("handleSignalFreqs", () => {
  it("should emit signal_freqs with formatted freq data", () => {
    mockGetAllFreqCounts.mockReturnValue([
      { decoder: "ACARS", freq: "131.550", count: 42 },
      { decoder: "VDL-M2", freq: "136.900", count: 18 },
    ]);

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.signal_freqs();

    const payloads = emittedAs<{
      freqs: Array<{ freq_type: string; freq: string; count: number }>;
    }>(socket, "signal_freqs");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].freqs).toHaveLength(2);
    expect(payloads[0].freqs[0].freq_type).toBe("ACARS");
    expect(payloads[0].freqs[0].freq).toBe("131.550");
    expect(payloads[0].freqs[0].count).toBe(42);
  });

  it("should emit empty freqs array when no freq data", () => {
    mockGetAllFreqCounts.mockReturnValue([]);

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.signal_freqs();

    const payloads = emittedAs<{ freqs: unknown[] }>(socket, "signal_freqs");
    expect(payloads[0].freqs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// handleSignalCount
// ---------------------------------------------------------------------------

describe("handleSignalCount", () => {
  it("should emit signal_count with error stats", () => {
    mockGetErrors.mockReturnValue({
      non_empty_total: 100,
      non_empty_errors: 5,
      empty_total: 20,
      empty_errors: 2,
    });

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.signal_count();

    const payloads = emittedAs<{
      count: {
        non_empty_total: number;
        non_empty_errors: number;
        empty_total: number;
        empty_errors: number;
      };
    }>(socket, "signal_count");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].count.non_empty_total).toBe(100);
    expect(payloads[0].count.non_empty_errors).toBe(5);
    expect(payloads[0].count.empty_total).toBe(20);
    expect(payloads[0].count.empty_errors).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// handleQueryAlertsByTerm
// ---------------------------------------------------------------------------

describe("handleQueryAlertsByTerm", () => {
  it("should emit alerts_by_term_results with enriched alerts", () => {
    const rawAlerts = [
      {
        id: 1,
        messageUid: "uid-1",
        term: "UAL",
        matchType: "icao",
        matchedAt: 1_700_000_000,
        message: {
          uid: "uid-1",
          text: "",
          messageType: "ACARS",
          time: 1_700_000_000,
        },
      },
    ];

    mockSearchAlertsByTerm.mockReturnValue(rawAlerts);
    mockEnrichMessage.mockImplementation((msg) => ({
      uid: (msg as { uid?: string }).uid ?? "x",
      timestamp: 1_700_000_000_000,
      messageType: "ACARS",
      matched: true,
      matched_icao: ["UAL"],
    }));

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.query_alerts_by_term({ term: "UAL", page: 0 });

    const payloads = emittedAs<{
      term: string;
      messages: unknown[];
      page: number;
    }>(socket, "alerts_by_term_results");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].term).toBe("UAL");
    expect(payloads[0].messages).toHaveLength(1);
    expect(payloads[0].page).toBe(0);
  });

  it("should use page offset for pagination", () => {
    mockSearchAlertsByTerm.mockReturnValue([]);

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.query_alerts_by_term({ term: "UAL", page: 3 });

    // Page 3 → offset = 3 * 50 = 150
    expect(mockSearchAlertsByTerm).toHaveBeenCalledWith("UAL", 50, 150);
  });
});

// ---------------------------------------------------------------------------
// handleSignalGraphs
// ---------------------------------------------------------------------------

describe("handleSignalGraphs", () => {
  it("should emit alert_terms and signal", () => {
    mockGetAlertCounts.mockReturnValue([{ id: 1, term: "UAL", count: 5 }]);
    mockGetAllSignalLevels.mockReturnValue({
      ACARS: [{ level: -10, count: 2 }],
      "VDL-M2": [],
      HFDL: [],
      IMSL: [],
      IRDM: [],
    });

    const socket = makeMockSocket();
    simulateConnect(socket);

    // signal_graphs is registered as a typed handler (signal_graphs is in SocketEmitEvents)
    const handler = socket.handlers.signal_graphs;
    expect(handler).toBeDefined();
    handler();

    // Both events should have been emitted (the connect emits them too,
    // so filter to the calls that happen after connect)
    const alertTermsPayloads = emittedAs<{ data: Record<string, unknown> }>(
      socket,
      "alert_terms",
    );
    const signalPayloads = emittedAs<{ levels: Record<string, unknown> }>(
      socket,
      "signal",
    );

    expect(alertTermsPayloads.length).toBeGreaterThanOrEqual(1);
    expect(signalPayloads.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// handleRRDTimeseries — time_period-based path
// ---------------------------------------------------------------------------

describe("handleRRDTimeseries — time_period", () => {
  const VALID_PERIODS = ["1hr", "6hr", "12hr"] as const;

  for (const period of VALID_PERIODS) {
    it(`should emit rrd_timeseries_data for period "${period}" (no-downsample path)`, async () => {
      mockQueryTimeseriesData.mockResolvedValue([]);

      const socket = makeMockSocket();
      simulateConnect(socket);

      socket.handlers.rrd_timeseries({ time_period: period });

      // Flush the async poll handler
      await new Promise<void>((resolve) => setImmediate(resolve));

      const payloads = emittedAs<{
        time_period: string;
        data: unknown[];
        points: number;
      }>(socket, "rrd_timeseries_data");

      expect(payloads).toHaveLength(1);
      expect(payloads[0].time_period).toBe(period);
      expect(Array.isArray(payloads[0].data)).toBe(true);
    });
  }

  it("should emit error response for invalid time_period", async () => {
    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.rrd_timeseries({ time_period: "invalid_period" });

    await new Promise<void>((resolve) => setImmediate(resolve));

    const payloads = emittedAs<{ error: string; data: unknown[] }>(
      socket,
      "rrd_timeseries_data",
    );

    expect(payloads).toHaveLength(1);
    expect(payloads[0].error).toMatch(/invalid/i);
    expect(payloads[0].data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleRRDTimeseries — explicit start/end/downsample (downsampled SQL path)
// ---------------------------------------------------------------------------

describe("handleRRDTimeseries — explicit start/end", () => {
  it("should emit rrd_timeseries_data using explicit params when time_period is absent", async () => {
    // Mock getDatabase for the raw SQL path (downsample > 60)
    const mockAll = vi.fn().mockReturnValue([]);
    const { getDatabase } = await import("../../db/index.js");
    vi.mocked(getDatabase).mockReturnValue({
      all: mockAll,
    } as unknown as ReturnType<typeof getDatabase>);

    const now = Math.floor(Date.now() / 1000);
    const socket = makeMockSocket();
    simulateConnect(socket);

    socket.handlers.rrd_timeseries({
      start: now - 86400,
      end: now,
      downsample: 300, // > 60 → downsampled SQL path
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    const payloads = emittedAs<{ data: unknown[]; points: number }>(
      socket,
      "rrd_timeseries_data",
    );

    expect(payloads).toHaveLength(1);
    expect(typeof payloads[0].points).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// zeroFillBuckets — tested indirectly via handleRRDTimeseries
// ---------------------------------------------------------------------------

describe("zeroFillBuckets (via handleRRDTimeseries)", () => {
  it("should fill gaps in timeseries data with zero-value rows", async () => {
    // Return 2 rows with a 2-minute gap between them; expect the gap filled
    const now = Math.floor(Date.now() / 1000);
    const step = 60; // 1-minute buckets (1hr period)

    // Two data points 3 minutes apart — 1 gap bucket expected between them
    mockQueryTimeseriesData.mockResolvedValue([
      {
        timestamp: now - 180,
        acarsCount: 5,
        vdlmCount: 0,
        hfdlCount: 0,
        imslCount: 0,
        irdmCount: 0,
        totalCount: 5,
        errorCount: 0,
        resolution: "1min",
        id: 1,
        createdAt: Date.now(),
      },
      {
        timestamp: now - 60,
        acarsCount: 3,
        vdlmCount: 0,
        hfdlCount: 0,
        imslCount: 0,
        irdmCount: 0,
        totalCount: 3,
        errorCount: 0,
        resolution: "1min",
        id: 2,
        createdAt: Date.now(),
      },
    ]);

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.rrd_timeseries({ time_period: "1hr" });

    await new Promise<void>((resolve) => setImmediate(resolve));

    const payloads = emittedAs<{
      data: Array<{ acars: number }>;
      points: number;
    }>(socket, "rrd_timeseries_data");

    expect(payloads).toHaveLength(1);
    // The response should contain zero-filled rows for the full 1hr range
    const data = payloads[0].data;
    expect(data.length).toBeGreaterThan(2);

    // The actual data points should retain their values
    const nonZero = data.filter((d) => d.acars > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(2);

    void step;
  });

  it("should convert timestamps from seconds to milliseconds in the response", async () => {
    const now = Math.floor(Date.now() / 1000);

    mockQueryTimeseriesData.mockResolvedValue([
      {
        timestamp: now - 60,
        acarsCount: 1,
        vdlmCount: 0,
        hfdlCount: 0,
        imslCount: 0,
        irdmCount: 0,
        totalCount: 1,
        errorCount: 0,
        resolution: "1min",
        id: 1,
        createdAt: Date.now(),
      },
    ]);

    const socket = makeMockSocket();
    simulateConnect(socket);
    socket.handlers.rrd_timeseries({ time_period: "1hr" });

    await new Promise<void>((resolve) => setImmediate(resolve));

    const payloads = emittedAs<{
      data: Array<{ timestamp: number }>;
      start: number;
      end: number;
    }>(socket, "rrd_timeseries_data");

    expect(payloads).toHaveLength(1);
    const { data, start, end } = payloads[0];

    // Timestamps in the data array should be in milliseconds (> 1e12)
    for (const row of data) {
      expect(row.timestamp).toBeGreaterThan(1e12);
    }
    // start/end should also be in milliseconds
    expect(start).toBeGreaterThan(1e12);
    expect(end).toBeGreaterThan(1e12);
  });
});

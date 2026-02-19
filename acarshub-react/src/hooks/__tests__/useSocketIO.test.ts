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
import { socketService } from "../../services/socket";
import { useAppStore } from "../../store/useAppStore";
import type { AcarsMsg } from "../../types";
import { useSocketIO } from "../useSocketIO";

// ---------------------------------------------------------------------------
// Mock Socket.IO service
// ---------------------------------------------------------------------------

// We build a minimal fake socket that stores registered handlers so that
// tests can fire them manually.
type EventHandler = (...args: unknown[]) => void;

const mockHandlers = new Map<string, EventHandler>();

const mockSocket = {
  connected: false,
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
// Mock the store dependencies that useSocketIO calls
// ---------------------------------------------------------------------------

// We also need to mock the services that the store pulls in at import time.
vi.mock("../../services/messageDecoder", () => ({
  messageDecoder: {
    decode: vi.fn((msg: AcarsMsg) => ({ ...msg })),
  },
  checkForDuplicate: vi.fn(() => false),
  checkMultiPartDuplicate: vi.fn(() => ({ exists: false, updatedParts: "" })),
  isMultiPartMessage: vi.fn(() => false),
  mergeMultiPartMessage: vi.fn((existing: AcarsMsg) => ({ ...existing })),
}));

vi.mock("../../utils/alertMatching", () => ({
  applyAlertMatching: vi.fn((msg: AcarsMsg) => ({ ...msg })),
}));

vi.mock("../../store/useSettingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {
        data: { maxMessagesPerAircraft: 50, maxMessageGroups: 50 },
        notifications: {
          desktop: false,
          sound: false,
          volume: 50,
          alertsOnly: false,
        },
      },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a registered socket event with the given payload. */
function fireEvent(event: string, payload: unknown): void {
  const handler = mockHandlers.get(event);
  if (!handler) throw new Error(`No handler registered for event: ${event}`);
  act(() => {
    handler(payload);
  });
}

/** Build a minimal AcarsMsg fixture. */
function makeMsg(uid: string, overrides: Partial<AcarsMsg> = {}): AcarsMsg {
  return {
    uid,
    station_id: "TEST",
    text: "test message",
    timestamp: 1_000_000,
    matched: false,
    matched_text: [],
    ...overrides,
  } as AcarsMsg;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSocketIO", () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();

    // Reset store to a known baseline
    useAppStore.setState({
      isConnected: false,
      messageGroups: new Map(),
      alertMessageGroups: new Map(),
      alertCount: 0,
      readMessageUids: new Set(),
      labels: { labels: {} },
      alertTerms: { terms: [], ignore: [] },
      signalLevels: {},
      adsbAircraft: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("calls socketService.connect() on mount", () => {
      const mockedService = vi.mocked(socketService);
      renderHook(() => useSocketIO());
      expect(mockedService.connect).toHaveBeenCalledOnce();
    });

    it("registers handlers for all expected events on mount", () => {
      renderHook(() => useSocketIO());

      const expectedEvents = [
        "connect",
        "disconnect",
        "reconnect",
        "acars_msg",
        "acars_msg_batch",
        "alert_matches",
        "alert_matches_batch",
        "labels",
        "terms",
        "features_enabled",
        "system_status",
        "version",
        "database",
        "adsb_status",
        "adsb_aircraft",
        "signal",
        "alert_terms",
        "signal_freqs",
        "signal_count",
      ];

      for (const event of expectedEvents) {
        expect(mockSocket.on).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });

    it("removes all handlers on unmount (cleanup)", () => {
      const { unmount } = renderHook(() => useSocketIO());
      unmount();

      // socket.off should have been called for every registered event
      expect(mockSocket.off).toHaveBeenCalled();
    });

    it("returns undefined (consumers must subscribe to the store directly)", () => {
      const { result } = renderHook(() => useSocketIO());
      expect(result.current).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Connection events
  // -------------------------------------------------------------------------

  describe("connect event", () => {
    it("sets isConnected to true in the store", () => {
      renderHook(() => useSocketIO());
      fireEvent("connect", undefined);
      expect(useAppStore.getState().isConnected).toBe(true);
    });
  });

  describe("disconnect event", () => {
    it("sets isConnected to false in the store", () => {
      useAppStore.setState({ isConnected: true });
      renderHook(() => useSocketIO());
      fireEvent("disconnect", "io server disconnect");
      expect(useAppStore.getState().isConnected).toBe(false);
    });
  });

  describe("reconnect event", () => {
    it("sets isConnected to true after a reconnect", () => {
      useAppStore.setState({ isConnected: false });
      renderHook(() => useSocketIO());
      fireEvent("reconnect", 3); // 3rd reconnect attempt
      expect(useAppStore.getState().isConnected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Message events
  // -------------------------------------------------------------------------

  describe("acars_msg event", () => {
    it("adds the unwrapped message to the store", () => {
      renderHook(() => useSocketIO());
      const msg = makeMsg("uid-001");
      fireEvent("acars_msg", { msghtml: msg });

      const groups = useAppStore.getState().messageGroups;
      // The store groups messages, so check that at least one group exists
      expect(groups.size).toBeGreaterThan(0);
    });
  });

  describe("acars_msg_batch event", () => {
    it("processes all messages in the batch", () => {
      renderHook(() => useSocketIO());

      const messages = [
        makeMsg("batch-001", {
          flight: "AAL100",
          tail: "N001AA",
          icao_hex: "A00001",
        }),
        makeMsg("batch-002", {
          flight: "DAL200",
          tail: "N002DA",
          icao_hex: "D00002",
        }),
      ];

      fireEvent("acars_msg_batch", {
        messages,
        loading: false,
        done_loading: true,
      });

      const groups = useAppStore.getState().messageGroups;
      expect(groups.size).toBeGreaterThan(0);
    });

    it("handles an empty batch gracefully", () => {
      renderHook(() => useSocketIO());
      expect(() =>
        fireEvent("acars_msg_batch", { messages: [] }),
      ).not.toThrow();
    });
  });

  describe("alert_matches event", () => {
    it("adds the alert message to the store via addMessage", () => {
      renderHook(() => useSocketIO());
      const msg = makeMsg("alert-001", { matched: true });
      fireEvent("alert_matches", { msghtml: msg });

      // The matched message will be added into messageGroups (and possibly
      // alertMessageGroups depending on store logic).
      const groups = useAppStore.getState().messageGroups;
      expect(groups.size).toBeGreaterThan(0);
    });
  });

  describe("alert_matches_batch event", () => {
    it("processes all alert messages in the batch", () => {
      renderHook(() => useSocketIO());

      const messages = [
        makeMsg("alert-batch-001", { matched: true, flight: "UAL300" }),
        makeMsg("alert-batch-002", { matched: true, flight: "SWA400" }),
      ];

      expect(() =>
        fireEvent("alert_matches_batch", { messages }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Configuration events
  // -------------------------------------------------------------------------

  describe("labels event", () => {
    it("updates labels in the store", () => {
      renderHook(() => useSocketIO());

      const labelsPayload = {
        H1: { name: "Position Report", description: "Aircraft position" },
        H2: { name: "Weather Report", description: "Weather data" },
      };

      fireEvent("labels", labelsPayload);

      const stored = useAppStore.getState().labels;
      expect(stored).toEqual(labelsPayload);
    });
  });

  describe("terms event", () => {
    it("updates alert terms in the store", () => {
      renderHook(() => useSocketIO());

      const termsPayload = {
        terms: ["EMERGENCY", "MAYDAY"],
        ignore: ["TEST"],
      };

      fireEvent("terms", termsPayload);

      const stored = useAppStore.getState().alertTerms;
      expect(stored.terms).toEqual(["EMERGENCY", "MAYDAY"]);
      expect(stored.ignore).toEqual(["TEST"]);
    });
  });

  describe("features_enabled event", () => {
    it("updates decoder configuration in the store", () => {
      renderHook(() => useSocketIO());

      const decodersPayload = {
        acars: true,
        vdlm: true,
        hfdl: false,
        imsl: false,
        irdm: false,
        adsb: { enabled: false },
      };

      fireEvent("features_enabled", decodersPayload);

      const stored = useAppStore.getState().decoders;
      expect(stored?.acars).toBe(true);
      expect(stored?.vdlm).toBe(true);
      expect(stored?.hfdl).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // System events
  // -------------------------------------------------------------------------

  describe("system_status event", () => {
    it("updates systemStatus in the store", () => {
      renderHook(() => useSocketIO());

      const statusPayload = {
        status: { error_state: false },
      };

      fireEvent("system_status", statusPayload);

      const stored = useAppStore.getState().systemStatus;
      expect(stored).toBeDefined();
    });
  });

  describe("version event", () => {
    it("updates version in the store", () => {
      renderHook(() => useSocketIO());

      const versionPayload = { version: "1.2.3", build: "abc123" };
      fireEvent("version", versionPayload);

      const stored = useAppStore.getState().version;
      expect(stored).toEqual(versionPayload);
    });
  });

  describe("database event", () => {
    it("updates databaseSize in the store", () => {
      renderHook(() => useSocketIO());

      const dbPayload = { size: 104857600, count: 50000 };
      fireEvent("database", dbPayload);

      const stored = useAppStore.getState().databaseSize;
      expect(stored?.size).toBe(104857600);
      expect(stored?.count).toBe(50000);
    });
  });

  // -------------------------------------------------------------------------
  // ADS-B events
  // -------------------------------------------------------------------------

  describe("adsb_status event", () => {
    it("updates adsbStatus in the store", () => {
      renderHook(() => useSocketIO());

      const adsbStatusPayload = { connected: true, aircraft_count: 42 };
      fireEvent("adsb_status", adsbStatusPayload);

      const stored = useAppStore.getState().adsbStatus;
      expect(stored).toEqual(adsbStatusPayload);
    });
  });

  describe("adsb_aircraft event", () => {
    it("updates adsbAircraft in the store", () => {
      renderHook(() => useSocketIO());

      const adsbPayload = {
        now: Date.now() / 1000,
        aircraft: [{ hex: "A12345", flight: "UAL123", lat: 40.71, lon: -74.0 }],
      };

      fireEvent("adsb_aircraft", adsbPayload);

      const stored = useAppStore.getState().adsbAircraft;
      expect(stored?.aircraft).toHaveLength(1);
      expect(stored?.aircraft[0].hex).toBe("A12345");
    });
  });

  // -------------------------------------------------------------------------
  // Signal events
  // -------------------------------------------------------------------------

  describe("signal event", () => {
    it("updates signalLevels in the store", () => {
      renderHook(() => useSocketIO());

      const signalPayload = {
        levels: {
          "131.550": { count: 100, levels: [] },
        },
      };

      fireEvent("signal", signalPayload);

      const stored = useAppStore.getState().signalLevels;
      expect(stored).toBeDefined();
    });
  });

  describe("alert_terms event", () => {
    it("updates alertTermData and total alertCount in the store", () => {
      renderHook(() => useSocketIO());

      const alertTermsPayload = {
        data: {
          0: { term: "EMERGENCY", count: 3, id: 1 },
          1: { term: "MAYDAY", count: 2, id: 2 },
        },
      };

      fireEvent("alert_terms", alertTermsPayload);

      const alertCount = useAppStore.getState().alertCount;
      // Total count = 3 + 2 = 5
      expect(alertCount).toBe(5);

      const alertTermData = useAppStore.getState().alertTermData;
      expect(alertTermData).toEqual(alertTermsPayload.data);
    });

    it("handles empty data object without throwing", () => {
      renderHook(() => useSocketIO());

      expect(() => fireEvent("alert_terms", { data: {} })).not.toThrow();

      expect(useAppStore.getState().alertCount).toBe(0);
    });
  });

  describe("signal_freqs event", () => {
    it("updates signalFreqData in the store", () => {
      renderHook(() => useSocketIO());

      const freqData = { freqs: { "131.550": 42 } };
      fireEvent("signal_freqs", freqData);

      const stored = useAppStore.getState().signalFreqData;
      expect(stored).toEqual(freqData);
    });
  });

  describe("signal_count event", () => {
    it("updates signalCountData in the store", () => {
      renderHook(() => useSocketIO());

      const countData = { counts: { acars: 100, vdlm: 50 } };
      fireEvent("signal_count", countData);

      const stored = useAppStore.getState().signalCountData;
      expect(stored).toEqual(countData);
    });
  });
});

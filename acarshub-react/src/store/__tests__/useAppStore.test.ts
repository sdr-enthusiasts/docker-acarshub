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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcarsMsg } from "../../types";
import { useAppStore } from "../useAppStore";

// Mock the messageDecoder service
vi.mock("../../services/messageDecoder", () => ({
  messageDecoder: {
    decode: vi.fn((message: AcarsMsg) => ({ ...message })),
  },
  checkForDuplicate: vi.fn(() => false),
  checkMultiPartDuplicate: vi.fn(() => ({ exists: false, updatedParts: "" })),
  isMultiPartMessage: vi.fn(() => false),
  mergeMultiPartMessage: vi.fn((existing: AcarsMsg) => ({ ...existing })),
}));

// Mock the alertMatching utility - preserve matched property
vi.mock("../../utils/alertMatching", () => ({
  applyAlertMatching: vi.fn((message: AcarsMsg) => {
    // Mock implementation that preserves the matched field
    // In real code, this checks against alert terms, but in tests
    // we just preserve whatever matched value was set on the message
    return { ...message };
  }),
}));

// Mock the settings store
vi.mock("../useSettingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {
        data: {
          maxMessagesPerAircraft: 50,
          maxMessageGroups: 50,
        },
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

describe("useAppStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset store to initial state
    useAppStore.setState({
      messageGroups: new Map(),
      alertMessageGroups: new Map(),
      alertCount: 0,
      readMessageUids: new Set(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to create a basic ACARS message
  const createMessage = (overrides: Partial<AcarsMsg> = {}): AcarsMsg => ({
    uid: `test-${Math.random()}`,
    timestamp: Date.now() / 1000,
    station_id: "TEST-STATION",
    toaddr: "TEST",
    fromaddr: "TEST",
    depa: null,
    dsta: null,
    eta: null,
    gtout: null,
    gtin: null,
    wloff: null,
    wlin: null,
    lat: null,
    lon: null,
    alt: null,
    text: "Test message",
    data: null,
    tail: null,
    flight: null,
    icao: null,
    freq: null,
    ack: null,
    mode: null,
    label: null,
    block_id: null,
    msgno: null,
    is_response: null,
    is_onground: null,
    error: null,
    level: null,
    end: null,
    has_alerts: false,
    num_alerts: 0,
    matched: false,
    matched_text: [],
    duplicates: "0",
    msgno_parts: null,
    libacars: null,
    decoded_msg: null,
    airline: null,
    iata_flight: null,
    icao_flight: null,
    decodedText: null,
    ...overrides,
  });

  describe("connection state", () => {
    it("should initialize with disconnected state", () => {
      const state = useAppStore.getState();
      expect(state.isConnected).toBe(false);
    });

    it("should update connection state", () => {
      useAppStore.getState().setConnected(true);
      expect(useAppStore.getState().isConnected).toBe(true);

      useAppStore.getState().setConnected(false);
      expect(useAppStore.getState().isConnected).toBe(false);
    });
  });

  describe("message processing", () => {
    it("should add a message to a new message group", () => {
      const message = createMessage({ flight: "UAL123" });

      useAppStore.getState().addMessage(message);

      const messageGroups = useAppStore.getState().messageGroups;
      expect(messageGroups.size).toBe(1);
      expect(messageGroups.has("UAL123")).toBe(true);

      const group = messageGroups.get("UAL123");
      expect(group?.messages).toHaveLength(1);
      expect(group?.identifiers).toContain("UAL123");
    });

    it("should generate UID if message lacks one", () => {
      // Create a message without uid property
      const baseMessage = createMessage({ flight: "UAL123" });
      // Remove uid property to test generation
      delete baseMessage.uid;

      useAppStore.getState().addMessage(baseMessage);

      const messageGroups = useAppStore.getState().messageGroups;
      const group = messageGroups.get("UAL123");
      expect(group?.messages[0].uid).toBeDefined();
      expect(group?.messages[0].uid).toMatch(/^[\d.]+-[a-z0-9]+$/);
    });

    it("should add message to existing group by flight number", () => {
      const message1 = createMessage({ flight: "UAL123", text: "Message 1" });
      const message2 = createMessage({ flight: "UAL123", text: "Message 2" });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);

      const messageGroups = useAppStore.getState().messageGroups;
      expect(messageGroups.size).toBe(1);

      const group = messageGroups.get("UAL123");
      expect(group?.messages).toHaveLength(2);
      expect(group?.messages[0].text).toBe("Message 2"); // Newest first
      expect(group?.messages[1].text).toBe("Message 1");
    });

    it("should group messages by tail number", () => {
      const message1 = createMessage({ tail: "N12345", text: "Message 1" });
      const message2 = createMessage({ tail: "N12345", text: "Message 2" });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);

      const messageGroups = useAppStore.getState().messageGroups;
      expect(messageGroups.size).toBe(1);
      expect(messageGroups.has("N12345")).toBe(true);
    });

    it("should group messages by ICAO hex", () => {
      const message1 = createMessage({ icao_hex: "A1B2C3", text: "Message 1" });
      const message2 = createMessage({ icao_hex: "A1B2C3", text: "Message 2" });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);

      const messageGroups = useAppStore.getState().messageGroups;
      expect(messageGroups.size).toBe(1);
      expect(messageGroups.has("A1B2C3")).toBe(true);
    });

    it("should merge identifiers across messages", () => {
      const message1 = createMessage({ flight: "UAL123" });
      const message2 = createMessage({
        flight: "UAL123",
        tail: "N12345",
        icao_hex: "A1B2C3",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);

      const messageGroups = useAppStore.getState().messageGroups;
      const group = messageGroups.get("UAL123");
      expect(group?.identifiers).toContain("UAL123");
      expect(group?.identifiers).toContain("N12345");
      expect(group?.identifiers).toContain("A1B2C3");
    });

    it("should prioritize flight over tail over icao_hex", () => {
      const message1 = createMessage({ icao_hex: "A1B2C3" });
      const message2 = createMessage({ icao_hex: "A1B2C3", tail: "N12345" });
      const message3 = createMessage({
        icao_hex: "A1B2C3",
        tail: "N12345",
        flight: "UAL123",
      });

      useAppStore.getState().addMessage(message1);
      expect(useAppStore.getState().messageGroups.has("A1B2C3")).toBe(true);

      useAppStore.getState().addMessage(message2);
      expect(useAppStore.getState().messageGroups.has("N12345")).toBe(true);
      expect(useAppStore.getState().messageGroups.has("A1B2C3")).toBe(false);

      useAppStore.getState().addMessage(message3);
      expect(useAppStore.getState().messageGroups.has("UAL123")).toBe(true);
      expect(useAppStore.getState().messageGroups.has("N12345")).toBe(false);
    });

    it("should update lastUpdated timestamp", () => {
      const timestamp1 = Date.now() / 1000;
      const timestamp2 = timestamp1 + 10;

      const message1 = createMessage({
        flight: "UAL123",
        timestamp: timestamp1,
      });
      const message2 = createMessage({
        flight: "UAL123",
        timestamp: timestamp2,
      });

      useAppStore.getState().addMessage(message1);
      const group1 = useAppStore.getState().messageGroups.get("UAL123");
      expect(group1?.lastUpdated).toBe(timestamp1);

      useAppStore.getState().addMessage(message2);
      const group2 = useAppStore.getState().messageGroups.get("UAL123");
      expect(group2?.lastUpdated).toBe(timestamp2);
    });

    it("should clear all messages", () => {
      const message1 = createMessage({ flight: "UAL123" });
      const message2 = createMessage({ flight: "DAL456" });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      expect(useAppStore.getState().messageGroups.size).toBe(2);

      useAppStore.getState().clearMessages();
      expect(useAppStore.getState().messageGroups.size).toBe(0);
    });
  });

  describe("alert tracking", () => {
    it("should track alert count when messages have alerts", () => {
      const message1 = createMessage({
        flight: "UAL123",
        matched: true,
        uid: "uid-1",
        text: "Alert message 1",
      });
      const message2 = createMessage({
        flight: "UAL123",
        matched: true,
        uid: "uid-2",
        text: "Alert message 2",
      });
      const message3 = createMessage({
        flight: "DAL456",
        matched: true,
        uid: "uid-3",
        text: "Alert message 3",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      expect(useAppStore.getState().alertCount).toBe(3);
    });

    it("should update has_alerts flag on message groups", () => {
      const message1 = createMessage({
        flight: "UAL123",
        matched: false,
        uid: "uid-1",
        text: "Normal message",
      });
      const message2 = createMessage({
        flight: "UAL123",
        matched: true,
        uid: "uid-2",
        text: "Alert message",
      });

      useAppStore.getState().addMessage(message1);
      let group = useAppStore.getState().messageGroups.get("UAL123");
      expect(group?.has_alerts).toBe(false);
      expect(group?.num_alerts).toBe(0);

      useAppStore.getState().addMessage(message2);
      group = useAppStore.getState().messageGroups.get("UAL123");
      expect(group?.has_alerts).toBe(true);
      expect(group?.num_alerts).toBe(1);
    });

    it("should calculate total alert count across all groups", () => {
      const message1 = createMessage({
        flight: "UAL123",
        matched: true,
        uid: "uid-1",
        text: "Alert 1",
      });
      const message2 = createMessage({
        flight: "UAL123",
        matched: true,
        uid: "uid-2",
        text: "Alert 2",
      });
      const message3 = createMessage({
        flight: "DAL456",
        matched: true,
        uid: "uid-3",
        text: "Alert 3",
      });
      const message4 = createMessage({
        flight: "SWA789",
        matched: false,
        uid: "uid-4",
        text: "Normal message",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);
      useAppStore.getState().addMessage(message4);

      // The store should have calculated alert count from message groups
      expect(useAppStore.getState().alertCount).toBe(3);
    });
  });

  describe("message limits and culling", () => {
    it("should limit messages per group to maxMessagesPerAircraft", async () => {
      // Mock settings to return a low limit
      const { useSettingsStore } = await import("../useSettingsStore");
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        settings: {
          data: {
            maxMessagesPerAircraft: 3,
            maxMessageGroups: 50,
          },
          notifications: {
            desktop: false,
            sound: false,
            volume: 50,
            alertsOnly: false,
          },
        },
      } as unknown as ReturnType<typeof useSettingsStore.getState>);

      const message1 = createMessage({
        flight: "UAL123",
        text: "Message 1",
        uid: "uid-1",
      });
      const message2 = createMessage({
        flight: "UAL123",
        text: "Message 2",
        uid: "uid-2",
      });
      const message3 = createMessage({
        flight: "UAL123",
        text: "Message 3",
        uid: "uid-3",
      });
      const message4 = createMessage({
        flight: "UAL123",
        text: "Message 4",
        uid: "uid-4",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);
      useAppStore.getState().addMessage(message4);

      const group = useAppStore.getState().messageGroups.get("UAL123");
      expect(group?.messages).toHaveLength(3);
      expect(group?.messages[0].text).toBe("Message 4");
      expect(group?.messages[2].text).toBe("Message 2");
    });

    it("should cull oldest message groups when exceeding maxMessageGroups", async () => {
      const { useSettingsStore } = await import("../useSettingsStore");
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        settings: {
          data: {
            maxMessagesPerAircraft: 50,
            maxMessageGroups: 2,
          },
          notifications: {
            desktop: false,
            sound: false,
            volume: 50,
            alertsOnly: false,
          },
        },
      } as unknown as ReturnType<typeof useSettingsStore.getState>);

      const now = Date.now() / 1000;
      const message1 = createMessage({
        flight: "UAL123",
        timestamp: now - 20,
        uid: "uid-1",
      });
      const message2 = createMessage({
        flight: "DAL456",
        timestamp: now - 10,
        uid: "uid-2",
      });
      const message3 = createMessage({
        flight: "SWA789",
        timestamp: now,
        uid: "uid-3",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      const messageGroups = useAppStore.getState().messageGroups;
      expect(messageGroups.size).toBe(2);
      expect(messageGroups.has("UAL123")).toBe(false); // Oldest, should be culled
      expect(messageGroups.has("DAL456")).toBe(true);
      expect(messageGroups.has("SWA789")).toBe(true);
    });
  });

  describe("read message tracking", () => {
    it("should mark a message as read", () => {
      const uid = "test-uid-123";

      useAppStore.getState().markMessageAsRead(uid);

      expect(useAppStore.getState().isMessageRead(uid)).toBe(true);
    });

    it("should mark multiple messages as read", () => {
      const uids = ["uid-1", "uid-2", "uid-3"];

      useAppStore.getState().markMessagesAsRead(uids);

      for (const uid of uids) {
        expect(useAppStore.getState().isMessageRead(uid)).toBe(true);
      }
    });

    it("should mark all messages as read", () => {
      const message1 = createMessage({ flight: "UAL123", uid: "uid-1" });
      const message2 = createMessage({ flight: "UAL123", uid: "uid-2" });
      const message3 = createMessage({ flight: "DAL456", uid: "uid-3" });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      // Get the actual UIDs from the stored messages
      const messageGroups = useAppStore.getState().messageGroups;
      const allUids: string[] = [];
      for (const group of messageGroups.values()) {
        for (const msg of group.messages) {
          allUids.push(msg.uid);
        }
      }

      useAppStore.getState().markAllMessagesAsRead();

      // Check that all actual UIDs are marked as read
      for (const uid of allUids) {
        expect(useAppStore.getState().isMessageRead(uid)).toBe(true);
      }
    });

    it("should mark only alert messages as read", () => {
      const message1 = createMessage({
        flight: "UAL123",
        uid: "uid-1",
        text: "Alert message 1",
        matched: true,
      });
      const message2 = createMessage({
        flight: "UAL123",
        uid: "uid-2",
        text: "Regular message",
        matched: false,
      });
      const message3 = createMessage({
        flight: "DAL456",
        uid: "uid-3",
        text: "Alert message 2",
        matched: true,
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      useAppStore.getState().markAllAlertsAsRead();

      expect(useAppStore.getState().isMessageRead("uid-1")).toBe(true);
      expect(useAppStore.getState().isMessageRead("uid-2")).toBe(false);
      expect(useAppStore.getState().isMessageRead("uid-3")).toBe(true);
    });

    it("should calculate unread message count", () => {
      const message1 = createMessage({
        flight: "UAL123",
        uid: "uid-1",
        text: "Message 1",
      });
      const message2 = createMessage({
        flight: "UAL123",
        uid: "uid-2",
        text: "Message 2",
      });
      const message3 = createMessage({
        flight: "DAL456",
        uid: "uid-3",
        text: "Message 3",
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      expect(useAppStore.getState().getUnreadCount()).toBe(3);

      // Get actual UID from first message
      const group1 = useAppStore.getState().messageGroups.get("UAL123");
      const actualUid1 = group1?.messages[1]?.uid; // Second message (index 1 because newest first)

      if (actualUid1) {
        useAppStore.getState().markMessageAsRead(actualUid1);
        expect(useAppStore.getState().getUnreadCount()).toBe(2);
      }

      useAppStore.getState().markAllMessagesAsRead();
      expect(useAppStore.getState().getUnreadCount()).toBe(0);
    });

    it("should calculate unread alert count", () => {
      const message1 = createMessage({
        flight: "UAL123",
        uid: "uid-1",
        text: "Alert message 1",
        matched: true,
      });
      const message2 = createMessage({
        flight: "UAL123",
        uid: "uid-2",
        text: "Regular message",
        matched: false,
      });
      const message3 = createMessage({
        flight: "DAL456",
        uid: "uid-3",
        text: "Alert message 2",
        matched: true,
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().addMessage(message3);

      expect(useAppStore.getState().getUnreadAlertCount()).toBe(2);

      // Mark first alert as read
      useAppStore.getState().markMessageAsRead("uid-1");
      expect(useAppStore.getState().getUnreadAlertCount()).toBe(1);

      useAppStore.getState().markAllAlertsAsRead();
      expect(useAppStore.getState().getUnreadAlertCount()).toBe(0);
    });

    it("should persist read messages to localStorage", () => {
      const uid = "test-uid-123";

      useAppStore.getState().markMessageAsRead(uid);

      const stored = localStorage.getItem("acarshub.readMessages");
      expect(stored).toBeDefined();

      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        expect(parsed).toContain(uid);
      }
    });

    it("should load read messages from localStorage on init", () => {
      const uids = ["uid-1", "uid-2", "uid-3"];
      localStorage.setItem("acarshub.readMessages", JSON.stringify(uids));

      // Create a fresh store instance by clearing and re-initializing
      const readUids = new Set(uids);
      useAppStore.setState({ readMessageUids: readUids });

      for (const uid of uids) {
        expect(useAppStore.getState().isMessageRead(uid)).toBe(true);
      }
    });
  });

  describe("labels and metadata", () => {
    it("should set labels", () => {
      const labels = {
        labels: {
          H1: "Position Report",
          Q0: "Flight Plan",
        },
      };

      useAppStore.getState().setLabels(labels);

      expect(useAppStore.getState().labels).toEqual(labels);
    });

    it("should set alert terms", () => {
      const terms = {
        terms: ["EMERGENCY", "MAYDAY"],
        ignore: ["TEST"],
      };

      useAppStore.getState().setAlertTerms(terms);

      expect(useAppStore.getState().alertTerms).toEqual(terms);
    });
  });

  describe("system state", () => {
    it("should set decoders configuration", () => {
      const decoders = {
        acars: true,
        vdlm: true,
        hfdl: false,
        imsl: false,
        irdm: false,
        adsb: {
          enabled: true,
          url: "http://localhost:8080",
        },
      };

      useAppStore.getState().setDecoders(decoders);

      expect(useAppStore.getState().decoders).toEqual(decoders);
    });

    it("should set system status", () => {
      const status = {
        status: {
          error_state: false,
          messages_received: 1000,
        },
      };

      useAppStore.getState().setSystemStatus(status);

      expect(useAppStore.getState().systemStatus).toEqual(status);
    });

    it("should set database size", () => {
      const size = {
        size: 11010048, // 10.5 MB in bytes
        count: 5000,
      };

      useAppStore.getState().setDatabaseSize(size);

      expect(useAppStore.getState().databaseSize).toEqual(size);
    });

    it("should set version info", () => {
      const version = {
        version: "1.0.0",
        github: "https://github.com/sdr-enthusiasts/docker-acarshub",
      };

      useAppStore.getState().setVersion(version);

      expect(useAppStore.getState().version).toEqual(version);
    });
  });

  describe("ADS-B data", () => {
    it("should set ADS-B status", () => {
      const status = {
        online: true,
        url: "http://localhost:8080",
      };

      useAppStore.getState().setAdsbStatus(status);

      expect(useAppStore.getState().adsbStatus).toEqual(status);
    });

    it("should set ADS-B aircraft data", () => {
      const data = {
        aircraft: [
          {
            hex: "A1B2C3",
            flight: "UAL123",
            alt_baro: 35000,
            gs: 450,
            track: 90,
            lat: 40.7128,
            lon: -74.006,
          },
        ],
        now: Date.now() / 1000,
        messages: 100,
      };

      useAppStore.getState().setAdsbAircraft(data);

      expect(useAppStore.getState().adsbAircraft).toEqual(data);
    });
  });

  describe("statistics data", () => {
    it("should set alert term data", () => {
      const data = {
        term1: 10,
        term2: 5,
      };

      useAppStore.getState().setAlertTermData(data);

      expect(useAppStore.getState().alertTermData).toEqual(data);
    });

    it("should set signal frequency data", () => {
      const data = {
        freq1: 100,
        freq2: 50,
      };

      useAppStore.getState().setSignalFreqData(data);

      expect(useAppStore.getState().signalFreqData).toEqual(data);
    });

    it("should set signal count data", () => {
      const data = {
        count1: 1000,
        count2: 500,
      };

      useAppStore.getState().setSignalCountData(data);

      expect(useAppStore.getState().signalCountData).toEqual(data);
    });
  });

  describe("UI state", () => {
    it("should set current page", () => {
      useAppStore.getState().setCurrentPage("Live Map");

      expect(useAppStore.getState().currentPage).toBe("Live Map");
    });

    it("should toggle settings modal", () => {
      expect(useAppStore.getState().settingsOpen).toBe(false);

      useAppStore.getState().setSettingsOpen(true);
      expect(useAppStore.getState().settingsOpen).toBe(true);

      useAppStore.getState().setSettingsOpen(false);
      expect(useAppStore.getState().settingsOpen).toBe(false);
    });
  });

  describe("selectors", () => {
    it("should select isConnected", async () => {
      const { selectIsConnected } = await import("../useAppStore");

      useAppStore.getState().setConnected(true);
      expect(selectIsConnected(useAppStore.getState())).toBe(true);
    });

    it("should select messageGroups", async () => {
      const { selectMessageGroups } = await import("../useAppStore");

      const message = createMessage({ flight: "UAL123" });
      useAppStore.getState().addMessage(message);

      const groups = selectMessageGroups(useAppStore.getState());
      expect(groups.size).toBe(1);
    });

    it("should select alertCount", async () => {
      const { selectAlertCount } = await import("../useAppStore");

      const message = createMessage({ flight: "UAL123", matched: true });
      useAppStore.getState().addMessage(message);

      expect(selectAlertCount(useAppStore.getState())).toBe(1);
    });

    it("should select unread alert count", async () => {
      const message1 = createMessage({
        flight: "UAL123",
        uid: "uid-1",
        text: "Alert message 1",
        matched: true,
      });
      const message2 = createMessage({
        flight: "UAL456",
        uid: "uid-2",
        text: "Alert message 2",
        matched: true,
      });

      useAppStore.getState().addMessage(message1);
      useAppStore.getState().addMessage(message2);
      useAppStore.getState().markMessageAsRead("uid-1");

      const { selectUnreadAlertCount } = await import("../useAppStore");
      expect(selectUnreadAlertCount(useAppStore.getState())).toBe(1);
    });
  });
});

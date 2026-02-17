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

import type { AcarsMsg } from "@acarshub/types";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertMessage,
  duplicateMessage,
  emptyMessage,
  hfdlMessage,
  libacarsMessage,
  multiPartMessages,
  simpleAcarsMessage,
  vdlm2Message,
} from "@/__fixtures__/messages";
import type { AppState } from "@/store/useAppStore";
import type { SettingsState } from "@/store/useSettingsStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { MessageCard } from "../MessageCard";

// Create a comprehensive mock for AppState
const createMockAppState = (
  overrides: {
    readMessageUids?: Set<string>;
    markMessageAsRead?: ReturnType<typeof vi.fn>;
  } = {},
) => ({
  isConnected: false,
  setConnected: vi.fn(),
  messageGroups: new Map(),
  addMessage: vi.fn(),
  clearMessages: vi.fn(),
  alertMessageGroups: new Map(),
  addAlertMessage: vi.fn(),
  clearAlertMessages: vi.fn(),
  notifications: {
    desktop: false,
    sound: false,
    volume: 0.5,
    onPageAlerts: true,
  },
  readMessageUids: overrides.readMessageUids || new Set<string>(),
  markMessageAsRead: overrides.markMessageAsRead || vi.fn(),
  markMessagesAsRead: vi.fn(),
  markAllMessagesAsRead: vi.fn(),
  markAllAlertsAsRead: vi.fn(),
  isMessageRead: vi.fn(),
  getUnreadCount: vi.fn(() => 0),
  getUnreadAlertCount: vi.fn(() => 0),
  labels: { labels: {} },
  setLabels: vi.fn(),
  alertTerms: { terms: [] },
  setAlertTerms: vi.fn(),
  alertCount: 0,
  setAlertCount: vi.fn(),
  decoders: null,
  setDecoders: vi.fn(),
  systemStatus: null,
  setSystemStatus: vi.fn(),
  databaseSize: null,
  setDatabaseSize: vi.fn(),
  version: null,
  setVersion: vi.fn(),
  adsbStatus: null,
  setAdsbStatus: vi.fn(),
  signalLevels: null,
  setSignalLevels: vi.fn(),
  alertTermData: null,
  setAlertTermData: vi.fn(),
  signalFreqData: null,
  setSignalFreqData: vi.fn(),
  signalCountData: null,
  setSignalCountData: vi.fn(),
  adsbAircraft: null,
  setAdsbAircraft: vi.fn(),
  currentPage: "live",
  setCurrentPage: vi.fn(),
});

// Mock Zustand stores
vi.mock("@/store/useAppStore", () => ({
  useAppStore: vi.fn((selector) => {
    const state = createMockAppState();
    return selector(state);
  }),
}));

// Create a shared mock state that can be updated in tests
const createMockSettings = (
  timeFormat: "12h" | "24h" | "auto" = "24h",
  dateFormat: "auto" | "mdy" | "dmy" | "ymd" | "long" | "short" = "ymd",
  timezone: "local" | "utc" = "utc",
) => ({
  settings: {
    appearance: {
      theme: "mocha" as const,
      showConnectionStatus: true,
      animations: true,
    },
    regional: {
      timeFormat,
      dateFormat,
      timezone,
      locale: undefined,
      altitudeUnit: "feet" as const,
    },
    notifications: {
      desktopNotifications: false,
      soundAlerts: false,
      volume: 0.5,
      onPageAlerts: true,
    },
    data: {
      maxMessagesPerAircraft: 50,
      maxMessageGroups: 100,
      enableCaching: true,
      autoClearMinutes: 0,
    },
    map: {
      provider: "carto_dark_all" as const,
      customTileUrl: undefined,
      userSelectedProvider: false,
      stationLat: 0,
      stationLon: 0,
      rangeRings: [100, 200, 300],
      defaultCenterLat: 0,
      defaultCenterLon: 0,
      defaultZoom: 6,
      showOnlyAcars: false,
      showDatablocks: true,
      showExtendedDatablocks: false,
      showNexrad: false,
      showRangeRings: true,
      showOnlyUnread: false,
      showOnlyMilitary: false,
      showOnlyInteresting: false,
      showOnlyPIA: false,
      showOnlyLADD: false,
      showOpenAIP: false,
      showRainViewer: false,
      useSprites: true,
      colorByDecoder: false,
      groundAltitudeThreshold: 5000,
    },
    geoJSONOverlays: {},
    advanced: {
      logLevel: "info" as const,
      persistLogs: false,
    },
    updatedAt: Date.now(),
    version: 6,
  },
  setTheme: vi.fn(),
  setShowConnectionStatus: vi.fn(),
  setAnimations: vi.fn(),
  setTimeFormat: vi.fn(),
  setDateFormat: vi.fn(),
  setTimezone: vi.fn(),
  setLocale: vi.fn(),
  setAltitudeUnit: vi.fn(),
  setDesktopNotifications: vi.fn(),
  setSoundAlerts: vi.fn(),
  setVolume: vi.fn(),
  setOnPageAlerts: vi.fn(),
  setMaxMessagesPerAircraft: vi.fn(),
  setMaxMessageGroups: vi.fn(),
  setEnableCaching: vi.fn(),
  setAutoClearMinutes: vi.fn(),
  setMapProvider: vi.fn(),
  resetMapProviderToDefault: vi.fn(),
  setCustomTileUrl: vi.fn(),
  setStationLocation: vi.fn(),
  setRangeRings: vi.fn(),
  setDefaultMapView: vi.fn(),
  setShowOnlyAcars: vi.fn(),
  setShowDatablocks: vi.fn(),
  setShowExtendedDatablocks: vi.fn(),
  setShowNexrad: vi.fn(),
  setShowRangeRings: vi.fn(),
  setShowOnlyUnread: vi.fn(),
  setShowOnlyMilitary: vi.fn(),
  setShowOnlyInteresting: vi.fn(),
  setShowOnlyPIA: vi.fn(),
  setShowOnlyLADD: vi.fn(),
  setShowOpenAIP: vi.fn(),
  setShowRainViewer: vi.fn(),
  setUseSprites: vi.fn(),
  setColorByDecoder: vi.fn(),
  setGroundAltitudeThreshold: vi.fn(),
  setGeoJSONOverlay: vi.fn(),
  toggleGeoJSONOverlay: vi.fn(),
  setGeoJSONCategoryEnabled: vi.fn(),
  setLogLevel: vi.fn(),
  setPersistLogs: vi.fn(),
  updateAppearanceSettings: vi.fn(),
  updateRegionalSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
  updateDataSettings: vi.fn(),
  updateMapSettings: vi.fn(),
  updateAdvancedSettings: vi.fn(),
  resetToDefaults: vi.fn(),
  exportSettings: vi.fn(() => "{}"),
  importSettings: vi.fn(),
});

vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = createMockSettings();
    return selector(state);
  }),
}));

describe("MessageCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock
    vi.mocked(useSettingsStore).mockImplementation((selector) => {
      const state = createMockSettings();
      return selector(state as unknown as SettingsState);
    });
  });

  describe("Basic Rendering", () => {
    it("renders simple ACARS message with all identifiers", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("N12345")).toBeInTheDocument();
      expect(screen.getByText("United Airlines 123")).toBeInTheDocument();
      expect(
        screen.getByText("United Airlines", {
          selector: ".message-field__value",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });

    it("renders message type badge", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      const badge = screen.getByText("ACARS");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("message-type--acars");
    });

    it("renders station ID", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("TEST-ACARS")).toBeInTheDocument();
    });

    it("renders timestamp", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      // Should show time in UTC with date and time (ymd format includes date)
      expect(screen.getByText(/2024-01-01, 17:00:00/)).toBeInTheDocument();
    });

    it("renders message label", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Message Label")).toBeInTheDocument();
      expect(screen.getByText("H1")).toBeInTheDocument();
    });

    it("renders message text", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Text:")).toBeInTheDocument();
      expect(
        screen.getByText(/POSITION REPORT - OVER BROAK/),
      ).toBeInTheDocument();
    });

    it("renders flight information when present", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Departing")).toBeInTheDocument();
      expect(screen.getByText("KSFO")).toBeInTheDocument();
      expect(screen.getByText("Destination")).toBeInTheDocument();
      expect(screen.getByText("KJFK")).toBeInTheDocument();
    });

    it("renders position data when present", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Latitude")).toBeInTheDocument();
      expect(screen.getByText(/37\.774900/)).toBeInTheDocument();
      expect(screen.getByText("Longitude")).toBeInTheDocument();
      expect(screen.getByText(/-122\.419400/)).toBeInTheDocument();
    });

    it("renders altitude when present", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Altitude")).toBeInTheDocument();
      expect(screen.getByText(/35000 ft/)).toBeInTheDocument();
    });

    it("renders frequency", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Frequency")).toBeInTheDocument();
      expect(screen.getByText(/131\.550 MHz/)).toBeInTheDocument();
    });

    it("renders signal level", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("Signal Level")).toBeInTheDocument();
      expect(screen.getByText(/-10 dB/)).toBeInTheDocument();
    });
  });

  describe("Message Types", () => {
    it("renders VDLM2 message with correct badge", () => {
      render(<MessageCard message={vdlm2Message} />);

      const badge = screen.getByText("VDLM2");
      expect(badge).toBeInTheDocument();
      // The component uses message_type to determine the class
      // VDLM2 -> message-type--vdlm2 (not --vdlm)
      expect(badge).toHaveClass("message-type");
    });

    it("renders HFDL message with correct badge", () => {
      render(<MessageCard message={hfdlMessage} />);

      const badge = screen.getByText("HFDL");
      expect(badge).toHaveClass("message-type--hfdl");
    });

    it("renders HFDL frequency in MHz (converted from Hz)", () => {
      render(<MessageCard message={hfdlMessage} />);

      expect(screen.getByText("17.919 MHz")).toBeInTheDocument();
    });
  });

  describe("Empty Messages", () => {
    it("renders empty message with no text indicator", () => {
      render(<MessageCard message={emptyMessage} />);

      // The message has text: null (no content)
      // So it should render the empty content div with "No text"
      const noTextElement = screen.getByText("No text");
      expect(noTextElement).toBeInTheDocument();
      expect(noTextElement.tagName).toBe("EM");
    });

    it("still renders identifiers for empty message", () => {
      render(<MessageCard message={emptyMessage} />);

      expect(screen.getByText("N44444")).toBeInTheDocument();
      expect(screen.getByText("FedEx 888")).toBeInTheDocument();
    });
  });

  describe("Duplicate Messages", () => {
    it("renders duplicate counter when showDuplicates prop provided", () => {
      render(<MessageCard message={duplicateMessage} showDuplicates="1" />);

      expect(screen.getByText("Duplicate(s) Received")).toBeInTheDocument();
      // Use within() to scope to the correct field
      const duplicateField = screen
        .getByText("Duplicate(s) Received")
        .closest(".message-field");
      expect(duplicateField).toHaveTextContent("1");
    });

    it("does not render duplicate field when prop not provided", () => {
      render(<MessageCard message={duplicateMessage} />);

      expect(
        screen.queryByText("Duplicate(s) Received"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Multi-Part Messages", () => {
    it("renders message parts when showMessageParts prop provided", () => {
      render(
        <MessageCard
          message={multiPartMessages[0]}
          showMessageParts="M01A M02A M03A"
        />,
      );

      expect(screen.getByText("Message Parts")).toBeInTheDocument();
      expect(screen.getByText("M01A M02A M03A")).toBeInTheDocument();
    });

    it("does not render message parts field when prop not provided", () => {
      render(<MessageCard message={multiPartMessages[0]} />);

      expect(screen.queryByText("Message Parts")).not.toBeInTheDocument();
    });
  });

  describe("Alert Messages", () => {
    it("renders alert message with alert styling", () => {
      const { container } = render(
        <MessageCard message={alertMessage} isAlert />,
      );

      const card = container.querySelector(".message-card");
      expect(card).toHaveClass("message-card--alert");
    });

    it("highlights matched alert terms in text", () => {
      render(<MessageCard message={alertMessage} isAlert />);

      // The highlightMatchedText function wraps matched terms in <mark> tags
      // Use getAllByText since "EMERGENCY" appears both in the content and in the alert match info
      const elements = screen.getAllByText(/EMERGENCY/);
      // Find the one that's a <mark> element (highlighted in content)
      const highlightedElement = elements.find(
        (el) =>
          el.tagName === "MARK" && el.classList.contains("alert-highlight"),
      );
      expect(highlightedElement).toBeDefined();
    });

    it("does not apply alert styling when isAlert is false", () => {
      const { container } = render(<MessageCard message={alertMessage} />);

      const card = container.querySelector(".message-card");
      expect(card).not.toHaveClass("message-card--alert");
    });
  });

  describe("Libacars Decoded Data", () => {
    it("renders libacars CPDLC message", () => {
      render(<MessageCard message={libacarsMessage} />);

      // The parseAndFormatLibacars utility should format the CPDLC data
      expect(screen.getByText(/CLEARED TO FL350/)).toBeInTheDocument();
    });

    it("does not render libacars section when not present", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      // No libacars-specific content should appear
      const { container } = render(
        <MessageCard message={simpleAcarsMessage} />,
      );
      expect(
        container.querySelector(".message-card__libacars"),
      ).not.toBeInTheDocument();
    });
  });

  describe("DecodedText Display", () => {
    it("renders decoded text when present", () => {
      const messageWithDecoded: AcarsMsg = {
        ...simpleAcarsMessage,
        decodedText: {
          decoder: {
            name: "test-decoder",
            decodeLevel: "full",
          },
          formatted: [{ label: "Content", value: "Decoded content here" }],
        },
      };

      render(<MessageCard message={messageWithDecoded} />);

      expect(screen.getByText(/Decoded Text \(Full\):/)).toBeInTheDocument();
      expect(screen.getByText(/Decoded content here/)).toBeInTheDocument();
    });

    it("shows partial decode level indicator", () => {
      const messageWithPartial: AcarsMsg = {
        ...simpleAcarsMessage,
        decodedText: {
          decoder: {
            name: "test-decoder",
            decodeLevel: "partial",
          },
          formatted: [{ label: "Content", value: "Partial decode" }],
        },
      };

      render(<MessageCard message={messageWithPartial} />);

      expect(screen.getByText(/Decoded Text \(Partial\):/)).toBeInTheDocument();
    });

    it("hides raw text on small screens when decoded text exists", () => {
      const messageWithDecoded: AcarsMsg = {
        ...simpleAcarsMessage,
        decodedText: {
          decoder: {
            name: "test-decoder",
            decodeLevel: "full",
          },
          formatted: [{ label: "Content", value: "Decoded content" }],
        },
      };

      const { container } = render(
        <MessageCard message={messageWithDecoded} />,
      );

      const rawTextSection = container.querySelector(
        ".message-content--hide-small",
      );
      expect(rawTextSection).toBeInTheDocument();
    });

    it("labels raw text as Non-Decoded when decoded text exists", () => {
      const messageWithDecoded: AcarsMsg = {
        ...simpleAcarsMessage,
        decodedText: {
          decoder: {
            name: "test-decoder",
            decodeLevel: "full",
          },
          formatted: [{ label: "Content", value: "Decoded content" }],
        },
      };

      render(<MessageCard message={messageWithDecoded} />);

      expect(screen.getByText("Non-Decoded Text:")).toBeInTheDocument();
    });
  });

  describe("Read/Unread State", () => {
    it("shows Mark Read button when showMarkReadButton is true and message is unread", () => {
      render(<MessageCard message={simpleAcarsMessage} showMarkReadButton />);

      expect(
        screen.getByRole("button", { name: /mark read/i }),
      ).toBeInTheDocument();
    });

    it("does not show Mark Read button when showMarkReadButton is false", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(
        screen.queryByRole("button", { name: /mark read/i }),
      ).not.toBeInTheDocument();
    });

    it("shows Read badge when message is marked as read", async () => {
      // Mock the store to return this message as read
      const { useAppStore } = await import("@/store/useAppStore");
      vi.mocked(useAppStore).mockImplementation((selector) => {
        const state = createMockAppState({
          readMessageUids: new Set([simpleAcarsMessage.uid]),
        });
        return selector(state as unknown as AppState);
      });

      render(<MessageCard message={simpleAcarsMessage} showMarkReadButton />);

      expect(screen.getByText("Read")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /mark read/i }),
      ).not.toBeInTheDocument();
    });

    it("applies read styling when message is read", async () => {
      // Mock the store to return this message as read
      const { useAppStore } = await import("@/store/useAppStore");
      vi.mocked(useAppStore).mockImplementation((selector) => {
        const state = createMockAppState({
          readMessageUids: new Set([simpleAcarsMessage.uid]),
        });
        return selector(state as unknown as AppState);
      });

      const { container } = render(
        <MessageCard message={simpleAcarsMessage} />,
      );

      const card = container.querySelector(".message-card");
      expect(card).toHaveClass("message-card--read");
    });

    it("calls markMessageAsRead when Mark Read button is clicked", async () => {
      const user = userEvent.setup();
      const mockMarkAsRead = vi.fn();
      const { useAppStore } = await import("@/store/useAppStore");
      vi.mocked(useAppStore).mockImplementation((selector) => {
        const state = createMockAppState({
          markMessageAsRead: mockMarkAsRead,
        });
        return selector(state as unknown as AppState);
      });

      render(<MessageCard message={simpleAcarsMessage} showMarkReadButton />);

      const button = screen.getByRole("button", { name: /mark read/i });
      await user.click(button);

      expect(mockMarkAsRead).toHaveBeenCalledWith(simpleAcarsMessage.uid);
    });
  });

  describe("Settings Integration", () => {
    it("formats timestamp using 12hr format from settings", () => {
      // Update the mock to return 12h format (without 'r')
      vi.mocked(useSettingsStore).mockImplementation((selector) => {
        const state = createMockSettings("12h", "ymd", "utc");
        return selector(state as unknown as SettingsState);
      });

      render(<MessageCard message={simpleAcarsMessage} />);

      // Should show 12-hour format with AM/PM (5:00:00 PM)
      expect(screen.getByText(/2024-01-01, 5:00:00 PM/)).toBeInTheDocument();
    });

    it("formats timestamp using 24hr format from settings", () => {
      // Update the mock to return 24h format (without 'r')
      vi.mocked(useSettingsStore).mockImplementation((selector) => {
        const state = createMockSettings("24h", "ymd", "utc");
        return selector(state as unknown as SettingsState);
      });

      render(<MessageCard message={simpleAcarsMessage} />);

      // Should show 24-hour format (17:00:00)
      expect(screen.getByText(/2024-01-01, 17:00:00/)).toBeInTheDocument();
    });
  });

  describe("Hex Format Conversion", () => {
    it("converts ICAO numeric to hex format", () => {
      const messageWithNumericIcao: AcarsMsg = {
        ...simpleAcarsMessage,
        icao: 11256099, // Decimal value for ABC123
        icao_hex: undefined,
      };

      render(<MessageCard message={messageWithNumericIcao} />);

      expect(screen.getByText("ABC123")).toBeInTheDocument(); // Hex representation
    });

    it("uses icao_hex when available", () => {
      render(<MessageCard message={simpleAcarsMessage} />);

      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });

    it("ensures hex format with leading zeros", () => {
      const messageWithSmallHex: AcarsMsg = {
        ...simpleAcarsMessage,
        icao: 1, // Should pad to 000001
        icao_hex: undefined,
      };

      render(<MessageCard message={messageWithSmallHex} />);

      expect(screen.getByText("000001")).toBeInTheDocument();
    });
  });

  describe("Conditional Field Rendering", () => {
    it("hides IATA flight when same as ICAO flight", () => {
      const messageWithSameCallsign: AcarsMsg = {
        ...simpleAcarsMessage,
        iata_flight: "UAL123",
        icao_flight: "UAL123",
      };

      render(<MessageCard message={messageWithSameCallsign} />);

      expect(screen.queryByText("IATA Callsign")).not.toBeInTheDocument();
    });

    it("shows IATA flight when different from ICAO flight", () => {
      const messageWithDifferentCallsign: AcarsMsg = {
        ...simpleAcarsMessage,
        iata_flight: "UA123",
        icao_flight: "UAL123",
      };

      render(<MessageCard message={messageWithDifferentCallsign} />);

      expect(screen.getByText("IATA Callsign")).toBeInTheDocument();
      expect(screen.getByText("UA123")).toBeInTheDocument();
    });

    it("hides airline when Unknown", () => {
      const messageWithUnknownAirline: AcarsMsg = {
        ...simpleAcarsMessage,
        airline: "Unknown Airline",
      };

      render(<MessageCard message={messageWithUnknownAirline} />);

      // Airline field should not appear
      const airlineFields = screen.queryAllByText("Airline");
      expect(airlineFields).toHaveLength(0);
    });

    it("hides position when not available", () => {
      const messageWithoutPosition: AcarsMsg = {
        ...simpleAcarsMessage,
        lat: undefined,
        lon: undefined,
      };

      render(<MessageCard message={messageWithoutPosition} />);

      expect(screen.queryByText("Position:")).not.toBeInTheDocument();
    });

    it("hides flight route when airports not available", () => {
      const messageWithoutRoute: AcarsMsg = {
        ...simpleAcarsMessage,
        depa: "",
        dsta: "",
      };

      render(<MessageCard message={messageWithoutRoute} />);

      expect(screen.queryByText("Flight Route:")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("uses semantic HTML for field lists", () => {
      const { container } = render(
        <MessageCard message={simpleAcarsMessage} />,
      );

      const definitionList = container.querySelector("dl");
      expect(definitionList).toBeInTheDocument();
    });

    it("uses dt/dd elements for field pairs", () => {
      const { container } = render(
        <MessageCard message={simpleAcarsMessage} />,
      );

      const terms = container.querySelectorAll("dt");
      const definitions = container.querySelectorAll("dd");

      expect(terms.length).toBeGreaterThan(0);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it("Mark Read button has proper title attribute", () => {
      render(<MessageCard message={simpleAcarsMessage} showMarkReadButton />);

      const button = screen.getByRole("button", { name: /mark read/i });
      expect(button).toHaveAttribute("title", "Mark this alert as read");
    });
  });

  describe("Edge Cases", () => {
    it("handles missing timestamp gracefully", () => {
      const messageWithoutTimestamp: AcarsMsg = {
        ...simpleAcarsMessage,
        timestamp: 0,
        msg_time: undefined,
      };

      // Should not throw, should use fallback timestamp
      expect(() =>
        render(<MessageCard message={messageWithoutTimestamp} />),
      ).not.toThrow();
    });

    it("handles unknown message type", () => {
      const messageWithoutType: AcarsMsg = {
        ...simpleAcarsMessage,
        message_type: "UNKNOWN",
      };

      render(<MessageCard message={messageWithoutType} />);

      expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    });

    it("handles message with only data field (no text)", () => {
      const messageWithOnlyData: AcarsMsg = {
        ...simpleAcarsMessage,
        text: "",
        data: "Binary data here",
      };

      render(<MessageCard message={messageWithOnlyData} />);

      expect(screen.getByText("Data:")).toBeInTheDocument();
      expect(screen.getByText(/Binary data here/)).toBeInTheDocument();
    });

    it("handles newline characters in text", () => {
      const messageWithNewlines: AcarsMsg = {
        ...simpleAcarsMessage,
        text: "Line 1\\r\\nLine 2\\r\\nLine 3",
      };

      const { container } = render(
        <MessageCard message={messageWithNewlines} />,
      );

      // Should convert \r\n to <br> tags
      expect(container.innerHTML).toContain("<br>");
    });
  });
});

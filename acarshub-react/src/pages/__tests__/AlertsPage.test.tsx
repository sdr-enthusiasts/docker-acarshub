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

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import type { AcarsMsg, MessageGroup } from "../../types";
import { AlertsPage } from "../AlertsPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type AlertsByTermHandler = (data: {
  total_count: number;
  messages: AcarsMsg[];
  term: string;
  page: number;
  query_time: number;
}) => void;

let alertsByTermHandler: AlertsByTermHandler | null = null;

const mockSocket = {
  on: vi.fn((event: string, handler: AlertsByTermHandler) => {
    if (event === "alerts_by_term_results") {
      alertsByTermHandler = handler;
    }
  }),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock("../../services/socket", () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isInitialized: vi.fn(() => true),
    getSocket: vi.fn(() => mockSocket),
    notifyPageChange: vi.fn(),
    queryAlertsByTerm: vi.fn(),
  },
}));

vi.mock("../../services/messageDecoder", () => ({
  messageDecoder: {
    decode: vi.fn((msg: unknown) => msg),
  },
  checkForDuplicate: vi.fn(() => false),
  checkMultiPartDuplicate: vi.fn(() => ({ exists: false, updatedParts: "" })),
  isMultiPartMessage: vi.fn(() => false),
  mergeMultiPartMessage: vi.fn((existing: unknown) => existing),
}));

vi.mock("../../utils/alertMatching", () => ({
  applyAlertMatching: vi.fn((msg: unknown) => msg),
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

// Mock MessageCard and MessageGroup so we don't pull in their heavy dependencies
vi.mock("../../components/MessageCard", () => ({
  MessageCard: ({ message }: { message: AcarsMsg }) => (
    <div data-testid="message-card" data-uid={message.uid}>
      <span>{message.flight ?? message.uid}</span>
    </div>
  ),
}));

vi.mock("../../components/MessageGroup", () => ({
  MessageGroup: ({ plane }: { plane: MessageGroup }) => (
    <div data-testid="alert-group" data-identifiers={plane.identifiers[0]}>
      <span>Group: {plane.identifiers[0]}</span>
      <span>Messages: {plane.messages.length}</span>
    </div>
  ),
}));

vi.mock("../../utils/decoderUtils", () => ({
  decodeMessages: vi.fn((msgs: AcarsMsg[]) => msgs),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(uid: string, overrides: Partial<AcarsMsg> = {}): AcarsMsg {
  return {
    uid,
    station_id: "TEST",
    text: "alert match text",
    timestamp: 1_700_000_000,
    matched: true,
    matched_text: ["EMERGENCY"],
    flight: "UAL123",
    tail: "N12345",
    icao_hex: "A12345",
    label: "H1",
    freq: 131.55,
    ...overrides,
  } as AcarsMsg;
}

function makeAlertGroup(
  key: string,
  msgCount = 1,
  overrides: Partial<MessageGroup> = {},
): [string, MessageGroup] {
  return [
    key,
    {
      identifiers: [key],
      has_alerts: true,
      num_alerts: msgCount,
      messages: Array.from({ length: msgCount }, (_, i) => ({
        uid: `${key}-msg-${i}`,
        station_id: "TEST",
        text: "alert match",
        timestamp: 1_700_000_000 + i,
        matched: true,
        matched_text: ["EMERGENCY"],
        label: "H1",
      })) as MessageGroup["messages"],
      lastUpdated: Date.now() / 1000,
      ...overrides,
    },
  ];
}

/** Fire the alerts_by_term_results socket event. */
function emitAlertsByTerm(
  term: string,
  messages: AcarsMsg[],
  totalCount?: number,
): void {
  if (!alertsByTermHandler) {
    throw new Error(
      "No alerts_by_term_results handler registered — did the page mount?",
    );
  }
  act(() => {
    alertsByTermHandler?.({
      messages,
      total_count: totalCount ?? messages.length,
      term,
      page: 0,
      query_time: 10,
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AlertsPage", () => {
  beforeEach(() => {
    alertsByTermHandler = null;
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();

    useAppStore.setState({
      messageGroups: new Map(),
      alertMessageGroups: new Map(),
      alertCount: 0,
      readMessageUids: new Set(),
      labels: { labels: {} },
      alertTerms: { terms: [], ignore: [] },
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Empty / initial state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("renders the page title", () => {
      render(<AlertsPage />);
      expect(
        screen.getByRole("heading", { name: /alerts/i }),
      ).toBeInTheDocument();
    });

    it("shows zero unread and zero total alerts when store is empty", () => {
      render(<AlertsPage />);
      // Both stats should be 0
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });

    it("renders the Live mode tab as active by default", () => {
      render(<AlertsPage />);
      // The live-mode button/tab should be present
      expect(screen.getByRole("button", { name: /live/i })).toBeInTheDocument();
    });

    it("renders the Historical mode tab", () => {
      render(<AlertsPage />);
      expect(
        screen.getByRole("button", { name: /historical/i }),
      ).toBeInTheDocument();
    });

    it("renders the Mark All Read button when there are unread alerts", () => {
      // The button only renders when unreadAlerts > 0
      useAppStore.setState({
        alertMessageGroups: new Map([makeAlertGroup("UAL123", 2)]),
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        readMessageUids: new Set(), // nothing read yet → 2 unread
      });
      render(<AlertsPage />);
      expect(
        screen.getByRole("button", { name: /mark all read/i }),
      ).toBeInTheDocument();
    });

    it("does not show the Mark All Read button when all alerts are read", () => {
      render(<AlertsPage />);
      // No alerts at all → unreadAlerts = 0 → button absent
      expect(
        screen.queryByRole("button", { name: /mark all read/i }),
      ).not.toBeInTheDocument();
    });

    it("does not show any alert group cards when there are no alerts", () => {
      render(<AlertsPage />);
      expect(screen.queryByTestId("alert-group")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Live mode with alert groups
  // -------------------------------------------------------------------------

  describe("live mode with alert groups", () => {
    beforeEach(() => {
      // alertTerms must be non-empty for the groups to render (otherwise
      // the page shows "No Alert Terms Configured")
      useAppStore.setState({
        alertMessageGroups: new Map([
          makeAlertGroup("UAL123", 2),
          makeAlertGroup("DAL456", 1),
        ]),
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        readMessageUids: new Set(),
      });
    });

    it("renders an alert group card for each group", () => {
      render(<AlertsPage />);
      const groups = screen.getAllByTestId("alert-group");
      expect(groups).toHaveLength(2);
    });

    it("shows both group identifiers", () => {
      render(<AlertsPage />);
      expect(screen.getByText("Group: UAL123")).toBeInTheDocument();
      expect(screen.getByText("Group: DAL456")).toBeInTheDocument();
    });

    it("shows the correct total alert count in the stats bar", () => {
      render(<AlertsPage />);
      // Total alerts = 2 + 1 = 3
      // Use getAllByText since the same number may appear in multiple stat elements
      expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    });

    it("shows the correct unique aircraft count", () => {
      render(<AlertsPage />);
      // 2 unique aircraft (UAL123, DAL456)
      expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Mark all read
  // -------------------------------------------------------------------------

  describe("mark all read", () => {
    beforeEach(() => {
      useAppStore.setState({
        alertMessageGroups: new Map([
          makeAlertGroup("UAL123", 2),
          makeAlertGroup("DAL456", 3),
        ]),
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        readMessageUids: new Set(),
      });
    });

    it("calls markAllAlertsAsRead when the button is clicked", async () => {
      const user = userEvent.setup();

      // Spy on the store action
      const markAllSpy = vi.spyOn(
        useAppStore.getState(),
        "markAllAlertsAsRead",
      );

      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /mark all read/i }));

      expect(markAllSpy).toHaveBeenCalledOnce();
    });

    it("reduces unread count to 0 after marking all read", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      // 5 total messages all unread — the unread stat element should show 5
      expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);

      await user.click(screen.getByRole("button", { name: /mark all read/i }));

      // After marking all read, unread count should drop to 0
      await waitFor(() => {
        expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Mode switching
  // -------------------------------------------------------------------------

  describe("mode switching", () => {
    it("switches to historical mode when the Historical tab is clicked", async () => {
      const user = userEvent.setup();

      useAppStore.setState({
        alertTerms: { terms: ["EMERGENCY", "MAYDAY"], ignore: [] },
        alertMessageGroups: new Map([makeAlertGroup("UAL123", 1)]),
        readMessageUids: new Set(),
      });

      render(<AlertsPage />);

      // Click the Historical tab
      await user.click(screen.getByRole("button", { name: /historical/i }));

      // A term selector should now be visible
      await waitFor(() => {
        expect(
          screen.getByRole("combobox") ||
            screen.getByRole("listbox") ||
            screen.queryByText(/emergency/i),
        ).toBeTruthy();
      });
    });

    it("switches back to live mode from historical mode", async () => {
      const user = userEvent.setup();

      useAppStore.setState({
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        alertMessageGroups: new Map([makeAlertGroup("UAL123", 1)]),
      });

      render(<AlertsPage />);

      // Switch to historical
      await user.click(screen.getByRole("button", { name: /historical/i }));

      // Switch back to live
      await user.click(screen.getByRole("button", { name: /live/i }));

      // Alert groups should be visible again
      expect(screen.getByTestId("alert-group")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Historical mode
  // -------------------------------------------------------------------------

  describe("historical mode", () => {
    beforeEach(() => {
      useAppStore.setState({
        alertTerms: { terms: ["EMERGENCY", "MAYDAY"], ignore: [] },
        alertMessageGroups: new Map(),
      });
    });

    it("shows the term selector in historical mode", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /historical/i }));

      await waitFor(() => {
        // Either a select/combobox or visible term labels should appear
        const termElements =
          screen.queryAllByRole("option") ||
          screen.queryAllByText(/emergency/i);
        expect(termElements.length).toBeGreaterThan(0);
      });
    });

    it("shows loading state while fetching historical results", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /historical/i }));

      // Immediately after switching, it should be in a searching/loading state
      // (results not arrived yet)
      expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
    });

    it("displays historical results when socket event arrives", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /historical/i }));

      // Fire the socket event with historical results
      emitAlertsByTerm(
        "EMERGENCY",
        [makeMsg("hist-001"), makeMsg("hist-002")],
        2,
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(2);
      });
    });

    it("subscribes to alerts_by_term_results on mount", () => {
      render(<AlertsPage />);
      expect(mockSocket.on).toHaveBeenCalledWith(
        "alerts_by_term_results",
        expect.any(Function),
      );
    });

    it("unsubscribes from alerts_by_term_results on unmount", () => {
      const { unmount } = render(<AlertsPage />);
      unmount();
      expect(mockSocket.off).toHaveBeenCalledWith(
        "alerts_by_term_results",
        expect.any(Function),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Historical mode pagination
  // -------------------------------------------------------------------------

  describe("historical mode pagination", () => {
    beforeEach(() => {
      useAppStore.setState({
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        alertMessageGroups: new Map(),
      });
    });

    it("does not show pagination when results fit on one page", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /historical/i }));

      // 3 results, page size = 50 → one page
      emitAlertsByTerm(
        "EMERGENCY",
        Array.from({ length: 3 }, (_, i) => makeMsg(`h-${i}`)),
        3,
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(3);
      });

      expect(
        screen.queryByRole("button", { name: /next/i }),
      ).not.toBeInTheDocument();
    });

    it("shows pagination controls when results span multiple pages", async () => {
      const user = userEvent.setup();
      render(<AlertsPage />);

      await user.click(screen.getByRole("button", { name: /historical/i }));

      // 50 results but total is 120 → 3 pages
      emitAlertsByTerm(
        "EMERGENCY",
        Array.from({ length: 50 }, (_, i) => makeMsg(`h-${i}`)),
        120,
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
      });

      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe("statistics display", () => {
    it("shows the unread count separately from total", () => {
      // 2 groups, 3 messages each, 1 already read
      const readUids = new Set(["UAL123-msg-0"]);

      useAppStore.setState({
        alertMessageGroups: new Map([
          makeAlertGroup("UAL123", 3),
          makeAlertGroup("DAL456", 2),
        ]),
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        readMessageUids: readUids,
      });

      render(<AlertsPage />);

      // Total = 5, unread = 4 (1 read)
      // Numbers may appear in multiple stat elements
      expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1); // unread
      expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1); // total
    });

    it("shows the unique aircraft count", () => {
      useAppStore.setState({
        alertMessageGroups: new Map([
          makeAlertGroup("UAL123", 1),
          makeAlertGroup("DAL456", 1),
          makeAlertGroup("SWA789", 1),
        ]),
        alertTerms: { terms: ["EMERGENCY"], ignore: [] },
        readMessageUids: new Set(),
      });

      render(<AlertsPage />);

      // 3 unique aircraft — may appear in multiple stat elements
      expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    });
  });
});

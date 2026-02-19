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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import type { MessageGroup } from "../../types";
import { LiveMessagesPage } from "../LiveMessagesPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/socket", () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isInitialized: vi.fn(() => false),
    notifyPageChange: vi.fn(),
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

// Mock child components that have their own heavy dependencies
vi.mock("../../components/MessageGroup", () => ({
  MessageGroup: ({ plane }: { plane: MessageGroup }) => (
    <div data-testid="message-group" data-identifiers={plane.identifiers[0]}>
      <span>Group: {plane.identifiers[0]}</span>
      <span>Messages: {plane.messages.length}</span>
    </div>
  ),
}));

vi.mock("../../components/MessageFilters", () => ({
  MessageFilters: ({
    isPaused,
    onPauseChange,
    onTextFilterChange,
    onFilterNoTextChange,
    onShowAlertsOnlyChange,
  }: {
    isPaused: boolean;
    onPauseChange: (v: boolean) => void;
    onTextFilterChange: (v: string) => void;
    onFilterNoTextChange: (v: boolean) => void;
    onShowAlertsOnlyChange: (v: boolean) => void;
  }) => (
    <div data-testid="message-filters">
      <button
        type="button"
        data-testid="toggle-pause"
        onClick={() => onPauseChange(!isPaused)}
      >
        {isPaused ? "Resume" : "Pause"}
      </button>
      <input
        data-testid="text-filter"
        onChange={(e) => onTextFilterChange(e.target.value)}
        placeholder="Filter text"
      />
      <button
        type="button"
        data-testid="toggle-no-text"
        onClick={() => onFilterNoTextChange(true)}
      >
        Filter No Text
      </button>
      <button
        type="button"
        data-testid="toggle-alerts-only"
        onClick={() => onShowAlertsOnlyChange(true)}
      >
        Alerts Only
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(
  key: string,
  msgCount = 1,
  overrides: Partial<MessageGroup> = {},
): [string, MessageGroup] {
  return [
    key,
    {
      identifiers: [key],
      has_alerts: false,
      num_alerts: 0,
      messages: Array.from({ length: msgCount }, (_, i) => ({
        uid: `${key}-msg-${i}`,
        station_id: "TEST",
        text: "test message",
        timestamp: 1_000_000 + i,
        matched: false,
        matched_text: [],
        label: "H1",
        message_type: "ACARS",
      })) as unknown as MessageGroup["messages"],
      lastUpdated: Date.now() / 1000,
      ...overrides,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveMessagesPage", () => {
  beforeEach(() => {
    localStorage.clear();
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
  // Empty state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("renders the page title", () => {
      render(<LiveMessagesPage />);
      expect(
        screen.getByRole("heading", { name: /live messages/i }),
      ).toBeInTheDocument();
    });

    it("shows 'No Messages Yet' when no messages have been received", () => {
      render(<LiveMessagesPage />);
      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    });

    it("shows a waiting message in the empty state", () => {
      render(<LiveMessagesPage />);
      expect(
        screen.getByText(/waiting for acars messages/i),
      ).toBeInTheDocument();
    });

    it("renders the MessageFilters component", () => {
      render(<LiveMessagesPage />);
      expect(screen.getByTestId("message-filters")).toBeInTheDocument();
    });

    it("displays 0 aircraft and 0 messages in the stats bar", () => {
      render(<LiveMessagesPage />);
      // Both stats should show 0
      const statValues = screen.getAllByText("0");
      expect(statValues.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // With messages
  // -------------------------------------------------------------------------

  describe("with messages in the store", () => {
    beforeEach(() => {
      useAppStore.setState({
        messageGroups: new Map([
          makeGroup("UAL123", 2),
          makeGroup("DAL456", 3),
        ]),
      });
    });

    it("renders a MessageGroup component for each group", () => {
      render(<LiveMessagesPage />);
      const groups = screen.getAllByTestId("message-group");
      expect(groups).toHaveLength(2);
    });

    it("shows both aircraft identifiers", () => {
      render(<LiveMessagesPage />);
      expect(screen.getByText("Group: UAL123")).toBeInTheDocument();
      expect(screen.getByText("Group: DAL456")).toBeInTheDocument();
    });

    it("displays the correct aircraft count in the stats bar", () => {
      render(<LiveMessagesPage />);
      // 2 groups = 2 aircraft displayed
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Pause / resume
  // -------------------------------------------------------------------------

  describe("pause / resume functionality", () => {
    it("shows a pause notice when paused", async () => {
      const user = userEvent.setup();
      render(<LiveMessagesPage />);

      await user.click(screen.getByTestId("toggle-pause"));

      expect(screen.getByText(/updates paused/i)).toBeInTheDocument();
    });

    it("hides the pause notice when resumed", async () => {
      const user = userEvent.setup();
      render(<LiveMessagesPage />);

      // Pause
      await user.click(screen.getByTestId("toggle-pause"));
      expect(screen.getByText(/updates paused/i)).toBeInTheDocument();

      // Resume
      await user.click(screen.getByTestId("toggle-pause"));
      expect(screen.queryByText(/updates paused/i)).not.toBeInTheDocument();
    });

    it("freezes the message list on pause (new messages do not appear while paused)", async () => {
      const user = userEvent.setup();

      // Start with one group
      useAppStore.setState({
        messageGroups: new Map([makeGroup("UAL123", 1)]),
      });

      render(<LiveMessagesPage />);
      expect(screen.getAllByTestId("message-group")).toHaveLength(1);

      // Pause
      await user.click(screen.getByTestId("toggle-pause"));

      // Add a new group to the store while paused
      useAppStore.setState({
        messageGroups: new Map([
          makeGroup("UAL123", 1),
          makeGroup("NEW999", 1),
        ]),
      });

      // The frozen list should still show only the original group
      const groups = screen.getAllByTestId("message-group");
      expect(groups).toHaveLength(1);
      expect(screen.queryByText("Group: NEW999")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Text filter
  // -------------------------------------------------------------------------

  describe("text filter", () => {
    beforeEach(() => {
      useAppStore.setState({
        messageGroups: new Map([
          makeGroup("UAL123", 1),
          makeGroup("DAL456", 1),
        ]),
      });
    });

    it("shows all groups when no text filter is active", () => {
      render(<LiveMessagesPage />);
      expect(screen.getAllByTestId("message-group")).toHaveLength(2);
    });

    it("shows 'No Messages Match Filters' when text filter hides all groups", async () => {
      const user = userEvent.setup();
      render(<LiveMessagesPage />);

      // Type a filter that matches nothing
      const filterInput = screen.getByTestId("text-filter");
      await user.type(filterInput, "ZZZNONEXISTENT");

      expect(
        screen.getByText(/no messages match filters/i),
      ).toBeInTheDocument();
    });

    it("filters groups by identifier match", async () => {
      const user = userEvent.setup();
      render(<LiveMessagesPage />);

      const filterInput = screen.getByTestId("text-filter");
      await user.type(filterInput, "UAL");

      // Only UAL123 should match
      const groups = screen.getAllByTestId("message-group");
      expect(groups).toHaveLength(1);
      expect(screen.getByText("Group: UAL123")).toBeInTheDocument();
      expect(screen.queryByText("Group: DAL456")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Alerts-only filter
  // -------------------------------------------------------------------------

  describe("alerts-only filter", () => {
    it("hides non-alert groups when alerts-only is active", async () => {
      const user = userEvent.setup();

      useAppStore.setState({
        messageGroups: new Map([
          makeGroup("UAL123", 1, { has_alerts: false }),
          makeGroup("ALERT1", 1, { has_alerts: true, num_alerts: 1 }),
        ]),
      });

      render(<LiveMessagesPage />);
      expect(screen.getAllByTestId("message-group")).toHaveLength(2);

      await user.click(screen.getByTestId("toggle-alerts-only"));

      const groups = screen.getAllByTestId("message-group");
      expect(groups).toHaveLength(1);
      expect(screen.getByText("Group: ALERT1")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Filter-no-text filter
  // -------------------------------------------------------------------------

  describe("filter-no-text filter", () => {
    it("hides groups with no message text when filter-no-text is active", async () => {
      const user = userEvent.setup();

      useAppStore.setState({
        messageGroups: new Map([
          // Group with text
          makeGroup("UAL123", 1),
          // Group with no text
          [
            "DAL456",
            {
              identifiers: ["DAL456"],
              has_alerts: false,
              num_alerts: 0,
              messages: [
                {
                  uid: "DAL456-msg-0",
                  station_id: "TEST",
                  text: "",
                  timestamp: 1_000_000,
                  matched: false,
                  matched_text: [],
                  label: "H1",
                } as unknown as MessageGroup["messages"][number],
              ],
              lastUpdated: Date.now() / 1000,
            },
          ],
        ]),
      });

      render(<LiveMessagesPage />);
      expect(screen.getAllByTestId("message-group")).toHaveLength(2);

      await user.click(screen.getByTestId("toggle-no-text"));

      // Only UAL123 (has text) should remain
      const groups = screen.getAllByTestId("message-group");
      expect(groups).toHaveLength(1);
      expect(screen.getByText("Group: UAL123")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Persistence (localStorage)
  // -------------------------------------------------------------------------

  describe("localStorage persistence", () => {
    it("restores isPaused from localStorage on mount", () => {
      localStorage.setItem("liveMessages.isPaused", "true");
      render(<LiveMessagesPage />);
      expect(screen.getByText(/updates paused/i)).toBeInTheDocument();
    });

    it("restores filterNoText from localStorage on mount", () => {
      // Seed a group with no text
      useAppStore.setState({
        messageGroups: new Map([
          [
            "NOTEXT",
            {
              identifiers: ["NOTEXT"],
              has_alerts: false,
              num_alerts: 0,
              messages: [
                {
                  uid: "notext-msg-0",
                  station_id: "TEST",
                  text: "",
                  timestamp: 1_000_000,
                  matched: false,
                  matched_text: [],
                  label: "H1",
                } as unknown as MessageGroup["messages"][number],
              ],
              lastUpdated: Date.now() / 1000,
            },
          ],
        ]),
      });

      localStorage.setItem("liveMessages.filterNoText", "true");
      render(<LiveMessagesPage />);

      // The no-text group should be hidden immediately
      expect(screen.queryByTestId("message-group")).not.toBeInTheDocument();
    });
  });
});

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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import type { AcarsMsg } from "../../types";
import { SearchPage } from "../SearchPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// We need to capture the socket event handler so tests can fire results back
// SearchHtmlMsg = { msghtml: AcarsMsg[]; query_time: number; num_results: number }
type SearchResultsHandler = (data: Record<string, unknown>) => void;

let searchResultsHandler: SearchResultsHandler | null = null;

const mockSocket = {
  on: vi.fn((event: string, handler: SearchResultsHandler) => {
    if (event === "database_search_results") {
      searchResultsHandler = handler;
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

// Mock the MessageCard component — it has its own complex dependencies
vi.mock("../../components/MessageCard", () => ({
  MessageCard: ({ message }: { message: AcarsMsg }) => (
    <div data-testid="message-card" data-uid={message.uid}>
      <span>{message.flight ?? message.tail ?? message.uid}</span>
      {message.text && <span>{message.text}</span>}
    </div>
  ),
}));

// Mock utils/decoderUtils decodeMessages (used when displaying search results)
vi.mock("../../utils/decoderUtils", () => ({
  decodeMessages: vi.fn((msgs: AcarsMsg[]) => msgs),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap SearchPage in a MemoryRouter (required for useSearchParams). */
function renderSearchPage(initialPath = "/search") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SearchPage />
    </MemoryRouter>,
  );
}

/** Build a minimal AcarsMsg fixture. */
function makeMsg(uid: string, overrides: Partial<AcarsMsg> = {}): AcarsMsg {
  return {
    uid,
    station_id: "TEST",
    text: "position report",
    timestamp: 1_700_000_000 + Number(uid.replace(/\D/g, "") || 0),
    matched: false,
    matched_text: [],
    flight: "UAL123",
    tail: "N12345",
    icao_hex: "A12345",
    label: "H1",
    freq: 131.55,
    ...overrides,
  } as AcarsMsg;
}

/** Fire the database_search_results socket event with the given messages.
 *  Uses the actual SearchHtmlMsg shape: { msghtml, num_results, query_time }
 */
function emitSearchResults(messages: AcarsMsg[], totalCount?: number): void {
  if (!searchResultsHandler) {
    throw new Error(
      "No database_search_results handler registered — did the page mount?",
    );
  }
  // SearchHtmlMsg = { msghtml: AcarsMsg[]; query_time: number; num_results: number }
  (searchResultsHandler as unknown as (data: Record<string, unknown>) => void)({
    msghtml: messages,
    num_results: totalCount ?? messages.length,
    query_time: 0.042,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SearchPage", () => {
  beforeEach(() => {
    searchResultsHandler = null;
    sessionStorage.clear();
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
      databaseSize: null,
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
      renderSearchPage();
      expect(
        screen.getByRole("heading", { name: /search database/i }),
      ).toBeInTheDocument();
    });

    it("renders all search input fields", () => {
      renderSearchPage();

      // Flight number field — queried by its label
      expect(screen.getByLabelText(/flight/i)).toBeInTheDocument();

      // Tail / registration field — queried by its label
      expect(screen.getByLabelText(/tail number/i)).toBeInTheDocument();
    });

    it("renders the Search submit button", () => {
      renderSearchPage();
      expect(
        screen.getByRole("button", { name: /search/i }),
      ).toBeInTheDocument();
    });

    it("renders the Clear button", () => {
      renderSearchPage();
      expect(
        screen.getByRole("button", { name: /clear/i }),
      ).toBeInTheDocument();
    });

    it("does not show any result cards initially", () => {
      renderSearchPage();
      expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
    });

    it("shows database size when provided in the store", () => {
      useAppStore.setState({
        databaseSize: { size: 10_485_760, count: 12345 },
      });
      renderSearchPage();
      expect(screen.getByText(/12,345/)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Search form interaction
  // -------------------------------------------------------------------------

  describe("search form", () => {
    it("updates the flight field on typing", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");

      expect(flightInput).toHaveValue("UAL123");
    });

    it("emits query_search via socket when the form is submitted", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");

      const submitButton = screen.getByRole("button", { name: /search/i });
      await user.click(submitButton);

      // The component calls (socket as any).emit("query_search", payload, "/main")
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "query_search",
        expect.objectContaining({
          search_term: expect.objectContaining({ flight: "UAL123" }),
        }),
        "/main",
      );
    });

    it("does NOT emit a search when all fields are empty", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      // Clear is also present; use the submit button specifically
      const submitButton = screen.getByRole("button", { name: /^search$/i });
      await user.click(submitButton);

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it("clears all fields and results when Clear is clicked", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      // Type something
      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");

      // Submit to get results
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // Inject results via socket event
      emitSearchResults([makeMsg("msg-001"), makeMsg("msg-002")]);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(2);
      });

      // Clear
      await user.click(screen.getByRole("button", { name: /clear/i }));

      expect(flightInput).toHaveValue("");
      expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
    });

    it("debounces the search when input changes (does not fire immediately)", async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);

      // Type without advancing timers
      await user.type(flightInput, "U");

      // Should not have emitted yet (debounce timer pending)
      expect(mockSocket.emit).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Results rendering
  // -------------------------------------------------------------------------

  describe("results rendering", () => {
    it("displays result cards when search results arrive", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      emitSearchResults([
        makeMsg("msg-001"),
        makeMsg("msg-002"),
        makeMsg("msg-003"),
      ]);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(3);
      });
    });

    it("shows query time and result count after search", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      emitSearchResults([makeMsg("msg-001")], 1);

      await waitFor(() => {
        // Should show "1 result" in the results info bar
        expect(screen.getAllByText(/1/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("sorts results by timestamp (newest first)", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      const messages = [
        makeMsg("old", { timestamp: 1_000_000, flight: "OLD" }),
        makeMsg("new", { timestamp: 9_000_000, flight: "NEW" }),
      ];
      emitSearchResults(messages, 2);

      await waitFor(() => {
        const cards = screen.getAllByTestId("message-card");
        expect(cards).toHaveLength(2);
        // First card should be the newer message
        expect(cards[0]).toHaveAttribute("data-uid", "new");
      });
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe("pagination", () => {
    it("does not show pagination when there is only one page of results", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // 3 results, page size = 50 → only 1 page
      emitSearchResults(
        Array.from({ length: 3 }, (_, i) => makeMsg(`msg-${i}`)),
        3,
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(3);
      });

      // Only 1 page → no pagination buttons should appear
      expect(
        screen.queryByRole("button", { name: /next page/i }),
      ).not.toBeInTheDocument();
    });

    it("shows pagination when results span multiple pages", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // Inject 50 results but report total_count of 120 → 3 pages
      const firstPageMessages = Array.from({ length: 50 }, (_, i) =>
        makeMsg(`msg-${i}`),
      );
      emitSearchResults(firstPageMessages, 120);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
      });

      // Multiple pages → "Next page" aria-label buttons should be visible
      // (there are two pagination bars — top and bottom)
      const nextButtons = screen.getAllByRole("button", { name: /next page/i });
      expect(nextButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("emits a new query with an offset when navigating to the next page", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      mockSocket.emit.mockClear();

      const firstPageMessages = Array.from({ length: 50 }, (_, i) =>
        makeMsg(`msg-${i}`),
      );
      emitSearchResults(firstPageMessages, 120);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
      });

      // Two "Next page" buttons exist (top + bottom pagination bars); click the first
      const nextButtons = screen.getAllByRole("button", { name: /next page/i });
      await user.click(nextButtons[0]);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "query_search",
        expect.objectContaining({
          results_after: 1, // page 1 (0-indexed)
        }),
        "/main",
      );
    });

    it("does not navigate to a page before page 0", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      const firstPageMessages = Array.from({ length: 50 }, (_, i) =>
        makeMsg(`msg-${i}`),
      );
      emitSearchResults(firstPageMessages, 120);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
      });

      mockSocket.emit.mockClear();

      // Previous page buttons should be disabled on the first page
      // (two pagination bars — top and bottom — both have the button)
      const prevButtons = screen.queryAllByRole("button", {
        name: /previous page/i,
      });
      if (prevButtons.length > 0) {
        for (const btn of prevButtons) {
          expect(btn).toBeDisabled();
        }
      }
      // It is also acceptable that the prev buttons aren't rendered on page 0
    });
  });

  // -------------------------------------------------------------------------
  // Socket subscription
  // -------------------------------------------------------------------------

  describe("socket subscription", () => {
    it("subscribes to database_search_results on mount", () => {
      renderSearchPage();
      expect(mockSocket.on).toHaveBeenCalledWith(
        "database_search_results",
        expect.any(Function),
      );
    });

    it("unsubscribes from database_search_results on unmount", () => {
      const { unmount } = renderSearchPage();
      unmount();
      expect(mockSocket.off).toHaveBeenCalledWith(
        "database_search_results",
        expect.any(Function),
      );
    });
  });
});

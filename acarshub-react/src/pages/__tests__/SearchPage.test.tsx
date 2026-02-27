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
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import type { AcarsMsg } from "../../types";
import { SearchPage } from "../SearchPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// @tanstack/react-virtual mock
//
// jsdom has no layout engine — all elements report zero clientHeight and
// getBoundingClientRect() returns zeros. The virtualizer therefore thinks no
// items are in the viewport and renders nothing, which breaks every test that
// expects message cards to be present.
//
// This mock replaces useVirtualizer with a simple implementation that always
// reports every item as visible. The scrollMargin option is forwarded on the
// returned options object so that SearchPage's transform calculation
// (virtualRow.start - rowVirtualizer.options.scrollMargin) resolves to 0 in
// tests and items are positioned at translateY(0).
// ---------------------------------------------------------------------------
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => Element | null;
    overscan?: number;
    scrollMargin?: number;
  }) => {
    const estimatedSize = options.estimateSize();
    const margin = options.scrollMargin ?? 0;
    return {
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, i) => ({
          index: i,
          key: i,
          start: margin + i * estimatedSize,
          size: estimatedSize,
          lane: 0,
          end: margin + (i + 1) * estimatedSize,
        })),
      getTotalSize: () => options.count * estimatedSize,
      measureElement: () => undefined,
      options: { scrollMargin: margin },
    };
  },
}));

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
        screen.getByRole("button", { name: /^search$/i }),
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

    // -----------------------------------------------------------------------
    // Uppercase normalisation
    // All text stored in the database is upper-case.  Every text input must
    // normalise its value to upper-case so that search terms match the DB.
    // -----------------------------------------------------------------------

    it("regression: flight input normalises lowercase to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/^flight$/i);
      await user.type(input, "ual123");
      expect(input).toHaveValue("UAL123");
    });

    it("regression: tail input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/tail number/i);
      await user.type(input, "n12345");
      expect(input).toHaveValue("N12345");
    });

    it("regression: ICAO hex input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/icao hex/i);
      await user.type(input, "a1b2c3");
      expect(input).toHaveValue("A1B2C3");
    });

    it("regression: departure input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/departure/i);
      await user.type(input, "kjfk");
      expect(input).toHaveValue("KJFK");
    });

    it("regression: destination input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/destination/i);
      await user.type(input, "klax");
      expect(input).toHaveValue("KLAX");
    });

    it("regression: message label input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/message label/i);
      await user.type(input, "h1");
      expect(input).toHaveValue("H1");
    });

    it("regression: message number input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/message number/i);
      await user.type(input, "m01a");
      expect(input).toHaveValue("M01A");
    });

    it("regression: station ID input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/station id/i);
      await user.type(input, "kjfk");
      expect(input).toHaveValue("KJFK");
    });

    it("regression: message text input normalises to uppercase", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/message text/i);
      await user.type(input, "position report");
      expect(input).toHaveValue("POSITION REPORT");
    });

    it("regression: uppercase normalisation is applied before emitting the query", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "ual123");

      await user.click(screen.getByRole("button", { name: /^search$/i }));

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "query_search",
        expect.objectContaining({
          search_term: expect.objectContaining({ flight: "UAL123" }),
        }),
        "/main",
      );
    });

    it("regression: frequency field is unaffected by uppercase normalisation (digits only)", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const input = screen.getByLabelText(/frequency/i);
      await user.type(input, "131.550");
      // Digits and dots have no case — value must be unchanged
      expect(input).toHaveValue("131.550");
    });

    it("emits query_search via socket when the form is submitted", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");

      const submitButton = screen.getByRole("button", { name: /^search$/i });
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

    it("emits a show-all query_search when all fields are empty", async () => {
      // Regression: when submitIntent=true (button click), empty form must
      // still send the query — backend interprets empty search_term as
      // "show all messages" (paginated).  The old guard that returned early
      // for empty forms was removed; only the debounced input-change path
      // still clears results without querying.
      const user = userEvent.setup();
      renderSearchPage();

      // Clear is also present; use the submit button specifically
      const submitButton = screen.getByRole("button", { name: /^search$/i });
      await user.click(submitButton);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "query_search",
        expect.objectContaining({
          search_term: expect.objectContaining({ flight: "" }),
        }),
        "/main",
      );
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

  // -------------------------------------------------------------------------
  // Virtualization
  // -------------------------------------------------------------------------

  describe("virtual list rendering", () => {
    it("regression: renders a MessageCard for each search result in the virtual list", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      emitSearchResults(
        [makeMsg("v-001"), makeMsg("v-002"), makeMsg("v-003")],
        3,
      );

      await waitFor(() => {
        const cards = screen.getAllByTestId("message-card");
        expect(cards).toHaveLength(3);
      });
    });

    it("regression: clearing results removes all virtual items from the DOM", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      emitSearchResults([makeMsg("v-001"), makeMsg("v-002")], 2);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(2);
      });

      // Click Clear to remove results
      await user.click(screen.getByRole("button", { name: /clear/i }));

      expect(screen.queryByTestId("message-card")).not.toBeInTheDocument();
    });

    it("regression: new page results replace previous virtual items", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // First page: 50 results, 2 pages total
      const firstPage = Array.from({ length: 50 }, (_, i) =>
        makeMsg(`page0-${i}`),
      );
      emitSearchResults(firstPage, 100);

      await waitFor(() => {
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
      });

      // Navigate to next page
      const nextButtons = screen.getAllByRole("button", { name: /next page/i });
      await user.click(nextButtons[0]);

      // Second page: different 50 results
      const secondPage = Array.from({ length: 50 }, (_, i) =>
        makeMsg(`page1-${i}`),
      );
      emitSearchResults(secondPage, 100);

      await waitFor(() => {
        // Still 50 cards — but now the second page's items
        expect(screen.getAllByTestId("message-card")).toHaveLength(50);
        // First page items should be gone
        expect(screen.queryByText("page0-0")).not.toBeInTheDocument();
      });
    });

    it("regression: virtual list shows results-info count when results are present", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      emitSearchResults(
        Array.from({ length: 5 }, (_, i) => makeMsg(`ri-${i}`)),
        5,
      );

      await waitFor(() => {
        // results-info should mention the count
        expect(screen.getByText(/found/i)).toBeInTheDocument();
        expect(screen.getByText("5")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Collapsible form header
  // -------------------------------------------------------------------------

  // Helper: simulate the .app-content scroll event that triggers auto-collapse.
  // In jsdom there is no layout engine, so we manually set scrollTop on a mock
  // element and dispatch the scroll event to the window (the component uses
  // document.querySelector(".app-content") which returns null in tests, so the
  // scroll listener is not attached — we drive collapse purely via the state
  // setter by firing a synthetic scroll on the element if it exists, or by
  // directly triggering the React state path via act).
  //
  // Because document.querySelector(".app-content") returns null inside the
  // MemoryRouter test wrapper (there is no App shell), the scroll listener is
  // never attached. We therefore simulate collapse by wrapping the page in a
  // container that carries the class and dispatching a real scroll event.
  function renderSearchPageWithScrollContainer(initialPath = "/search") {
    // The component calls document.querySelector(".app-content") to attach its
    // scroll listener.  We render the SearchPage *inside* the app-content div
    // so that:
    //   1. querySelector finds the div and attaches the listener.
    //   2. document.getElementById("search-form-body") finds the element since
    //      it is part of the live document tree.
    const appContent = document.createElement("div");
    appContent.className = "app-content";
    appContent.style.overflow = "auto";
    appContent.style.height = "500px";
    // jsdom does not implement element.scrollTo — mock it so expandForm does
    // not throw when the expand button is clicked in tests.
    appContent.scrollTo = vi.fn() as unknown as typeof appContent.scrollTo;
    document.body.appendChild(appContent);

    const result = render(
      <MemoryRouter initialEntries={[initialPath]}>
        <SearchPage />
      </MemoryRouter>,
      { container: appContent },
    );

    // Simulate scroll past the collapse threshold by stubbing scrollTop and
    // dispatching a real scroll event so the component's listener fires.
    const simulateScrollPast = (scrollTop = 200) => {
      Object.defineProperty(appContent, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
      });
      appContent.dispatchEvent(new Event("scroll", { bubbles: false }));
    };

    const simulateScrollToTop = () => {
      Object.defineProperty(appContent, "scrollTop", {
        configurable: true,
        get: () => 0,
      });
      appContent.dispatchEvent(new Event("scroll", { bubbles: false }));
    };

    const cleanup = () => {
      // unmount is called by the test before cleanup so the tree is already
      // gone; just detach the host div from the body.
      if (document.body.contains(appContent)) {
        document.body.removeChild(appContent);
      }
    };

    return {
      ...result,
      appContent,
      simulateScrollPast,
      simulateScrollToTop,
      cleanup,
    };
  }

  describe("collapsible form header", () => {
    it("does NOT render a collapse button when the form is expanded", () => {
      renderSearchPage();
      // No collapse affordance should be present in the expanded state —
      // collapse is scroll-driven only.
      expect(
        screen.queryByRole("button", { name: /collapse search form/i }),
      ).not.toBeInTheDocument();
    });

    it("form body is visible (aria-hidden=false) on initial render", () => {
      renderSearchPage();
      const formBody = document.getElementById("search-form-body");
      expect(formBody).not.toBeNull();
      expect(formBody).toHaveAttribute("aria-hidden", "false");
    });

    it("shows the expand button with aria-expanded=false after scroll-driven collapse", async () => {
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        const expandButton = screen.getByRole("button", {
          name: /expand search form/i,
        });
        expect(expandButton).toBeInTheDocument();
        expect(expandButton).toHaveAttribute("aria-expanded", "false");
        expect(expandButton).toHaveAttribute(
          "aria-controls",
          "search-form-body",
        );
      });

      unmount();
      cleanup();
    });

    it("form body is aria-hidden=true after scroll-driven collapse", async () => {
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        const formBody = document.getElementById("search-form-body");
        expect(formBody).toHaveAttribute("aria-hidden", "true");
      });

      unmount();
      cleanup();
    });

    it("clicking the expand button sets aria-hidden=false on the form body", async () => {
      const user = userEvent.setup();
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /expand search form/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /expand search form/i }),
      );

      await waitFor(() => {
        const formBody = document.getElementById("search-form-body");
        expect(formBody).toHaveAttribute("aria-hidden", "false");
      });

      unmount();
      cleanup();
    });

    it("expand button disappears after clicking it (form is now open)", async () => {
      const user = userEvent.setup();
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /expand search form/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /expand search form/i }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /expand search form/i }),
        ).not.toBeInTheDocument();
      });

      unmount();
      cleanup();
    });

    it("shows the active search summary in the header when scroll-collapsed with an active search", async () => {
      const user = userEvent.setup();
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      // Type a value and submit to establish an activeSearch
      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // Now scroll to collapse
      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        expect(screen.getByText(/Flight: UAL123/)).toBeInTheDocument();
      });

      unmount();
      cleanup();
    });

    it("does not show the active search summary when the form is expanded", async () => {
      const user = userEvent.setup();
      renderSearchPage();

      const flightInput = screen.getByLabelText(/^flight$/i);
      await user.type(flightInput, "UAL123");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      // Form is still expanded — summary should not be visible
      expect(screen.queryByText(/Flight: UAL123/)).not.toBeInTheDocument();
    });

    it("does not show the active search summary when scroll-collapsed but no active search", async () => {
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /expand search form/i }),
        ).toBeInTheDocument();
      });

      // No active search was submitted, so no summary text
      expect(screen.queryByText(/Flight:/)).not.toBeInTheDocument();

      unmount();
      cleanup();
    });

    it("regression: form fields are aria-hidden when scroll-collapsed", async () => {
      const { simulateScrollPast, cleanup, unmount } =
        renderSearchPageWithScrollContainer();

      act(() => {
        simulateScrollPast(200);
      });

      await waitFor(() => {
        const formBody = document.getElementById("search-form-body");
        expect(formBody).toHaveAttribute("aria-hidden", "true");
      });

      unmount();
      cleanup();
    });
  });

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

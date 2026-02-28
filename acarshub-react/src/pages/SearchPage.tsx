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

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconXmark,
} from "../components/icons";
import { MessageCard } from "../components/MessageCard";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg, CurrentSearch, SearchHtmlMsg } from "../types";

import { uiLogger } from "../utils/logger";
import { formatBytes } from "../utils/stringUtils";

const RESULTS_PER_PAGE = 50;
const SEARCH_STATE_KEY = "acarshub_search_state";
const NAVIGATION_FLAG_KEY = "acarshub_navigation_active";

/**
 * Human-readable labels for each CurrentSearch field.
 * Used to build the active-search summary shown in the collapsed form header.
 */
const FIELD_LABELS: Record<keyof CurrentSearch, string> = {
  flight: "Flight",
  depa: "From",
  dsta: "To",
  freq: "Freq",
  label: "Label",
  msgno: "Msg#",
  tail: "Tail",
  icao: "ICAO",
  msg_text: "Text",
  station_id: "Station",
  msg_type: "Type",
};

// Interface for persisted search state
interface PersistedSearchState {
  searchParams: CurrentSearch;
  currentPage: number;
  results: AcarsMsg[];
  totalResults: number;
  queryTime: number | null;
  activeSearch: CurrentSearch | null;
}

/**
 * Estimated item height for unmeasured search result cards.
 * Same rationale as the live-messages virtualizer: biased high so initial
 * estimates overshoot downward rather than causing upward jumps.
 */
const ESTIMATED_ITEM_HEIGHT = 300;

/**
 * SearchPage Component
 * Provides database search functionality for historical ACARS messages
 *
 * Features:
 * - Multi-field search (flight, tail, ICAO, airports, frequency, etc.)
 * - Pagination with page navigation (results virtualised with @tanstack/react-virtual)
 * - Query time and result count display
 * - Database size statistics
 * - Persistent search state
 * - Mobile-first responsive design
 */
export const SearchPage = () => {
  const setActivePageName = useAppStore((state) => state.setCurrentPage);
  const databaseSize = useAppStore((state) => state.databaseSize);

  // Load persisted state only if this is in-app navigation (not a fresh page load)
  const loadPersistedState = (): Partial<PersistedSearchState> => {
    // Check if this is in-app navigation vs fresh page load
    const isInAppNavigation = sessionStorage.getItem(NAVIGATION_FLAG_KEY);

    if (!isInAppNavigation) {
      // Fresh page load - clear any old search state
      sessionStorage.removeItem(SEARCH_STATE_KEY);
      uiLogger.debug("Fresh page load detected - cleared search state");
      return {};
    }

    // In-app navigation - restore previous search state
    try {
      const stored = sessionStorage.getItem(SEARCH_STATE_KEY);
      if (stored) {
        uiLogger.debug("Restored search state from in-app navigation");
        return JSON.parse(stored);
      }
    } catch (error) {
      uiLogger.warn("Failed to load persisted search state", { error });
    }
    return {};
  };

  const persistedState = loadPersistedState();

  // Set navigation flag for subsequent page navigations
  useEffect(() => {
    sessionStorage.setItem(NAVIGATION_FLAG_KEY, "true");

    // Clear flag on page unload (browser close/refresh)
    const handleBeforeUnload = () => {
      sessionStorage.removeItem(NAVIGATION_FLAG_KEY);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Search form state
  const [searchParams, setSearchParams] = useState<CurrentSearch>(
    persistedState.searchParams || {
      flight: "",
      depa: "",
      dsta: "",
      freq: "",
      label: "",
      msgno: "",
      tail: "",
      icao: "",
      msg_text: "",
      station_id: "",
      msg_type: "",
    },
  );

  // Search results state
  const [results, setResults] = useState<AcarsMsg[]>(
    persistedState.results || [],
  );
  const [totalResults, setTotalResults] = useState(
    persistedState.totalResults || 0,
  );
  const [queryTime, setQueryTime] = useState<number | null>(
    persistedState.queryTime || null,
  );
  const [currentPage, setCurrentPage] = useState(
    persistedState.currentPage || 0,
  );
  const [isSearching, setIsSearching] = useState(false);

  // Track active search parameters (to compare with typed values)
  const [activeSearch, setActiveSearch] = useState<CurrentSearch | null>(
    persistedState.activeSearch || null,
  );

  // Controls whether the search form is collapsed to just its header row.
  // Collapses when results arrive (so they get the full viewport) but is
  // deferred if the user still has focus inside the form — we don't want
  // results racing with active typing to yank the form away mid-keystroke.
  // Expands when the user clicks the chevron toggle.
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);

  // Ref to the <form> element — used to check whether focus is currently
  // inside the form before deciding to collapse.
  const formRef = useRef<HTMLFormElement>(null);

  // Set to true when results arrive while the user has focus inside the form.
  // The collapse is then deferred until focus leaves the form (onBlur).
  const pendingCollapseRef = useRef(false);

  // Debounce timer ref
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Results section ref for scrolling (points to the results-info header)
  const resultsRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Virtual list infrastructure
  //
  // The search page keeps the outer .app-content scroll so that the large
  // search form remains accessible on all screen sizes. The virtualizer uses
  // .app-content as its scroll element and a scrollMargin to account for all
  // the content (form, stats, pagination) that sits above the results list.
  // ---------------------------------------------------------------------------

  /**
   * Reference to the outer .app-content scroll container.
   * Obtained once via querySelector after mount — the element is stable for
   * the lifetime of the application.
   */
  const appContentRef = useRef<HTMLElement | null>(null);

  /**
   * Reference to the positioned container that hosts the absolutely-positioned
   * virtual items. Its height equals rowVirtualizer.getTotalSize().
   */
  const virtualResultsRef = useRef<HTMLDivElement>(null);

  /**
   * Pixel offset of the virtual results container from the top of
   * .app-content's scrollable area.  The virtualizer uses this to determine
   * which items are currently visible.
   *
   * Measured in a useLayoutEffect so it is always up-to-date before paint.
   */
  const [scrollMargin, setScrollMargin] = useState(0);

  // Acquire the outer scroll container once on mount.
  // Used by both the virtualizer (scrollMargin measurement) and expandForm().
  useEffect(() => {
    const scrollEl = document.querySelector<HTMLElement>(".app-content");
    appContentRef.current = scrollEl;
  }, []);

  // Register Socket.IO listener for search results
  // Wait for socket to be initialized before subscribing
  useEffect(() => {
    const handleSearchResults = (data: SearchHtmlMsg) => {
      // Backend already enriches messages with decodedText
      setResults(data.msghtml);
      setTotalResults(data.num_results);
      setQueryTime(data.query_time);
      setIsSearching(false);
      // Collapse the form when results arrive so they get the full viewport.
      // We collapse here rather than in handleSubmit so the "Searching…"
      // button remains visible during the in-flight state.
      //
      // However, if the user currently has focus inside the form (i.e. they
      // are still typing or tabbing between fields) we defer the collapse
      // until they leave the form.  This prevents the debounce firing a query
      // mid-keystroke, the backend responding quickly, and the form collapsing
      // while the user is still interacting with it.
      if (formRef.current?.contains(document.activeElement)) {
        pendingCollapseRef.current = true;
      } else {
        setIsFormCollapsed(true);
      }
    };

    // Check if socket service is initialized
    if (!socketService.isInitialized()) {
      uiLogger.debug("Socket not initialized yet, waiting for connection");
      return () => {};
    }

    try {
      const socket = socketService.getSocket();
      socket.on("database_search_results", handleSearchResults);
      uiLogger.debug("Subscribed to database_search_results event");

      return () => {
        socket.off("database_search_results", handleSearchResults);
        uiLogger.debug("Unsubscribed from database_search_results event");
      };
    } catch (error) {
      uiLogger.warn("Failed to subscribe to search results", { error });
      return () => {};
    }
  }, []);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave: PersistedSearchState = {
      searchParams,
      currentPage,
      results,
      totalResults,
      queryTime,
      activeSearch,
    };

    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(stateToSave));
      uiLogger.debug("Persisted search state to sessionStorage");
    } catch (error) {
      uiLogger.warn("Failed to persist search state", { error });
    }
  }, [
    searchParams,
    currentPage,
    results,
    totalResults,
    queryTime,
    activeSearch,
  ]);

  // Clear debounce timer on unmount to prevent stale callbacks firing after tests / navigation
  useEffect(() => {
    return () => {
      if (searchDebounceTimer.current) {
        clearTimeout(searchDebounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setActivePageName("Search");
    socketService.notifyPageChange("Search");
    uiLogger.info("Search page loaded", {
      databaseSize: databaseSize?.count,
    });
  }, [setActivePageName, databaseSize]);

  // Check if all search fields are empty
  const isSearchEmpty = (params: CurrentSearch): boolean => {
    return Object.values(params).every((value) => value.trim() === "");
  };

  // Expand the search form and scroll back to the top of the page so the
  // form fields are immediately reachable.
  //
  // WHY instant scroll: behavior:"smooth" creates a race on Mobile Safari —
  // the animation runs concurrently with Playwright's click action and can
  // move the target button outside the viewport mid-click.
  const expandForm = () => {
    // Clear any pending deferred collapse so it doesn't fire after the user
    // has explicitly reopened the form.
    pendingCollapseRef.current = false;
    setIsFormCollapsed(false);
    const scrollEl =
      appContentRef.current ??
      document.querySelector<HTMLElement>(".app-content");
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  /**
   * Build a compact summary of the currently active search terms for display
   * in the collapsed form header. Returns an empty string if no terms are set.
   */
  const activeSearchSummary = (search: CurrentSearch | null): string => {
    if (!search) return "";
    return Object.entries(search)
      .filter(([, v]) => v.trim() !== "")
      .map(([k, v]) => `${FIELD_LABELS[k as keyof CurrentSearch]}: ${v}`)
      .join(" · ");
  };

  // Execute search query.
  //
  // When `submitIntent` is true (form Submit button clicked) an empty form is
  // treated as "show all" and the query is still sent — the backend's
  // searchWithLike with no conditions returns all messages (paginated).
  //
  // When `submitIntent` is false (debounced input change) an empty params
  // object clears the results without querying, preventing a full-table scan
  // every time the user deletes the last character from a field.
  const executeSearch = (
    params: CurrentSearch,
    page: number = 0,
    submitIntent = false,
  ) => {
    if (isSearchEmpty(params)) {
      if (!submitIntent) {
        // Debounce path: user cleared the last field — reset the results panel
        setResults([]);
        setTotalResults(0);
        setQueryTime(null);
        setActiveSearch(null);
        setCurrentPage(0);
        return;
      }
      // Form submit path: empty fields = "show all" — fall through and query
      uiLogger.debug("Empty form submitted — sending show-all query");
    }

    // Only show the "Searching…" button state (which disables the button) for
    // explicit user-initiated submits and pagination requests.  Debounce-
    // triggered background searches (submitIntent=false) run silently so the
    // button remains clickable.  This prevents a race condition in Playwright
    // webkit/Safari tests where the 500 ms debounce fires during the browser's
    // own stability check on the button, permanently disabling it because the
    // mock socket never delivers a response.
    if (submitIntent) {
      setIsSearching(true);
    }
    setActiveSearch(params);
    setCurrentPage(page);

    // Emit search query via Socket.IO
    // Backend expects: { search_term: {...}, results_after?: number }
    const socket = socketService.getSocket();
    const queryPayload: {
      search_term: CurrentSearch;
      results_after?: number;
    } = {
      search_term: params,
    };

    if (page > 0) {
      queryPayload.results_after = page;
    }

    // Flask-SocketIO requires namespace as third argument when emitting from client
    // Type assertion needed because Socket.IO client types don't match Flask-SocketIO pattern
    // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO client typing limitation
    (socket as any).emit("query_search", queryPayload, "/main");

    uiLogger.debug("Executing search query", {
      params,
      page,
    });
  };

  // Handle input change with debounced search.
  // All search values are normalised to upper-case because every string stored
  // in the database is upper-case; sending mixed-case terms would miss matches.
  const handleInputChange = (field: keyof CurrentSearch, value: string) => {
    const normalized = field === "freq" ? value : value.toUpperCase();
    const newParams = { ...searchParams, [field]: normalized };
    setSearchParams(newParams);

    // Clear existing timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    // Debounce search by 500ms — submitIntent=false so clearing all fields
    // resets results without firing a full-table scan.
    searchDebounceTimer.current = setTimeout(() => {
      executeSearch(newParams, 0, false);
    }, 500);
  };

  // Handle form submit (immediate search without debounce)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clear debounce timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    // submitIntent=true: empty form → show-all query
    executeSearch(searchParams, 0, true);
  };

  // Clear all search fields
  const handleClear = () => {
    const emptyParams: CurrentSearch = {
      flight: "",
      depa: "",
      dsta: "",
      freq: "",
      label: "",
      msgno: "",
      tail: "",
      icao: "",
      msg_text: "",
      station_id: "",
      msg_type: "",
    };

    setSearchParams(emptyParams);
    setResults([]);
    setTotalResults(0);
    setQueryTime(null);
    setActiveSearch(null);
    setCurrentPage(0);
    // Discard any deferred collapse — the user is resetting, not browsing results.
    pendingCollapseRef.current = false;

    uiLogger.debug("Search cleared");
  };

  // Pagination calculations
  const totalPages = useMemo(() => {
    return Math.ceil(totalResults / RESULTS_PER_PAGE);
  }, [totalResults]);

  const handlePageChange = (newPage: number) => {
    if (!activeSearch || newPage < 0 || newPage >= totalPages) {
      return;
    }

    executeSearch(activeSearch, newPage);
    window.scrollTo(0, 0);
  };

  // Generate page numbers for pagination
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    const maxVisible = 7; // Maximum number of page buttons to show

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, ellipsis, current range, ellipsis, last page
      pages.push(0);

      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages - 2, currentPage + 2);

      if (currentPage <= 3) {
        startPage = 1;
        endPage = 5;
      } else if (currentPage >= totalPages - 4) {
        startPage = totalPages - 6;
        endPage = totalPages - 2;
      }

      if (startPage > 1) {
        pages.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages - 2) {
        pages.push("...");
      }

      pages.push(totalPages - 1);
    }

    return pages;
  }, [currentPage, totalPages]);

  // Sort results by timestamp (newest first) - memoized to avoid re-sorting on every render
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => b.timestamp - a.timestamp);
  }, [results]);

  // ---------------------------------------------------------------------------
  // Virtualizer
  //
  // Uses the outer .app-content element as the scroll container so the search
  // form above the results scrolls naturally with the page.
  // ---------------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: sortedResults.length,
    getScrollElement: () => appContentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 2,
    // Stable key per result message so the height cache survives page changes.
    getItemKey: (index) => sortedResults[index]?.uid ?? `result-${index}`,
    // scrollMargin tells the virtualizer how far the virtual container is from
    // the top of the scroll element.  Updated after every result change so the
    // visible-range calculation remains correct even when the form expands or
    // the stats/pagination bar appears.
    scrollMargin,
  });

  // Measure scrollMargin: distance from the top of .app-content's scroll
  // origin to the top of the virtual results container.
  //
  // WHY useLayoutEffect: runs after DOM mutations and before paint, so the
  // measurement uses the freshly-laid-out positions of all elements and the
  // virtualizer has the correct offset on the very first paint cycle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sortedResults is an intentional trigger dependency — the effect reads refs (stable) but must re-fire whenever results change so the scrollMargin is recalculated after the DOM updates with new results-info/pagination elements above the virtual container.
  useLayoutEffect(() => {
    const measure = () => {
      if (!virtualResultsRef.current) return;
      // Lazily acquire the scroll container in case the useEffect above has
      // not fired yet (e.g. in strict-mode double-invoke).
      if (!appContentRef.current) {
        appContentRef.current =
          document.querySelector<HTMLElement>(".app-content");
      }
      if (!appContentRef.current) return;

      const containerTop =
        virtualResultsRef.current.getBoundingClientRect().top;
      const scrollElTop = appContentRef.current.getBoundingClientRect().top;
      const margin =
        containerTop - scrollElTop + appContentRef.current.scrollTop;
      setScrollMargin(Math.max(0, margin));
    };

    measure();

    // Re-measure if the page content above the results changes size (e.g.
    // results-info bar appears, pagination bar appears/disappears on resize).
    const ro = new ResizeObserver(measure);
    const parent = virtualResultsRef.current?.parentElement;
    if (parent) ro.observe(parent);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sortedResults]);

  return (
    <div className="page search-page">
      <div className="page__header">
        <h1 className="page__title">Search Database</h1>
        {databaseSize && (
          <div className="page__stats">
            <span className="stat">
              <strong>{databaseSize.count.toLocaleString()}</strong> messages in
              database
            </span>
            <span className="stat">
              <strong>{formatBytes(databaseSize.size)}</strong> database size
            </span>
          </div>
        )}
      </div>

      <div className="page__content">
        {/* Search Form */}
        <form
          ref={formRef}
          className={`search-page__form${isFormCollapsed ? " search-page__form--collapsed" : ""}`}
          onSubmit={handleSubmit}
          onBlur={(e) => {
            // relatedTarget is where focus is moving to.  If it is still
            // inside the form the user is just tabbing between fields — don't
            // collapse yet.  If it is null or outside the form, focus has
            // truly left and we can apply any pending collapse.
            if (
              pendingCollapseRef.current &&
              !formRef.current?.contains(e.relatedTarget)
            ) {
              pendingCollapseRef.current = false;
              setIsFormCollapsed(true);
            }
          }}
        >
          {/* Form header — only rendered when collapsed; provides the sticky
              expand button so the user can reopen the form after scrolling. */}
          {isFormCollapsed && (
            <div className="search-page__form-header">
              <div className="search-page__form-header-title">
                <IconSearch />
                <span>Search</span>
                {activeSearch && !isSearchEmpty(activeSearch) && (
                  <span className="search-page__form-active-summary">
                    {activeSearchSummary(activeSearch)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="search-page__form-toggle"
                onClick={expandForm}
                aria-label="Expand search form"
                aria-expanded={false}
                aria-controls="search-form-body"
              >
                <IconChevronDown />
              </button>
            </div>
          )}

          {/* Form body — collapses when isFormCollapsed is true.
              __form-body is the grid container (animates grid-template-rows).
              __form-body-inner is the single grid item (overflow:hidden). */}
          <div
            id="search-form-body"
            className="search-page__form-body"
            aria-hidden={isFormCollapsed}
          >
            <div className="search-page__form-body-inner">
              {/* Form Actions — rendered BEFORE the grid in the DOM so that on
                  mobile (single-column, tall form) the Search/Clear buttons
                  appear at the TOP of the expanded form without requiring any
                  scrolling.  On tablet/desktop the SCSS `order` property moves
                  them back below the grid visually while preserving DOM/tab
                  order for keyboard accessibility. */}
              <div className="search-page__form-actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={isSearching}
                >
                  <IconSearch />
                  {isSearching ? "Searching..." : "Search"}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleClear}
                  disabled={isSearching}
                >
                  <IconXmark />
                  Clear
                </button>
              </div>

              <div className="search-page__form-grid">
                {/* Flight */}
                <div className="search-page__form-field">
                  <label htmlFor="search-flight">Flight</label>
                  <input
                    id="search-flight"
                    type="text"
                    value={searchParams.flight}
                    onChange={(e) =>
                      handleInputChange("flight", e.target.value)
                    }
                    placeholder="e.g., UAL123"
                  />
                </div>

                {/* Tail */}
                <div className="search-page__form-field">
                  <label htmlFor="search-tail">Tail Number</label>
                  <input
                    id="search-tail"
                    type="text"
                    value={searchParams.tail}
                    onChange={(e) => handleInputChange("tail", e.target.value)}
                    placeholder="e.g., N12345"
                  />
                </div>

                {/* ICAO */}
                <div className="search-page__form-field">
                  <label htmlFor="search-icao">ICAO Hex</label>
                  <input
                    id="search-icao"
                    type="text"
                    value={searchParams.icao}
                    onChange={(e) => handleInputChange("icao", e.target.value)}
                    placeholder="e.g., A12345"
                  />
                </div>

                {/* Departure */}
                <div className="search-page__form-field">
                  <label htmlFor="search-depa">Departure</label>
                  <input
                    id="search-depa"
                    type="text"
                    value={searchParams.depa}
                    onChange={(e) => handleInputChange("depa", e.target.value)}
                    placeholder="e.g., KJFK"
                  />
                </div>

                {/* Destination */}
                <div className="search-page__form-field">
                  <label htmlFor="search-dsta">Destination</label>
                  <input
                    id="search-dsta"
                    type="text"
                    value={searchParams.dsta}
                    onChange={(e) => handleInputChange("dsta", e.target.value)}
                    placeholder="e.g., KLAX"
                  />
                </div>

                {/* Frequency */}
                <div className="search-page__form-field">
                  <label htmlFor="search-freq">Frequency</label>
                  <input
                    id="search-freq"
                    type="text"
                    value={searchParams.freq}
                    onChange={(e) => handleInputChange("freq", e.target.value)}
                    placeholder="e.g., 131.550"
                  />
                </div>

                {/* Label */}
                <div className="search-page__form-field">
                  <label htmlFor="search-label">Message Label</label>
                  <input
                    id="search-label"
                    type="text"
                    value={searchParams.label}
                    onChange={(e) => handleInputChange("label", e.target.value)}
                    placeholder="e.g., H1"
                  />
                </div>

                {/* Message Number */}
                <div className="search-page__form-field">
                  <label htmlFor="search-msgno">Message Number</label>
                  <input
                    id="search-msgno"
                    type="text"
                    value={searchParams.msgno}
                    onChange={(e) => handleInputChange("msgno", e.target.value)}
                    placeholder="e.g., M01A"
                  />
                </div>

                {/* Station ID */}
                <div className="search-page__form-field">
                  <label htmlFor="search-station">Station ID</label>
                  <input
                    id="search-station"
                    type="text"
                    value={searchParams.station_id}
                    onChange={(e) =>
                      handleInputChange("station_id", e.target.value)
                    }
                    placeholder="e.g., KJFK"
                  />
                </div>

                {/* Decoder Type */}
                <div className="search-page__form-field">
                  <label htmlFor="search-msg-type">Decoder Type</label>
                  <select
                    id="search-msg-type"
                    value={searchParams.msg_type}
                    onChange={(e) =>
                      handleInputChange("msg_type", e.target.value)
                    }
                  >
                    <option value="">All</option>
                    <option value="ACARS">ACARS</option>
                    <option value="VDLM2">VDLM2</option>
                    <option value="HFDL">HFDL</option>
                    <option value="IMSL">IMSL</option>
                    <option value="IRDM">IRDM</option>
                  </select>
                </div>

                {/* Message Text - spans cols 2-3 on desktop, full width on mobile/tablet */}
                <div className="search-page__form-field search-page__form-field--msg-text">
                  <label htmlFor="search-text">Message Text</label>
                  <input
                    id="search-text"
                    type="text"
                    value={searchParams.msg_text}
                    onChange={(e) =>
                      handleInputChange("msg_text", e.target.value)
                    }
                    placeholder="Search message content..."
                  />
                </div>
              </div>
            </div>
            {/* end search-page__form-body-inner */}
          </div>
          {/* end search-page__form-body */}
        </form>

        {/* Results Info - Scroll target for mobile */}
        {totalResults > 0 && (
          <div className="search-page__results-info" ref={resultsRef}>
            <p>
              Found <strong>{totalResults.toLocaleString()}</strong> result
              {totalResults !== 1 ? "s" : ""}
              {queryTime !== null && (
                <span className="search-page__query-time">
                  {" "}
                  in {queryTime.toFixed(3)}s
                </span>
              )}
            </p>
          </div>
        )}

        {/* Pagination - Top */}
        {totalPages > 1 && (
          <div className="search-page__pagination">
            <button
              type="button"
              className="search-page__pagination-button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              <IconChevronLeft />
            </button>

            {pageNumbers.map((page, idx) => {
              if (page === "...") {
                // Use previous page number + 0.5 as unique key for ellipsis
                const prevPage = idx > 0 ? pageNumbers[idx - 1] : 0;
                return (
                  <span
                    key={`ellipsis-after-${prevPage}`}
                    className="search-page__pagination-ellipsis"
                  >
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={`page-${page}`}
                  type="button"
                  className={`search-page__pagination-button ${
                    page === currentPage
                      ? "search-page__pagination-button--active"
                      : ""
                  }`}
                  onClick={() => handlePageChange(page as number)}
                >
                  {(page as number) + 1}
                </button>
              );
            })}

            <button
              type="button"
              className="search-page__pagination-button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              aria-label="Next page"
            >
              <IconChevronRight />
            </button>
          </div>
        )}

        {/* Results — loading state */}
        {isSearching && (
          <div className="search-page__loading">
            <p>Searching database...</p>
          </div>
        )}

        {/* Results — empty / no-match state */}
        {!isSearching && activeSearch && results.length === 0 && (
          <div className="search-page__empty">
            <p>No messages found matching your search criteria.</p>
          </div>
        )}

        {/* Results — virtual list
            The outer div is position:relative with height = total virtual
            size.  Items are absolutely positioned inside it, translated by
            virtualRow.start (which is relative to this container).
            scrollMargin accounts for the form + stats + pagination above. */}
        {!isSearching && sortedResults.length > 0 && (
          <div
            ref={virtualResultsRef}
            className="search-page__results"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const message = sortedResults[virtualRow.index];
              return (
                <div
                  key={message.uid}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <div className="search-page__result-card">
                    <MessageCard message={message} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination - Bottom (appears after virtual container in DOM flow) */}
        {totalPages > 1 && results.length > 0 && (
          <div className="search-page__pagination search-page__pagination--bottom">
            <button
              type="button"
              className="search-page__pagination-button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              <IconChevronLeft />
            </button>

            {pageNumbers.map((page, idx) => {
              if (page === "...") {
                const prevPage = idx > 0 ? pageNumbers[idx - 1] : 0;
                return (
                  <span
                    key={`ellipsis-bottom-after-${prevPage}`}
                    className="search-page__pagination-ellipsis"
                  >
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={`bottom-page-${page}`}
                  type="button"
                  className={`search-page__pagination-button ${
                    page === currentPage
                      ? "search-page__pagination-button--active"
                      : ""
                  }`}
                  onClick={() => handlePageChange(page as number)}
                >
                  {(page as number) + 1}
                </button>
              );
            })}

            <button
              type="button"
              className="search-page__pagination-button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              aria-label="Next page"
            >
              <IconChevronRight />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

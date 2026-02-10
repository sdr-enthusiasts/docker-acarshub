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

import { faChevronLeft } from "@fortawesome/free-solid-svg-icons/faChevronLeft";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faSearch } from "@fortawesome/free-solid-svg-icons/faSearch";
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCard } from "../components/MessageCard";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg, CurrentSearch, SearchHtmlMsg } from "../types";
import { decodeMessages } from "../utils/decoderUtils";
import { uiLogger } from "../utils/logger";
import { formatBytes } from "../utils/stringUtils";

const RESULTS_PER_PAGE = 50;
const SEARCH_STATE_KEY = "acarshub_search_state";
const NAVIGATION_FLAG_KEY = "acarshub_navigation_active";
const MOBILE_BREAKPOINT = 768; // Match SCSS breakpoint

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
 * SearchPage Component
 * Provides database search functionality for historical ACARS messages
 *
 * Features:
 * - Multi-field search (flight, tail, ICAO, airports, frequency, etc.)
 * - Pagination with page navigation
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

  // Debounce timer ref
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Results section ref for scrolling
  const resultsRef = useRef<HTMLDivElement>(null);

  // Register Socket.IO listener for search results
  // Wait for socket to be initialized before subscribing
  useEffect(() => {
    const handleSearchResults = (data: SearchHtmlMsg) => {
      // Decode messages that don't have decodedText from database
      const decodedResults = decodeMessages(data.msghtml);
      setResults(decodedResults);
      setTotalResults(data.num_results);
      setQueryTime(data.query_time);
      setIsSearching(false);
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

  // Execute search query
  const executeSearch = (params: CurrentSearch, page: number = 0) => {
    if (isSearchEmpty(params)) {
      setResults([]);
      setTotalResults(0);
      setQueryTime(null);
      setActiveSearch(null);
      setCurrentPage(0);
      return;
    }

    setIsSearching(true);
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

  // Handle input change with debounced search
  const handleInputChange = (field: keyof CurrentSearch, value: string) => {
    const newParams = { ...searchParams, [field]: value };
    setSearchParams(newParams);

    // Clear existing timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    // Debounce search by 500ms
    searchDebounceTimer.current = setTimeout(() => {
      executeSearch(newParams, 0);
    }, 500);
  };

  // Handle form submit (immediate search without debounce)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clear debounce timer
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    executeSearch(searchParams, 0);

    // On mobile, scroll to results section after a short delay to allow results to load
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setTimeout(() => {
        if (resultsRef.current) {
          resultsRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 300); // Small delay to allow search to start and UI to update
    }
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
    };

    setSearchParams(emptyParams);
    setResults([]);
    setTotalResults(0);
    setQueryTime(null);
    setActiveSearch(null);
    setCurrentPage(0);

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
        <form className="search-page__form" onSubmit={handleSubmit}>
          <div className="search-page__form-grid">
            {/* Flight */}
            <div className="search-page__form-field">
              <label htmlFor="search-flight">Flight</label>
              <input
                id="search-flight"
                type="text"
                value={searchParams.flight}
                onChange={(e) => handleInputChange("flight", e.target.value)}
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

            {/* Message Text - Full width */}
            <div className="search-page__form-field search-page__form-field--full">
              <label htmlFor="search-text">Message Text</label>
              <input
                id="search-text"
                type="text"
                value={searchParams.msg_text}
                onChange={(e) => handleInputChange("msg_text", e.target.value)}
                placeholder="Search message content..."
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="search-page__form-actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isSearching}
            >
              <FontAwesomeIcon icon={faSearch} />
              {isSearching ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={handleClear}
              disabled={isSearching}
            >
              <FontAwesomeIcon icon={faTimes} />
              Clear
            </button>
          </div>
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
              <FontAwesomeIcon icon={faChevronLeft} />
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
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        )}

        {/* Results */}
        {isSearching ? (
          <div className="search-page__loading">
            <p>Searching database...</p>
          </div>
        ) : results.length > 0 ? (
          <div className="search-page__results">
            {sortedResults.map((message) => (
              <div key={message.uid} className="search-page__result-card">
                <MessageCard message={message} />
              </div>
            ))}
          </div>
        ) : activeSearch ? (
          <div className="search-page__empty">
            <p>No messages found matching your search criteria.</p>
          </div>
        ) : null}

        {/* Pagination - Bottom */}
        {totalPages > 1 && results.length > 0 && (
          <div className="search-page__pagination search-page__pagination--bottom">
            <button
              type="button"
              className="search-page__pagination-button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>

            {pageNumbers.map((page, idx) => {
              if (page === "...") {
                // Use previous page number + 0.5 as unique key for ellipsis
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
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

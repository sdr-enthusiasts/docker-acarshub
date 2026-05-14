// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * StatusPage Tests
 *
 * Why this exists: StatusPage is the user-facing "is everything
 * working?" dashboard. It mixes pure helper functions
 * (status→variant mapping, decoder rate fallback) with conditional
 * card rendering and a 10-second polling loop. The helpers are
 * trivially mutable — a regression that swaps "Dead" → warning
 * (instead of error) would still render valid markup and the type
 * system wouldn't catch it. This file pins:
 *
 *  1. Loading branch: when `systemStatus === null`, the page
 *     renders the loading text and bails out early. Without the
 *     guard the destructure `const { status } = systemStatus`
 *     would throw on every initial render.
 *
 *  2. Mount side effects:
 *     - `setCurrentPage("Status")` (drives the keyboard shortcut
 *       layer).
 *     - `socketService.notifyPageChange("Status")` (telemetry).
 *     - `socketService.requestStatus()` is called immediately
 *       (without waiting for the first 10s tick) so the user
 *       sees data on first paint.
 *
 *  3. Polling cadence: `requestStatus` fires every 10 000 ms via
 *     setInterval, and the interval is cleared on unmount. A
 *     regression to (say) 1000 ms would flood the backend; a
 *     missing cleanup would leak intervals across SPA navigations.
 *
 *  4. `getStatusVariant` (the pure status→CSS class map): every
 *     known status string maps to its intended variant. Unknown
 *     strings fall through to "default". This is a pure mapping
 *     with no test coverage elsewhere — easy to mutate accidentally
 *     in a refactor (e.g. dropping the "Bad" arm).
 *
 *  5. Overall-system badge: "System Error" vs "All Systems
 *     Operational" gated on `status.error_state`. Users rely on
 *     the visible cue at the top of the page.
 *
 *  6. `getDecoderRate` precedence: when messageRate is non-null
 *     AND the decoder name maps to a known key, the live rate
 *     wins over the polled-status fallback. Otherwise the
 *     fallback (or 0) is used. This is the difference between a
 *     5-second-cadence "live" rate and a 10-second-cadence
 *     "polled" rate — pinning so a refactor that flips the
 *     precedence (showing stale data) is caught.
 *
 *  7. Unknown decoder names: DECODER_NAME_TO_RATE_KEY only maps
 *     ACARS/VDLM2/HFDL/IMSL/IRDM. An unknown name (e.g. a future
 *     decoder shipped before the rate map is updated) must fall
 *     through to the status fallback instead of crashing.
 *
 *  8. Empty-state strings: each card shows a specific "no X
 *     configured" message when its respective map is empty. Lost
 *     in a refactor that shifts the empty check.
 *
 *  9. Conditional cards: `threads`, `errors`, and the
 *     Configuration card (`decoders`) only render when their
 *     source data is present.
 *
 *  10. Errors-card variant: switches between `warning` (Total > 0)
 *      and default (Total === 0) — a visual signal that something
 *      is currently wrong.
 *
 *  11. Locale formatting of counts: `Count?.toLocaleString() ?? 0`
 *      — 1234 renders with the locale separator (e.g. "1,234")
 *      and undefined falls back to "0". Pinning so a refactor that
 *      drops the locale-formatting still preserves the
 *      undefined-safe fallback.
 *
 *  Out of scope: exact CSS class names (covered by visual/manual
 *  QA) and the layout-driven status-grid structure.
 */

import { act, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { socketService } from "../../services/socket";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SystemStatus } from "../../types";
import { StatusPage } from "../StatusPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/socket", () => ({
  socketService: {
    notifyPageChange: vi.fn(),
    requestStatus: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStatus(
  overrides: Partial<SystemStatus["status"]> = {},
): SystemStatus {
  return {
    status: {
      error_state: false,
      decoders: {},
      servers: {},
      global: {},
      stats: {},
      external_formats: {},
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StatusPage", () => {
  beforeEach(() => {
    useAppStore.setState({
      systemStatus: null,
      decoders: null,
      messageRate: null,
    });
    // Keep settings deterministic across tests so formatTimestamp output
    // doesn't drift between test runs / locales.
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        regional: {
          ...s.settings.regional,
          timeFormat: "24h",
          dateFormat: "ymd",
          timezone: "utc",
        },
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("loading branch", () => {
    it("renders 'Loading system status...' when systemStatus is null", () => {
      render(<StatusPage />);
      expect(screen.getByText(/Loading system status/i)).toBeInTheDocument();
    });

    it("does NOT throw when systemStatus is null (the early-return guards the destructure)", () => {
      // Sanity: destructuring `status` from null throws. The guard
      // prevents that.
      expect(() => render(<StatusPage />)).not.toThrow();
    });
  });

  describe("page-mount side effects", () => {
    it("marks the current page as 'Status' in the store on mount", () => {
      render(<StatusPage />);
      expect(useAppStore.getState().currentPage).toBe("Status");
    });

    it("notifies the backend of the page change exactly once on mount", () => {
      render(<StatusPage />);
      expect(socketService.notifyPageChange).toHaveBeenCalledTimes(1);
      expect(socketService.notifyPageChange).toHaveBeenCalledWith("Status");
    });

    it("requests status immediately on mount (before the first interval tick)", () => {
      // Critical: without the eager call the page would show
      // "Loading..." for a full 10 seconds.
      render(<StatusPage />);
      expect(socketService.requestStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("polling cadence", () => {
    let setIntervalSpy: MockInstance<typeof globalThis.setInterval>;
    let clearIntervalSpy: MockInstance<typeof globalThis.clearInterval>;

    beforeEach(() => {
      vi.useFakeTimers();
      // Re-stub the store under fake timers (the outer beforeEach
      // ran first, but setState itself isn't timer-driven so this
      // is just defensive).
      useAppStore.setState({ systemStatus: null });
      setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    });

    afterEach(() => {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      vi.useRealTimers();
    });

    it("polls requestStatus every 10 000 ms", () => {
      render(<StatusPage />);
      // 1 eager call on mount.
      expect(socketService.requestStatus).toHaveBeenCalledTimes(1);

      // After one 10 s tick, one more call.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(socketService.requestStatus).toHaveBeenCalledTimes(2);

      // After another 10 s tick, one more.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(socketService.requestStatus).toHaveBeenCalledTimes(3);

      // Pin the exact interval (not just "called more than once").
      // A refactor to 1000ms would flood the backend; pinning
      // catches it without a flaky timing test.
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);
    });

    it("clears the interval on unmount (no leak across SPA nav)", () => {
      const { unmount } = render(<StatusPage />);
      const intervalId = setIntervalSpy.mock.results[0]?.value;
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    });
  });

  describe("overall-system badge", () => {
    it("shows 'All Systems Operational' when error_state is false", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ error_state: false }),
      });
      render(<StatusPage />);
      expect(screen.getByText("All Systems Operational")).toBeInTheDocument();
      expect(screen.queryByText("System Error")).toBeNull();
    });

    it("shows 'System Error' when error_state is true", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ error_state: true }),
      });
      render(<StatusPage />);
      expect(screen.getByText("System Error")).toBeInTheDocument();
      expect(screen.queryByText("All Systems Operational")).toBeNull();
    });
  });

  describe("status→variant mapping (renderStatusBadge)", () => {
    // We test the mapping via the rendered className. Each test
    // sets up a single decoder with a known status string and
    // asserts the resulting badge class. Pinning every arm of the
    // switch.

    function renderWithDecoderStatus(status: string): HTMLElement {
      useAppStore.setState({
        systemStatus: makeStatus({
          decoders: {
            TEST: { Status: status, Connected: true, Alive: true },
          },
        }),
      });
      render(<StatusPage />);
      return screen.getByText(status);
    }

    it("maps 'Ok' to the success variant", () => {
      const badge = renderWithDecoderStatus("Ok");
      expect(badge.className).toContain("status-badge--success");
    });

    it("maps 'Disconnected' to the warning variant", () => {
      const badge = renderWithDecoderStatus("Disconnected");
      expect(badge.className).toContain("status-badge--warning");
    });

    it("maps 'Waiting for first message' to the warning variant", () => {
      // The literal-string match is what's interesting here — a
      // typo on the backend side breaks the mapping silently.
      const badge = renderWithDecoderStatus("Waiting for first message");
      expect(badge.className).toContain("status-badge--warning");
    });

    it("maps 'Dead' to the error variant", () => {
      const badge = renderWithDecoderStatus("Dead");
      expect(badge.className).toContain("status-badge--error");
    });

    it("maps 'Bad' to the error variant", () => {
      const badge = renderWithDecoderStatus("Bad");
      expect(badge.className).toContain("status-badge--error");
    });

    it("falls through to the default variant for unknown status strings", () => {
      const badge = renderWithDecoderStatus("Initializing");
      expect(badge.className).toContain("status-badge--default");
    });
  });

  describe("decoder rate precedence (getDecoderRate)", () => {
    it("uses live messageRate when present and the name maps to a known key", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            ACARS: { Status: "Ok", Count: 1000, LastMinute: 5 },
          },
        }),
        messageRate: {
          total: 42,
          acars: 17,
          vdlm2: 0,
          hfdl: 0,
          imsl: 0,
          irdm: 0,
        },
      });
      render(<StatusPage />);
      // Live rate (17) wins over status fallback (5).
      expect(screen.getByText("17 msg/min")).toBeInTheDocument();
      expect(screen.queryByText("5 msg/min")).toBeNull();
    });

    it("falls back to status.LastMinute when messageRate is null", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            ACARS: { Status: "Ok", Count: 1000, LastMinute: 5 },
          },
        }),
        messageRate: null,
      });
      render(<StatusPage />);
      expect(screen.getByText("5 msg/min")).toBeInTheDocument();
    });

    it("falls back to 0 when both messageRate AND LastMinute are missing", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            ACARS: { Status: "Ok", Count: 1000 },
          },
        }),
        messageRate: null,
      });
      render(<StatusPage />);
      expect(screen.getByText("0 msg/min")).toBeInTheDocument();
    });

    it("falls back to status.LastMinute for unknown decoder names even when messageRate is present", () => {
      // DECODER_NAME_TO_RATE_KEY does not include "FUTURE". The
      // function must not throw and must not return the wrong
      // decoder's rate by accident.
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            FUTURE: { Status: "Ok", Count: 100, LastMinute: 3 },
          },
        }),
        messageRate: {
          total: 99,
          acars: 99,
          vdlm2: 99,
          hfdl: 99,
          imsl: 99,
          irdm: 99,
        },
      });
      render(<StatusPage />);
      expect(screen.getByText("3 msg/min")).toBeInTheDocument();
      // The 99 from acars MUST NOT leak through.
      expect(screen.queryByText("99 msg/min")).toBeNull();
    });
  });

  describe("empty-state messages", () => {
    // Each Card has a "nothing here yet" message when its source
    // map is empty. The exact wording is user-facing.

    it("shows 'No decoders configured' when status.decoders is empty", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ decoders: {} }),
      });
      render(<StatusPage />);
      expect(screen.getByText("No decoders configured")).toBeInTheDocument();
    });

    it("shows 'No message statistics available' when status.global is empty", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ global: {} }),
      });
      render(<StatusPage />);
      expect(
        screen.getByText("No message statistics available"),
      ).toBeInTheDocument();
    });

    it("shows 'No servers configured' when status.servers is empty", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ servers: {} }),
      });
      render(<StatusPage />);
      expect(screen.getByText("No servers configured")).toBeInTheDocument();
    });
  });

  describe("conditional cards", () => {
    it("does NOT render the System Threads card when status.threads is absent", () => {
      useAppStore.setState({
        systemStatus: makeStatus(),
      });
      render(<StatusPage />);
      expect(screen.queryByText("System Threads")).toBeNull();
    });

    it("renders the System Threads card with the correct status badges when threads is present", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          threads: { database: true, scheduler: false },
        }),
      });
      render(<StatusPage />);
      expect(screen.getByText("System Threads")).toBeInTheDocument();
      // database=true → "Ok"; scheduler=false → "Dead"
      const dbRow = screen.getByText("Database Thread").parentElement;
      const schedRow = screen.getByText("Scheduler Thread").parentElement;
      expect(dbRow?.textContent).toContain("Ok");
      expect(schedRow?.textContent).toContain("Dead");
    });

    it("does NOT render the Decoding Errors card when status.errors is absent", () => {
      useAppStore.setState({
        systemStatus: makeStatus(),
      });
      render(<StatusPage />);
      expect(screen.queryByText("Decoding Errors")).toBeNull();
    });

    it("renders Decoding Errors with default variant when Total === 0", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          errors: { Total: 0, LastMinute: 0 },
        }),
      });
      const { container } = render(<StatusPage />);
      // The Card's outer class encodes the variant. Find the
      // ancestor Card by walking up from the title.
      const title = screen.getByText("Decoding Errors");
      const card = title.closest(".card");
      expect(card).not.toBeNull();
      // Pinning: warning variant must NOT be applied when Total = 0.
      expect(card?.className ?? "").not.toContain("card--warning");
      // Sanity: it's rendered.
      expect(container.textContent).toContain("Decoding Errors");
    });

    it("renders Decoding Errors with warning variant when Total > 0", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          errors: { Total: 7, LastMinute: 2 },
        }),
      });
      render(<StatusPage />);
      const title = screen.getByText("Decoding Errors");
      const card = title.closest(".card");
      expect(card?.className ?? "").toContain("card--warning");
    });

    it("does NOT render the Configuration card when decoders is null", () => {
      useAppStore.setState({
        systemStatus: makeStatus(),
        decoders: null,
      });
      render(<StatusPage />);
      expect(screen.queryByText("Configuration")).toBeNull();
    });

    it("renders the Configuration card with Yes/No flags when decoders is present", () => {
      useAppStore.setState({
        systemStatus: makeStatus(),
        decoders: {
          acars: true,
          vdlm: false,
          hfdl: true,
          imsl: false,
          irdm: true,
          allow_remote_updates: false,
          adsb: { enabled: true, lat: 0, lon: 0, range_rings: false },
        },
      });
      render(<StatusPage />);
      expect(screen.getByText("Configuration")).toBeInTheDocument();

      const findRowValue = (label: string): string | null | undefined =>
        screen.getByText(label).parentElement?.textContent;

      // Pin the truthy and falsy bits both directions so a flipped
      // conditional surfaces immediately.
      expect(findRowValue("ACARS Enabled:")).toContain("Yes");
      expect(findRowValue("VDLM Enabled:")).toContain("No");
      expect(findRowValue("HFDL Enabled:")).toContain("Yes");
      expect(findRowValue("IMSL Enabled:")).toContain("No");
      expect(findRowValue("IRDM Enabled:")).toContain("Yes");
      expect(findRowValue("ADS-B Enabled:")).toContain("Yes");
    });
  });

  describe("count formatting", () => {
    it("formats decoder counts with locale separators", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            ACARS: { Status: "Ok", Count: 1234567, LastMinute: 0 },
          },
        }),
      });
      render(<StatusPage />);
      // en-US default → "1,234,567". JSDOM follows the host locale,
      // but Vitest pins it to en-US by default. If a future env
      // change shifts the locale, this assertion can be relaxed
      // to /[\d,.\s]+1\D?234\D?567/.
      expect(screen.getByText("1,234,567")).toBeInTheDocument();
    });

    it("renders 0 when Count is undefined (the ?? fallback)", () => {
      // Build the global entry with Count omitted. The
      // StatusGlobal index type marks Count as required, so we
      // construct via Partial<> and assert to the real type
      // shape — this exercises the optional-chain `?.` plus the
      // `?? 0` fallback without resorting to `any`.
      const partialGlobal: SystemStatus["status"]["global"] = {
        ACARS: { Status: "Ok" } as SystemStatus["status"]["global"][string],
      };
      useAppStore.setState({
        systemStatus: makeStatus({ global: partialGlobal }),
      });
      render(<StatusPage />);
      // Total: 0 (from the fallback)
      const totalLabel = screen.getByText("Total:");
      expect(totalLabel.parentElement?.textContent).toContain("0");
    });
  });
});

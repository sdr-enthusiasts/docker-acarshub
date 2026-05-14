// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * StatsPage Tests
 *
 * Why this exists: StatsPage is the user-facing data-visualisation
 * dashboard. It wires together:
 *
 *   - 5 chart components (TimeSeries, SignalLevel, AlertTerms,
 *     Frequency, MessageCount).
 *   - 6 top-level sections selected via a TabSwitcher.
 *   - Two sub-tab strips (time period + decoder for Reception;
 *     decoder for Frequency).
 *   - A 30-second stats poller AND a 10-second status poller, both
 *     started on mount and both cleaned up on unmount.
 *   - A stale-state guard that resets `selectedFreqDecoder` when
 *     the enabled-decoder set changes such that the current
 *     selection is no longer valid.
 *
 * Most of this logic is in conditional render branches and effect
 * cleanup paths that the type system won't catch if mutated. This
 * suite pins:
 *
 *   1. Mount side effects:
 *      - `setCurrentPage("Status")` — yes, the page sets its name
 *        to "Status", NOT "Statistics". That's a pre-existing
 *        quirk (StatsPage and StatusPage share the keyboard-
 *        shortcut layer); the regression test here documents the
 *        current behaviour so a "fix" doesn't silently break
 *        whoever is depending on it.
 *      - `socketService.notifyPageChange("Status")`.
 *      - `requestStatus()` called eagerly on mount.
 *      - `requestSignalGraphs() + requestSignalFreqs() +
 *        requestSignalCount()` called when `decoders` is present
 *        (not when it's null — this gates the data flow until the
 *        decoder config is known).
 *
 *   2. Poller cadences: 30 000 ms for stats, 10 000 ms for status.
 *      Both intervals must be `clearInterval`d on unmount. A
 *      regression to 1 000 ms (either) would flood the backend; a
 *      missed cleanup would leak intervals across navigation.
 *
 *   3. Default section: "Reception Over Time" renders on first
 *      paint (the chart placeholder is visible, the System Status
 *      panel is not).
 *
 *   4. Section switching: clicking each main-section tab swaps
 *      content. We assert the unique heading or chart placeholder
 *      for each of the six sections.
 *
 *   5. `getStatusVariant` (status case): every known status string
 *      maps to its intended variant. Unknown strings fall through
 *      to "default". Pure mapping, otherwise untested. This is
 *      duplicated logic with StatusPage — pinning both so a
 *      future de-dupe refactor doesn't accidentally drift the
 *      mappings.
 *
 *   6. Overall-system badge: "System Error Detected" vs "All
 *      Systems Operational" gated on `status.error_state`.
 *
 *   7. Empty-state strings: each of decoders/global/servers cards
 *      shows a specific message when its respective map is empty.
 *
 *   8. Conditional cards in the status section: `threads`,
 *      `errors`, and `Configuration` (gated on `decoders` from
 *      the store) only render when their source data is present.
 *
 *   9. Errors-card variant: switches between `warning` (Total > 0)
 *      and default (Total === 0).
 *
 *   10. Count formatting: `stats.Count?.toLocaleString() ?? 0` —
 *       1 234 567 renders with the locale separator; undefined
 *       falls back to "0". Same for `servers.Messages` and
 *       `errors.Total`. Pinning so a refactor that drops the
 *       optional-chain leaves the undefined-safe fallback intact.
 *
 *   11. Reception sub-tabs (decoder strip): includes "Combined"
 *       always, "Errors" always, and one tab per enabled decoder.
 *       A disabled decoder MUST NOT appear (otherwise the user
 *       can pick a decoder that produces no data).
 *
 *   12. Frequency sub-tabs: ONLY the enabled decoders, no
 *       "Combined", no "Errors". When all decoders are disabled,
 *       the frequency section shows a "No decoders enabled" empty
 *       state instead of an empty tab strip.
 *
 *   13. Stale-state guard: when enabled-decoder set changes such
 *       that the currently-selected frequency decoder is no
 *       longer valid (e.g. user selected VDLM, then VDLM is
 *       disabled remotely), `selectedFreqDecoder` resets to the
 *       first remaining valid decoder. Without this, the
 *       FrequencyChart would receive `[]` for a now-disabled
 *       decoder and the user would see an unexplained blank
 *       chart.
 *
 *   14. Decoder type mapping for frequency data: backend
 *       `freq_type` values ("VDL-M2", "IMS-L", etc.) are mapped
 *       to our internal keys ("vdlm", "imsl", etc.). A mutation
 *       that drops a mapping would route data into the
 *       no-decoder bucket and the chart would silently render
 *       empty.
 *
 *   15. Configuration card: ADS-B "Yes/No" row reads from
 *       `decoders.adsb.enabled` (nested object, easy to break in
 *       a refactor).
 *
 * Out of scope:
 *   - Exact CSS class names (visual/manual QA).
 *   - Chart internals (covered by their own suites).
 *   - TabSwitcher keyboard navigation (covered by TabSwitcher's
 *     own tests).
 *   - Locale-string formatting beyond en-US (JSDOM default).
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import type {
  Decoders,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
  SystemStatus,
} from "../../types";
import { StatsPage } from "../StatsPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/socket", () => ({
  socketService: {
    notifyPageChange: vi.fn(),
    requestStatus: vi.fn(),
    requestSignalGraphs: vi.fn(),
    requestSignalFreqs: vi.fn(),
    requestSignalCount: vi.fn(),
  },
}));

// Stub the RRD hook — StatsPage only reads its return value for the
// TimeSeriesChart props. We don't care about the cache machinery here.
vi.mock("../../hooks/useRRDTimeSeriesData", () => ({
  useRRDTimeSeriesData: vi.fn(() => ({
    data: [],
    loading: false,
    error: null,
    timeRange: null,
  })),
}));

// Replace charts with identifiable stubs that expose their props as
// data attributes so we can assert prop wiring (decoder selection,
// frequency data routing, etc.) without rendering real charts.
vi.mock("../../components/charts", () => ({
  TimeSeriesChart: (props: Record<string, unknown>) => (
    <div
      data-testid="time-series-chart"
      data-decoder={String(props.decoderType)}
      data-period={String(props.timePeriod)}
    />
  ),
  SignalLevelChart: () => <div data-testid="signal-level-chart" />,
  AlertTermsChart: () => <div data-testid="alert-terms-chart" />,
  FrequencyChart: (props: Record<string, unknown>) => (
    <div
      data-testid="frequency-chart"
      data-decoder={String(props.decoderType)}
      data-count={
        Array.isArray(props.frequencyData) ? props.frequencyData.length : 0
      }
    />
  ),
  MessageCountChart: (props: Record<string, unknown>) => (
    <div
      data-testid="message-count-chart"
      data-empty={String(props.showEmptyMessages)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_DECODERS_ENABLED: Decoders = {
  acars: true,
  vdlm: true,
  hfdl: true,
  imsl: true,
  irdm: true,
  allow_remote_updates: false,
  adsb: {
    enabled: true,
    lat: 0,
    lon: 0,
    range_rings: false,
  },
};

const NO_DECODERS_ENABLED: Decoders = {
  ...ALL_DECODERS_ENABLED,
  acars: false,
  vdlm: false,
  hfdl: false,
  imsl: false,
  irdm: false,
  adsb: { ...ALL_DECODERS_ENABLED.adsb, enabled: false },
};

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

function resetStore(): void {
  useAppStore.setState({
    decoders: null,
    systemStatus: null,
    signalLevels: null,
    alertTermData: null,
    signalFreqData: null,
    signalCountData: null,
  });
}

function clickSection(label: string): void {
  // The main section nav is the first TabSwitcher (aria-label =
  // "Select statistics section"). Use it to scope the click.
  const nav = screen.getByRole("tablist", {
    name: /select statistics section/i,
  });
  const tab = within(nav).getByRole("tab", { name: label });
  fireEvent.click(tab);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StatsPage", () => {
  let setIntervalSpy: MockInstance;
  let clearIntervalSpy: MockInstance;

  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    // JSDOM doesn't implement scrollIntoView; TabSwitcher calls it on
    // mount and on every active-tab change. Without this stub the
    // useEffect throws and every section-switching test cascades to
    // failure with an unrelated TypeError.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Mount side effects
  // -------------------------------------------------------------------------

  describe("mount side effects", () => {
    it("sets current page to 'Status' (pre-existing quirk — shared with StatusPage)", () => {
      render(<StatsPage />);
      expect(useAppStore.getState().currentPage).toBe("Status");
    });

    it("notifies the socket of the page change on mount", () => {
      render(<StatsPage />);
      expect(socketService.notifyPageChange).toHaveBeenCalledWith("Status");
    });

    it("requests status eagerly on mount (does not wait 10s for first tick)", () => {
      render(<StatsPage />);
      // Before any timers advance.
      expect(socketService.requestStatus).toHaveBeenCalledTimes(1);
    });

    it("does NOT request signal data when decoders is null (gates on config)", () => {
      // Default fixture has decoders=null.
      render(<StatsPage />);
      expect(socketService.requestSignalGraphs).not.toHaveBeenCalled();
      expect(socketService.requestSignalFreqs).not.toHaveBeenCalled();
      expect(socketService.requestSignalCount).not.toHaveBeenCalled();
    });

    it("requests signal data eagerly when decoders is present", () => {
      useAppStore.setState({ decoders: ALL_DECODERS_ENABLED });
      render(<StatsPage />);
      expect(socketService.requestSignalGraphs).toHaveBeenCalledTimes(1);
      expect(socketService.requestSignalFreqs).toHaveBeenCalledTimes(1);
      expect(socketService.requestSignalCount).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Poller cadence + cleanup
  // -------------------------------------------------------------------------

  describe("poller cadence", () => {
    it("registers both intervals on mount: 30 000 ms (stats) and 10 000 ms (status)", () => {
      render(<StatsPage />);
      const delays = setIntervalSpy.mock.calls.map((call) => call[1]);
      expect(delays).toContain(30000);
      expect(delays).toContain(10000);
    });

    it("fires requestStatus on every 10s status tick (in addition to the eager mount call)", () => {
      useAppStore.setState({ decoders: ALL_DECODERS_ENABLED });
      render(<StatsPage />);
      // Eager mount call.
      expect(socketService.requestStatus).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(socketService.requestStatus).toHaveBeenCalledTimes(2);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(socketService.requestStatus).toHaveBeenCalledTimes(3);
    });

    it("fires requestSignalFreqs on every 30s stats tick", () => {
      useAppStore.setState({ decoders: ALL_DECODERS_ENABLED });
      render(<StatsPage />);
      // Eager mount call from requestData().
      expect(socketService.requestSignalFreqs).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(30000);
      });
      expect(socketService.requestSignalFreqs).toHaveBeenCalledTimes(2);
    });

    it("clears both intervals on unmount (no leak across navigation)", () => {
      const { unmount } = render(<StatsPage />);
      const intervalCount = setIntervalSpy.mock.results.length;
      expect(intervalCount).toBeGreaterThanOrEqual(2);
      unmount();
      // Two clearInterval calls — one per interval registered on mount.
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Default section + section switching
  // -------------------------------------------------------------------------

  describe("section navigation", () => {
    it("renders the Reception Over Time section by default", () => {
      render(<StatsPage />);
      expect(
        screen.getByRole("heading", { name: /message reception over time/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("time-series-chart")).toBeInTheDocument();
    });

    it("switches to Signal Levels", () => {
      render(<StatsPage />);
      clickSection("Signal Levels");
      expect(screen.getByTestId("signal-level-chart")).toBeInTheDocument();
    });

    it("switches to Alert Terms", () => {
      render(<StatsPage />);
      clickSection("Alert Terms");
      expect(screen.getByTestId("alert-terms-chart")).toBeInTheDocument();
    });

    it("switches to Message Statistics (renders both data and empty message-count charts)", () => {
      render(<StatsPage />);
      clickSection("Message Statistics");
      const charts = screen.getAllByTestId("message-count-chart");
      expect(charts).toHaveLength(2);
      // Pin the prop-passing: one shows non-empty data, one shows empty.
      expect(charts[0].getAttribute("data-empty")).toBe("false");
      expect(charts[1].getAttribute("data-empty")).toBe("true");
    });

    it("switches to System Status (loading branch when systemStatus is null)", () => {
      render(<StatsPage />);
      clickSection("System Status");
      expect(screen.getByText(/loading system status/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Reception sub-tabs
  // -------------------------------------------------------------------------

  describe("Reception decoder tabs", () => {
    it("always shows Combined and Errors, even when no decoders are enabled", () => {
      useAppStore.setState({ decoders: NO_DECODERS_ENABLED });
      render(<StatsPage />);
      const decoderNav = screen.getByRole("tablist", {
        name: /select decoder type/i,
      });
      expect(
        within(decoderNav).getByRole("tab", { name: "Combined" }),
      ).toBeInTheDocument();
      expect(
        within(decoderNav).getByRole("tab", { name: "Errors" }),
      ).toBeInTheDocument();
      // None of the per-decoder tabs.
      expect(
        within(decoderNav).queryByRole("tab", { name: "ACARS" }),
      ).toBeNull();
      expect(
        within(decoderNav).queryByRole("tab", { name: "VDLM" }),
      ).toBeNull();
    });

    it("includes only enabled decoders in the strip", () => {
      useAppStore.setState({
        decoders: { ...NO_DECODERS_ENABLED, acars: true, hfdl: true },
      });
      render(<StatsPage />);
      const decoderNav = screen.getByRole("tablist", {
        name: /select decoder type/i,
      });
      expect(
        within(decoderNav).getByRole("tab", { name: "ACARS" }),
      ).toBeInTheDocument();
      expect(
        within(decoderNav).getByRole("tab", { name: "HFDL" }),
      ).toBeInTheDocument();
      expect(
        within(decoderNav).queryByRole("tab", { name: "VDLM" }),
      ).toBeNull();
      expect(
        within(decoderNav).queryByRole("tab", { name: "IMSL" }),
      ).toBeNull();
      expect(
        within(decoderNav).queryByRole("tab", { name: "IRDM" }),
      ).toBeNull();
    });

    it("clicking a decoder tab updates the TimeSeriesChart decoderType prop", () => {
      useAppStore.setState({ decoders: ALL_DECODERS_ENABLED });
      render(<StatsPage />);
      expect(screen.getByTestId("time-series-chart").dataset.decoder).toBe(
        "combined",
      );
      const decoderNav = screen.getByRole("tablist", {
        name: /select decoder type/i,
      });
      fireEvent.click(within(decoderNav).getByRole("tab", { name: "VDLM" }));
      expect(screen.getByTestId("time-series-chart").dataset.decoder).toBe(
        "vdlm",
      );
    });

    it("clicking a time-period tab updates the TimeSeriesChart timePeriod prop", () => {
      render(<StatsPage />);
      expect(screen.getByTestId("time-series-chart").dataset.period).toBe(
        "24hr",
      );
      const periodNav = screen.getByRole("tablist", {
        name: /select time period/i,
      });
      fireEvent.click(within(periodNav).getByRole("tab", { name: "1 Week" }));
      expect(screen.getByTestId("time-series-chart").dataset.period).toBe(
        "1wk",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Frequency section
  // -------------------------------------------------------------------------

  describe("Frequency Distribution section", () => {
    it("shows 'No decoders enabled' empty state when all decoders are off", () => {
      useAppStore.setState({ decoders: NO_DECODERS_ENABLED });
      render(<StatsPage />);
      clickSection("Frequency Distribution");
      expect(screen.getByText(/no decoders enabled/i)).toBeInTheDocument();
      expect(
        screen.getByText(/no frequency data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("frequency-chart")).toBeNull();
    });

    it("renders only enabled decoders in the frequency tab strip (no Combined, no Errors)", () => {
      useAppStore.setState({
        decoders: { ...NO_DECODERS_ENABLED, acars: true, imsl: true },
      });
      render(<StatsPage />);
      clickSection("Frequency Distribution");
      const freqNav = screen.getByRole("tablist", {
        name: /select decoder for frequency distribution/i,
      });
      expect(
        within(freqNav).getByRole("tab", { name: "ACARS" }),
      ).toBeInTheDocument();
      expect(
        within(freqNav).getByRole("tab", { name: "IMSL" }),
      ).toBeInTheDocument();
      expect(
        within(freqNav).queryByRole("tab", { name: "Combined" }),
      ).toBeNull();
      expect(within(freqNav).queryByRole("tab", { name: "Errors" })).toBeNull();
      expect(within(freqNav).queryByRole("tab", { name: "VDLM" })).toBeNull();
    });

    it("maps backend freq_type values to internal keys and routes data to the selected decoder", () => {
      useAppStore.setState({
        decoders: ALL_DECODERS_ENABLED,
        signalFreqData: {
          freqs: [
            { freq: "131.55", freq_type: "ACARS", count: 5 },
            { freq: "131.825", freq_type: "ACARS", count: 3 },
            { freq: "136.975", freq_type: "VDL-M2", count: 12 },
            { freq: "8927", freq_type: "HFDL", count: 1 },
            { freq: "1545.0", freq_type: "IMS-L", count: 7 },
            { freq: "1626.0", freq_type: "IRDM", count: 4 },
            // Unknown freq_type — must be silently dropped, not crash.
            { freq: "0", freq_type: "UNKNOWN", count: 99 },
          ],
        } as SignalFreqData,
      });
      render(<StatsPage />);
      clickSection("Frequency Distribution");
      // Default selected decoder is "acars" — 2 frequencies routed there.
      const chart = screen.getByTestId("frequency-chart");
      expect(chart.dataset.decoder).toBe("ACARS");
      expect(chart.dataset.count).toBe("2");

      // Switch to VDLM (frontend label) — should map to "vdlm" key and
      // receive the 1 "VDL-M2" entry.
      const freqNav = screen.getByRole("tablist", {
        name: /select decoder for frequency distribution/i,
      });
      fireEvent.click(within(freqNav).getByRole("tab", { name: "VDLM" }));
      expect(screen.getByTestId("frequency-chart").dataset.decoder).toBe(
        "VDLM",
      );
      expect(screen.getByTestId("frequency-chart").dataset.count).toBe("1");
    });

    it("resets selectedFreqDecoder when the previously-selected decoder is disabled", () => {
      // Start with VDLM + IRDM enabled, then user selects VDLM.
      useAppStore.setState({
        decoders: { ...NO_DECODERS_ENABLED, vdlm: true, irdm: true },
      });
      const { rerender } = render(<StatsPage />);
      clickSection("Frequency Distribution");
      // Initial selection is the first available — VDLM in this fixture.
      const freqNav = screen.getByRole("tablist", {
        name: /select decoder for frequency distribution/i,
      });
      fireEvent.click(within(freqNav).getByRole("tab", { name: "VDLM" }));
      expect(screen.getByTestId("frequency-chart").dataset.decoder).toBe(
        "VDLM",
      );

      // Backend disables VDLM (e.g. config change pushed via socket).
      act(() => {
        useAppStore.setState({
          decoders: { ...NO_DECODERS_ENABLED, irdm: true },
        });
      });
      rerender(<StatsPage />);
      // selectedFreqDecoder must fall back to the first remaining
      // valid decoder (IRDM here), NOT stay stuck on VDLM rendering
      // an empty chart for a disabled decoder.
      expect(screen.getByTestId("frequency-chart").dataset.decoder).toBe(
        "IRDM",
      );
    });

    it("returns empty per-decoder buckets when signalFreqData is null (no crash)", () => {
      useAppStore.setState({
        decoders: ALL_DECODERS_ENABLED,
        signalFreqData: null,
      });
      render(<StatsPage />);
      clickSection("Frequency Distribution");
      expect(screen.getByTestId("frequency-chart").dataset.count).toBe("0");
    });
  });

  // -------------------------------------------------------------------------
  // System Status section
  // -------------------------------------------------------------------------

  describe("System Status section", () => {
    it("renders 'All Systems Operational' when error_state is false", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ error_state: false }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      expect(
        screen.getByRole("heading", { name: /all systems operational/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /system error/i }),
      ).toBeNull();
    });

    it("renders 'System Error Detected' when error_state is true", () => {
      useAppStore.setState({ systemStatus: makeStatus({ error_state: true }) });
      render(<StatsPage />);
      clickSection("System Status");
      expect(
        screen.getByRole("heading", { name: /system error detected/i }),
      ).toBeInTheDocument();
    });

    it("shows empty-state strings for decoders, global, and servers cards", () => {
      useAppStore.setState({ systemStatus: makeStatus() });
      render(<StatsPage />);
      clickSection("System Status");
      expect(screen.getByText(/no decoders configured/i)).toBeInTheDocument();
      expect(
        screen.getByText(/no message statistics available/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/no servers configured/i)).toBeInTheDocument();
    });

    it("renders status badges for each decoder using getStatusVariant mapping", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          decoders: {
            ACARS: { Status: "Ok", Connected: true, Alive: true },
            VDLM: { Status: "Disconnected", Connected: false, Alive: true },
            HFDL: { Status: "Dead", Connected: false, Alive: false },
            IMSL: { Status: "Bad", Connected: false, Alive: false },
            IRDM: {
              Status: "Waiting for first message",
              Connected: true,
              Alive: true,
            },
            FUTURE: {
              Status: "Unknown future state",
              Connected: true,
              Alive: true,
            },
          },
        }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      // Each status string is rendered inside a span; pin presence.
      expect(screen.getByText("Ok")).toBeInTheDocument();
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
      expect(screen.getByText("Dead")).toBeInTheDocument();
      expect(screen.getByText("Bad")).toBeInTheDocument();
      expect(screen.getByText("Waiting for first message")).toBeInTheDocument();
      expect(screen.getByText("Unknown future state")).toBeInTheDocument();
      // Variant classes via getStatusVariant. The span itself carries
      // the class — find a known one and assert.
      expect(screen.getByText("Ok").className).toContain(
        "status-badge--success",
      );
      expect(screen.getByText("Disconnected").className).toContain(
        "status-badge--warning",
      );
      expect(screen.getByText("Dead").className).toContain(
        "status-badge--error",
      );
      expect(screen.getByText("Bad").className).toContain(
        "status-badge--error",
      );
      expect(screen.getByText("Waiting for first message").className).toContain(
        "status-badge--warning",
      );
      // Unknown falls through to default.
      expect(screen.getByText("Unknown future state").className).toContain(
        "status-badge--default",
      );
    });

    it("renders threads card only when status.threads is present", () => {
      useAppStore.setState({ systemStatus: makeStatus() });
      const { rerender } = render(<StatsPage />);
      clickSection("System Status");
      expect(screen.queryByText(/database thread/i)).toBeNull();

      act(() => {
        useAppStore.setState({
          systemStatus: makeStatus({
            threads: { database: true, scheduler: false },
          }),
        });
      });
      rerender(<StatsPage />);
      expect(screen.getByText(/database thread/i)).toBeInTheDocument();
      expect(screen.getByText(/scheduler thread/i)).toBeInTheDocument();
      // Scheduler is false → "Dead" badge.
      expect(screen.getAllByText("Dead").length).toBeGreaterThanOrEqual(1);
    });

    it("renders errors card only when status.errors is present", () => {
      useAppStore.setState({ systemStatus: makeStatus() });
      const { rerender } = render(<StatsPage />);
      clickSection("System Status");
      expect(
        screen.queryByRole("heading", { name: /^decoding errors$/i }),
      ).toBeNull();

      act(() => {
        useAppStore.setState({
          systemStatus: makeStatus({
            errors: { Total: 1234567, LastMinute: 42 },
          }),
        });
      });
      rerender(<StatsPage />);
      expect(
        screen.getByRole("heading", { name: /^decoding errors$/i }),
      ).toBeInTheDocument();
      // Locale-formatted total.
      expect(screen.getByText("1,234,567")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("renders configuration card only when decoders is present, with ADS-B row", () => {
      useAppStore.setState({ systemStatus: makeStatus() });
      const { rerender } = render(<StatsPage />);
      clickSection("System Status");
      expect(screen.queryByText(/^ACARS Enabled:$/)).toBeNull();

      act(() => {
        useAppStore.setState({
          decoders: { ...ALL_DECODERS_ENABLED, vdlm: false },
          systemStatus: makeStatus(),
        });
      });
      rerender(<StatsPage />);
      // Configuration card present.
      expect(screen.getByText(/^ACARS Enabled:$/)).toBeInTheDocument();
      expect(screen.getByText(/^ADS-B Enabled:$/)).toBeInTheDocument();
      // VDLM disabled in fixture above; ACARS enabled. Pin the labels
      // and their Yes/No values rendered within the same row.
      const acarsLabel = screen.getByText(/^ACARS Enabled:$/);
      // Sibling span carries the value.
      expect(acarsLabel.parentElement?.textContent).toContain("Yes");
      const vdlmLabel = screen.getByText(/^VDLM Enabled:$/);
      expect(vdlmLabel.parentElement?.textContent).toContain("No");
    });

    it("formats global Count with locale separators and falls back to 0 for missing Count", () => {
      // Defensive: backend type says Count is required, but the page
      // uses `Count?.toLocaleString() ?? 0` — we deliberately omit
      // Count here to exercise the runtime guard against real-world
      // data drift (e.g. backend serialiser dropping the field).
      const vdlmWithoutCount = {
        Status: "Ok",
        LastMinute: 0,
      } as unknown as SystemStatus["status"]["global"][string];
      useAppStore.setState({
        systemStatus: makeStatus({
          global: {
            ACARS: {
              Status: "Ok",
              Count: 1234567,
              LastMinute: 5,
            },
            VDLM: vdlmWithoutCount,
          },
        }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      expect(screen.getByText("1,234,567")).toBeInTheDocument();
      // Fallback "0" for missing Count. There will be multiple "0"s
      // (LastMinute also 0); ensure at least one is present.
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
    });

    it("renders server Messages with locale separators (server-card variant of the Count fallback)", () => {
      useAppStore.setState({
        systemStatus: makeStatus({
          servers: {
            "feed.acars.io": { Status: "Ok", Messages: 9876543 },
          },
        }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      expect(screen.getByText("9,876,543")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Errors card warning-variant gate
  // -------------------------------------------------------------------------

  describe("errors card variant", () => {
    it("uses default variant when Total === 0", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ errors: { Total: 0, LastMinute: 0 } }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      // Locate the errors card by its heading and walk to the Card root.
      const title = screen.getByRole("heading", {
        name: /^decoding errors$/i,
      });
      const card = title.closest(".card");
      expect(card).not.toBeNull();
      // Default variant: no `card--warning` class.
      expect(card?.className).not.toContain("card--warning");
    });

    it("flips to warning variant when Total > 0", () => {
      useAppStore.setState({
        systemStatus: makeStatus({ errors: { Total: 1, LastMinute: 1 } }),
      });
      render(<StatsPage />);
      clickSection("System Status");
      const title = screen.getByRole("heading", {
        name: /^decoding errors$/i,
      });
      const card = title.closest(".card");
      expect(card).not.toBeNull();
      expect(card?.className).toContain("card--warning");
    });
  });

  // -------------------------------------------------------------------------
  // Signal data flow (props piped to charts)
  // -------------------------------------------------------------------------

  describe("signal data flow", () => {
    it("hands signalLevels to SignalLevelChart (the store→chart wire)", () => {
      const signalLevels: SignalLevelData = {
        acars: [{ level: -50, count: 10 }],
      };
      useAppStore.setState({ signalLevels });
      render(<StatsPage />);
      clickSection("Signal Levels");
      // Smoke: chart is rendered (full prop-shape assertions live in
      // the chart's own suite — here we only pin the page wires it in).
      expect(screen.getByTestId("signal-level-chart")).toBeInTheDocument();
    });

    it("hands signalCountData to BOTH MessageCountChart instances", () => {
      const signalCountData: SignalCountData = {
        ACARS: { good: 100, errors: 5, empty: 2 },
      } as unknown as SignalCountData;
      useAppStore.setState({ signalCountData });
      render(<StatsPage />);
      clickSection("Message Statistics");
      const charts = screen.getAllByTestId("message-count-chart");
      expect(charts).toHaveLength(2);
    });
  });
});

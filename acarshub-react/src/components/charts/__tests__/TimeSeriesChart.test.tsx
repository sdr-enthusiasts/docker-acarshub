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
import { describe, expect, it, vi } from "vitest";
import type { TimePeriod } from "../../../hooks/useRRDTimeSeriesData";
import { getMaxSpanMs, getYAxisLabel } from "../TimeSeriesChart";

// ---------------------------------------------------------------------------
// Mock Chart.js / react-chartjs-2
// Capture the options passed to <Line> so we can assert on y-axis title text
// without canvas rendering.
// ---------------------------------------------------------------------------

type CapturedOptions = {
  scales?: {
    x?: {
      min?: number;
      max?: number;
    };
    y?: {
      title?: {
        display?: boolean;
        text?: string;
      };
    };
  };
} | null;

let _capturedOptions: CapturedOptions = null;

/**
 * Read the last captured options.
 *
 * Using a function prevents TypeScript's control-flow narrowing from
 * collapsing the type to `null` after an explicit `_capturedOptions = null`
 * assignment inside a test callback — TypeScript cannot narrow the return
 * type of an opaque function call.
 */
function getCapturedOptions(): CapturedOptions {
  return _capturedOptions;
}

vi.mock("react-chartjs-2", () => ({
  Line: (props: { data: unknown; options: CapturedOptions }) => {
    _capturedOptions = props.options;
    return <div data-testid="line-chart" />;
  },
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  TimeScale: class {},
  PointElement: class {},
  LineElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
}));

vi.mock("chartjs-adapter-date-fns", () => ({}));

// Minimal settings store mock
vi.mock("../../../store/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (s: { settings: { appearance: { theme: string } } }) => unknown,
  ) => selector({ settings: { appearance: { theme: "mocha" } } }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDataPoint(timestamp: number) {
  return {
    timestamp,
    acars: 1,
    vdlm: 1,
    hfdl: 0,
    imsl: 0,
    irdm: 0,
    total: 2,
    error: 0,
  };
}

// Provide two data points so the chart renders past the loading/empty guard
const SAMPLE_DATA = [
  makeDataPoint(Date.now() - 120_000),
  makeDataPoint(Date.now() - 60_000),
];

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Import component AFTER mocks are in place
// ---------------------------------------------------------------------------

import { TimeSeriesChart } from "../TimeSeriesChart";

// ---------------------------------------------------------------------------
// getYAxisLabel — unit tests
//
// These tests directly verify the exported helper and double as the source
// of truth for the bucket-size → label mapping.  The mapping mirrors the
// backend periodMap in handlers.ts:
//
//   1hr / 6hr / 12hr  → downsample: 60   (1-minute buckets)
//   24hr              → downsample: 300  (5-minute buckets)
//   1wk               → downsample: 1800 (30-minute buckets)
//   30day             → downsample: 3600 (1-hour buckets)
//   6mon              → downsample: 21600 (6-hour buckets)
//   1yr               → downsample: 43200 (12-hour buckets)
// ---------------------------------------------------------------------------

describe("getYAxisLabel", () => {
  describe("1-minute bucket periods (1hr, 6hr, 12hr)", () => {
    it('returns "Messages / min" for 1hr', () => {
      expect(getYAxisLabel("1hr")).toBe("Messages / min");
    });

    it('returns "Messages / min" for 6hr', () => {
      expect(getYAxisLabel("6hr")).toBe("Messages / min");
    });

    it('returns "Messages / min" for 12hr', () => {
      expect(getYAxisLabel("12hr")).toBe("Messages / min");
    });
  });

  describe("5-minute bucket period (24hr)", () => {
    it('returns "Messages / 5 min" for 24hr', () => {
      expect(getYAxisLabel("24hr")).toBe("Messages / 5 min");
    });
  });

  describe("30-minute bucket period (1wk)", () => {
    it('returns "Messages / 30 min" for 1wk', () => {
      expect(getYAxisLabel("1wk")).toBe("Messages / 30 min");
    });
  });

  describe("1-hour bucket period (30day)", () => {
    it('returns "Messages / hr" for 30day', () => {
      expect(getYAxisLabel("30day")).toBe("Messages / hr");
    });
  });

  describe("6-hour bucket period (6mon)", () => {
    it('returns "Messages / 6 hr" for 6mon', () => {
      expect(getYAxisLabel("6mon")).toBe("Messages / 6 hr");
    });
  });

  describe("12-hour bucket period (1yr)", () => {
    it('returns "Messages / 12 hr" for 1yr', () => {
      expect(getYAxisLabel("1yr")).toBe("Messages / 12 hr");
    });
  });

  describe("regression: all defined TimePeriod values produce a non-empty label", () => {
    const allPeriods: TimePeriod[] = [
      "1hr",
      "6hr",
      "12hr",
      "24hr",
      "1wk",
      "30day",
      "6mon",
      "1yr",
    ];

    for (const period of allPeriods) {
      it(`produces a non-empty label for "${period}"`, () => {
        const label = getYAxisLabel(period);
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      });
    }
  });

  describe("regression: 1hr/6hr/12hr all share the same label (same bucket size)", () => {
    it("1hr and 6hr have identical labels", () => {
      expect(getYAxisLabel("1hr")).toBe(getYAxisLabel("6hr"));
    });

    it("6hr and 12hr have identical labels", () => {
      expect(getYAxisLabel("6hr")).toBe(getYAxisLabel("12hr"));
    });
  });

  describe("regression: 24hr differs from 12hr (different bucket sizes)", () => {
    it("24hr label is different from 12hr label", () => {
      expect(getYAxisLabel("24hr")).not.toBe(getYAxisLabel("12hr"));
    });
  });

  describe("regression: long periods each have a unique label", () => {
    it("30day, 6mon, and 1yr all have distinct labels", () => {
      const labels = [
        getYAxisLabel("30day"),
        getYAxisLabel("6mon"),
        getYAxisLabel("1yr"),
      ];
      const unique = new Set(labels);
      expect(unique.size).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// TimeSeriesChart — integration: Y-axis title passed to chart options
// ---------------------------------------------------------------------------

describe("TimeSeriesChart Y-axis title", () => {
  const periods: Array<{ period: TimePeriod; expectedLabel: string }> = [
    { period: "1hr", expectedLabel: "Messages / min" },
    { period: "6hr", expectedLabel: "Messages / min" },
    { period: "12hr", expectedLabel: "Messages / min" },
    { period: "24hr", expectedLabel: "Messages / 5 min" },
    { period: "1wk", expectedLabel: "Messages / 30 min" },
    { period: "30day", expectedLabel: "Messages / hr" },
    { period: "6mon", expectedLabel: "Messages / 6 hr" },
    { period: "1yr", expectedLabel: "Messages / 12 hr" },
  ];

  for (const { period, expectedLabel } of periods) {
    it(`passes y-axis title "${expectedLabel}" to chart options for period "${period}"`, () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod={period}
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.y?.title?.display).toBe(true);
      expect(getCapturedOptions()?.scales?.y?.title?.text).toBe(expectedLabel);
    });
  }

  it("renders the chart (not an error or loading state) when data is provided", () => {
    render(
      <TimeSeriesChart
        data={SAMPLE_DATA}
        timePeriod="1hr"
        decoderType="combined"
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByTestId("line-chart")).toBeTruthy();
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it("renders the loading state and does not pass options to chart when loading=true", () => {
    _capturedOptions = null;

    render(
      <TimeSeriesChart
        data={[]}
        timePeriod="1hr"
        decoderType="combined"
        loading={true}
        error={null}
      />,
    );

    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(getCapturedOptions()).toBeNull();
  });

  it("renders the error state and does not pass options to chart when error is set", () => {
    _capturedOptions = null;

    render(
      <TimeSeriesChart
        data={SAMPLE_DATA}
        timePeriod="1hr"
        decoderType="combined"
        loading={false}
        error="Something went wrong"
      />,
    );

    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(getCapturedOptions()).toBeNull();
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // getMaxSpanMs — unit tests
  // ---------------------------------------------------------------------------

  describe("getMaxSpanMs", () => {
    describe("each period returns a value greater than the nominal span", () => {
      const cases: Array<{ period: TimePeriod; nominalMs: number }> = [
        { period: "1hr", nominalMs: 3600 * 1000 },
        { period: "6hr", nominalMs: 21600 * 1000 },
        { period: "12hr", nominalMs: 43200 * 1000 },
        { period: "24hr", nominalMs: 86400 * 1000 },
        { period: "1wk", nominalMs: 604800 * 1000 },
        { period: "30day", nominalMs: 2592000 * 1000 },
        { period: "6mon", nominalMs: 15768000 * 1000 },
        { period: "1yr", nominalMs: 31536000 * 1000 },
      ];

      for (const { period, nominalMs } of cases) {
        it(`getMaxSpanMs("${period}") > nominal span`, () => {
          expect(getMaxSpanMs(period)).toBeGreaterThan(nominalMs);
        });
      }
    });

    describe("a 1-year span is rejected for short periods (stale-range guard)", () => {
      const shortPeriods: TimePeriod[] = ["1hr", "6hr", "12hr", "24hr"];

      for (const period of shortPeriods) {
        it(`rejects a 1-year span for "${period}"`, () => {
          expect(ONE_YEAR_MS).toBeGreaterThan(getMaxSpanMs(period));
        });
      }
    });

    describe("a 1-year span is accepted for the 1yr period itself", () => {
      it("ONE_YEAR_MS <= getMaxSpanMs(1yr)", () => {
        expect(ONE_YEAR_MS).toBeLessThanOrEqual(getMaxSpanMs("1yr"));
      });
    });
  });

  // ---------------------------------------------------------------------------
  // TimeSeriesChart — stale timeRange guard
  //
  // Regression tests for the Chart.js crash:
  //   "X and Y are too far apart with stepSize of 1 minute"
  //
  // Root cause (two paths, same crash):
  //
  // Path A — stale timeRange as min/max:
  //   When switching from "1yr" to "6hr", Chart.js gets unit="minute" with
  //   min/max spanning a year → ~525,000 ticks → crash.
  //   Fix: getMaxSpanMs guard discards incompatible timeRange in options useMemo.
  //
  // Path B — stale data auto-scales x-axis:
  //   Even after removing min/max, if the data array still contains timestamps
  //   spanning a year, Chart.js auto-scales its x-axis to fit the data and
  //   crashes identically.  The hook's useEffect clears stale data, but it
  //   runs after Chart.js's useEffect (child effects before parent effects).
  //   Fix: dataSpanOk guard blocks <Line> from rendering when data timestamps
  //   span more than getMaxSpanMs(timePeriod), showing loading state instead.
  // ---------------------------------------------------------------------------

  describe("TimeSeriesChart stale-timeRange guard", () => {
    const now = Date.now();
    const yearStart = now - ONE_YEAR_MS;

    it("regression: does NOT pass min/max to Chart.js when timeRange spans 1 year but period is '6hr'", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="6hr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={{ start: yearStart, end: now }}
        />,
      );

      // The chart must render (data is provided, no loading/error)
      expect(screen.getByTestId("line-chart")).toBeTruthy();

      // min/max must NOT have been set — applying a 1-year range to a
      // minute-resolution axis would crash Chart.js
      expect(getCapturedOptions()?.scales?.x?.min).toBeUndefined();
      expect(getCapturedOptions()?.scales?.x?.max).toBeUndefined();
    });

    it("regression: does NOT pass min/max when timeRange spans 1 year but period is '1hr'", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="1hr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={{ start: yearStart, end: now }}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.x?.min).toBeUndefined();
      expect(getCapturedOptions()?.scales?.x?.max).toBeUndefined();
    });

    it("regression: does NOT pass min/max when timeRange spans 1 year but period is '12hr'", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="12hr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={{ start: yearStart, end: now }}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.x?.min).toBeUndefined();
      expect(getCapturedOptions()?.scales?.x?.max).toBeUndefined();
    });

    it("passes min/max when timeRange is compatible with the current period", () => {
      _capturedOptions = null;

      const start1hr = now - 3_600_000;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="1hr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={{ start: start1hr, end: now }}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.x?.min).toBe(start1hr);
      expect(getCapturedOptions()?.scales?.x?.max).toBe(now);
    });

    it("passes min/max for a 1yr range when period is '1yr'", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="1yr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={{ start: yearStart, end: now }}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.x?.min).toBe(yearStart);
      expect(getCapturedOptions()?.scales?.x?.max).toBe(now);
    });

    it("does not pass min/max when timeRange is null", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={SAMPLE_DATA}
          timePeriod="1hr"
          decoderType="combined"
          loading={false}
          error={null}
          timeRange={null}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
      expect(getCapturedOptions()?.scales?.x?.min).toBeUndefined();
      expect(getCapturedOptions()?.scales?.x?.max).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TimeSeriesChart — stale data guard (dataSpanOk)
  //
  // Regression tests for Path B of the Chart.js crash described above.
  // When the data array's timestamp span exceeds getMaxSpanMs(timePeriod),
  // the component must show a loading state instead of rendering <Line>.
  // ---------------------------------------------------------------------------

  describe("TimeSeriesChart stale-data guard (dataSpanOk)", () => {
    const now = Date.now();

    it("regression: shows loading state (not chart) when data timestamps span 1 year but period is '6hr'", () => {
      _capturedOptions = null;

      const yearOldData = [
        makeDataPoint(now - ONE_YEAR_MS),
        makeDataPoint(now - ONE_YEAR_MS + 60_000),
        makeDataPoint(now - 60_000),
      ];

      render(
        <TimeSeriesChart
          data={yearOldData}
          timePeriod="6hr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      // <Line> must NOT have been rendered — dataSpanOk guard blocked it
      expect(screen.queryByTestId("line-chart")).toBeNull();
      expect(getCapturedOptions()).toBeNull();

      // Loading text is shown instead of crashing
      expect(screen.getByText(/loading chart data/i)).toBeTruthy();
    });

    it("regression: shows loading state when data timestamps span 1 year but period is '1hr'", () => {
      _capturedOptions = null;

      const staleData = [makeDataPoint(now - ONE_YEAR_MS), makeDataPoint(now)];

      render(
        <TimeSeriesChart
          data={staleData}
          timePeriod="1hr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      expect(screen.queryByTestId("line-chart")).toBeNull();
      expect(screen.getByText(/loading chart data/i)).toBeTruthy();
    });

    it("regression: shows loading state when data timestamps span 1 year but period is '12hr'", () => {
      _capturedOptions = null;

      const staleData = [makeDataPoint(now - ONE_YEAR_MS), makeDataPoint(now)];

      render(
        <TimeSeriesChart
          data={staleData}
          timePeriod="12hr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      expect(screen.queryByTestId("line-chart")).toBeNull();
      expect(screen.getByText(/loading chart data/i)).toBeTruthy();
    });

    it("renders the chart when data timestamps are within the expected span for '6hr'", () => {
      _capturedOptions = null;

      // All timestamps within the last 6 hours — compatible data
      const compatibleData = [
        makeDataPoint(now - 5_400_000), // 90 min ago
        makeDataPoint(now - 3_600_000), // 60 min ago
        makeDataPoint(now - 60_000), // 1 min ago
      ];

      render(
        <TimeSeriesChart
          data={compatibleData}
          timePeriod="6hr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
    });

    it("renders the chart when data timestamps span 1 year and period is '1yr'", () => {
      _capturedOptions = null;

      // 1yr data is valid for the 1yr period
      const yearData = [
        makeDataPoint(now - ONE_YEAR_MS + 60_000),
        makeDataPoint(now - ONE_YEAR_MS / 2),
        makeDataPoint(now - 60_000),
      ];

      render(
        <TimeSeriesChart
          data={yearData}
          timePeriod="1yr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeTruthy();
    });

    it("renders the chart when only one data point is present (single-point span is always zero)", () => {
      _capturedOptions = null;

      render(
        <TimeSeriesChart
          data={[makeDataPoint(now - ONE_YEAR_MS)]}
          timePeriod="6hr"
          decoderType="combined"
          loading={false}
          error={null}
        />,
      );

      // Single data point: data.length < 2 → dataSpanOk is always true (span = 0).
      // data.length === 1 is non-zero so the "no data" guard does NOT fire.
      // The chart renders rather than showing a loading/empty state.
      expect(screen.getByTestId("line-chart")).toBeTruthy();
    });
  });
});

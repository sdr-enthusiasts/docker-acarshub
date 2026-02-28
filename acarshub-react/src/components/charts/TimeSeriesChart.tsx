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

import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type {
  RRDDataPoint,
  RRDTimeRange,
  TimePeriod,
} from "../../hooks/useRRDTimeSeriesData";
import { useSettingsStore } from "../../store/useSettingsStore";
import { ChartContainer } from "./ChartContainer";

// Register Chart.js components (but not datalabels for time-series)
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

/**
 * Decoder type for filtering time-series data
 */
export type DecoderType =
  | "combined"
  | "acars"
  | "vdlm"
  | "hfdl"
  | "imsl"
  | "irdm"
  | "error";

interface TimeSeriesChartProps {
  /** Time-series data points */
  data: RRDDataPoint[];
  /** Time period being displayed */
  timePeriod: TimePeriod;
  /** Which decoder(s) to display */
  decoderType: DecoderType;
  /** Whether data is loading */
  loading?: boolean;
  /** Error message if any */
  error?: string | null;
  /**
   * Requested time range in milliseconds.  When provided the x-axis is pinned
   * to exactly this range so the chart never shows data outside it and always
   * spans the full requested window (even if some buckets are all-zero).
   */
  timeRange?: RRDTimeRange | null;
}

/**
 * TimeSeriesChart Component
 * Displays RRD time-series data using Chart.js line charts
 *
 * Features:
 * - Time-based X-axis with automatic formatting
 * - Multiple decoder lines with Catppuccin colors
 * - Interactive tooltips and legends
 * - Responsive design
 * - Theme-aware (Mocha/Latte)
 */
export const TimeSeriesChart = ({
  data,
  timePeriod,
  decoderType,
  loading = false,
  error = null,
  timeRange = null,
}: TimeSeriesChartProps) => {
  const theme = useSettingsStore((state) => state.settings.appearance.theme);
  const isDark = theme === "mocha";

  // Catppuccin color mappings for each decoder - memoized to prevent recreation
  const decoderColors = useMemo(
    () => ({
      acars: isDark ? "#89b4fa" : "#1e66f5", // Blue
      vdlm: isDark ? "#a6e3a1" : "#40a02b", // Green
      hfdl: isDark ? "#f9e2af" : "#df8e1d", // Yellow
      imsl: isDark ? "#f5c2e7" : "#ea76cb", // Pink
      irdm: isDark ? "#94e2d5" : "#179299", // Teal
      total: isDark ? "#cba6f7" : "#8839ef", // Mauve
      error: isDark ? "#f38ba8" : "#d20f39", // Red
    }),
    [isDark],
  );

  // Get current theme colors from CSS variables - read fresh on every render
  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue("--color-text").trim();
  const gridColor = styles.getPropertyValue("--color-surface2").trim();
  const backgroundColor = isDark ? "#1e1e2e" : "#eff1f5";

  // Determine which datasets to show based on decoder type - memoized
  const chartData = useMemo(() => {
    const baseDataset = {
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.1,
      spanGaps: false, // Don't connect gaps - show breaks in data
    };

    // Process data to insert null values for large gaps
    // This prevents connecting long periods of no data with a line
    const processDataWithGaps = (
      dataPoints: Array<{ x: number; y: number }>,
    ): Array<{ x: number; y: number | null }> => {
      if (dataPoints.length === 0) return [];

      const processed: Array<{ x: number; y: number | null }> = [];
      const maxGapMs = getMaxGapDuration(timePeriod);

      for (let i = 0; i < dataPoints.length; i++) {
        const current = dataPoints[i];
        const previous = i > 0 ? dataPoints[i - 1] : null;

        // Check if there's a large time gap between points
        if (previous && current.x - previous.x > maxGapMs) {
          // Insert a null point just after the previous point to break the line
          processed.push({ x: previous.x + 1000, y: null });
        }

        processed.push(current);
      }

      return processed;
    };

    let datasets: Array<{
      label: string;
      data: Array<{ x: number; y: number | null }>;
      borderColor: string;
      backgroundColor: string;
      borderWidth: number;
      pointRadius: number;
      pointHoverRadius: number;
      tension: number;
      spanGaps: boolean;
    }> = [];

    if (decoderType === "combined") {
      // Show all decoders plus total on combined view
      datasets = [
        {
          ...baseDataset,
          label: "ACARS",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.acars })),
          ),
          borderColor: decoderColors.acars,
          backgroundColor: `${decoderColors.acars}33`,
        },
        {
          ...baseDataset,
          label: "VDLM",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.vdlm })),
          ),
          borderColor: decoderColors.vdlm,
          backgroundColor: `${decoderColors.vdlm}33`,
        },
        {
          ...baseDataset,
          label: "HFDL",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.hfdl })),
          ),
          borderColor: decoderColors.hfdl,
          backgroundColor: `${decoderColors.hfdl}33`,
        },
        {
          ...baseDataset,
          label: "IMSL",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.imsl })),
          ),
          borderColor: decoderColors.imsl,
          backgroundColor: `${decoderColors.imsl}33`,
        },
        {
          ...baseDataset,
          label: "IRDM",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.irdm })),
          ),
          borderColor: decoderColors.irdm,
          backgroundColor: `${decoderColors.irdm}33`,
        },
        {
          ...baseDataset,
          label: "Total",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.total })),
          ),
          borderColor: decoderColors.total,
          backgroundColor: `${decoderColors.total}33`,
          borderWidth: 3, // Thicker line for total
        },
      ];
    } else if (decoderType === "error") {
      datasets = [
        {
          ...baseDataset,
          label: "Error Messages",
          data: processDataWithGaps(
            data.map((d) => ({ x: d.timestamp, y: d.error })),
          ),
          borderColor: decoderColors.error,
          backgroundColor: `${decoderColors.error}33`,
        },
      ];
    } else {
      // Single decoder view
      const decoderKey = decoderType;
      datasets = [
        {
          ...baseDataset,
          label: `${decoderType.toUpperCase()} Messages`,
          data: processDataWithGaps(
            data.map((d) => ({
              x: d.timestamp,
              y: d[decoderKey as keyof RRDDataPoint] as number,
            })),
          ),
          borderColor: decoderColors[decoderKey as keyof typeof decoderColors],
          backgroundColor: `${decoderColors[decoderKey as keyof typeof decoderColors]}33`,
        },
      ];
    }

    return { datasets };
  }, [data, decoderType, decoderColors, timePeriod]);

  // Chart.js options - memoized with stable dependencies
  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0, // Disable animations to prevent layout shifts
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        datalabels: {
          display: false, // Disable datalabels for time-series charts
        },
        legend: {
          display: true,
          position: "top",
          labels: {
            color: textColor,
            usePointStyle: true,
            padding: 15,
          },
        },
        tooltip: {
          position: "nearest",
          backgroundColor: backgroundColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || "";
              const value =
                context.parsed.y !== null ? context.parsed.y.toFixed(0) : "0";
              return `${label}: ${value} messages`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          // Pin the x-axis to the exact requested range when provided, but
          // only if the span is compatible with the current period's time unit.
          //
          // WHY: When the user switches time periods (e.g. "1yr" → "6hr"),
          // React renders TimeSeriesChart with the new timePeriod prop (and
          // thus unit: "minute") BEFORE the hook's useEffect has a chance to
          // clear the stale timeRange from the previous period.  Chart.js's
          // own useEffect fires in the same passive-effects flush but earlier
          // (child before parent), so it sees unit="minute" + a 1-year span
          // and throws: "X and Y are too far apart with stepSize of 1 minute".
          //
          // The guard below discards any timeRange whose span exceeds the
          // maximum expected span for the current period (with 2× tolerance
          // to absorb minor clock skew).  This runs at render time so it
          // prevents the incompatible options from ever reaching Chart.js.
          ...(timeRange &&
          timeRange.end - timeRange.start <= getMaxSpanMs(timePeriod)
            ? { min: timeRange.start, max: timeRange.end }
            : {}),
          time: {
            unit: getTimeUnit(timePeriod),
            displayFormats: {
              minute: "HH:mm",
              hour: "HH:mm",
              day: "MMM dd",
              week: "MMM dd",
              month: "MMM yyyy",
            },
          },
          grid: {
            color: gridColor,
          },
          border: {
            display: false,
          },
          ticks: {
            color: textColor,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: getYAxisLabel(timePeriod),
            color: textColor,
            font: {
              size: 11,
            },
          },
          grid: {
            color: gridColor,
          },
          border: {
            display: false,
          },
          ticks: {
            color: textColor,
            precision: 0,
          },
        },
      },
    }),
    [timePeriod, textColor, gridColor, backgroundColor, timeRange],
  );

  if (error) {
    return (
      <ChartContainer>
        <div className="chart__error">
          <p>Error loading data: {error}</p>
        </div>
      </ChartContainer>
    );
  }

  // Guard: if the data timestamps span more than the maximum acceptable range
  // for the current period, the data is stale from a previous period and has
  // not yet been cleared by the hook's useEffect.  Rendering <Line> with
  // unit="minute" and year-spanning data timestamps causes Chart.js to
  // auto-scale the x-axis to a year and crash:
  //   "X and Y are too far apart with stepSize of 1 minute"
  // Showing the loading state instead is safe — the hook will deliver
  // correctly-ranged data on the very next render cycle.
  const dataSpanOk =
    data.length < 2 ||
    data[data.length - 1].timestamp - data[0].timestamp <=
      getMaxSpanMs(timePeriod);

  if (loading || data.length === 0 || !dataSpanOk) {
    return (
      <ChartContainer>
        <div className="chart__loading">
          <p>
            {loading || !dataSpanOk
              ? "Loading chart data..."
              : "No data available"}
          </p>
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer>
      <div key="timeseries-chart-wrapper" className="chart__canvas-wrapper">
        <Line
          key={`timeseries-${theme}`}
          data={chartData}
          options={options}
          redraw={false}
        />
      </div>
    </ChartContainer>
  );
};

/**
 * Determine appropriate time unit for Chart.js based on time period
 */
function getTimeUnit(
  timePeriod: TimePeriod,
): "minute" | "hour" | "day" | "week" | "month" {
  switch (timePeriod) {
    case "1hr":
    case "6hr":
      return "minute";
    case "12hr":
    case "24hr":
      return "hour";
    case "1wk":
      return "day";
    case "30day":
      return "week";
    case "6mon":
    case "1yr":
      return "month";
    default:
      return "hour";
  }
}

/**
 * Return the maximum acceptable time-range span in milliseconds for a given
 * period.  Uses 2× the nominal span as a generous upper bound to tolerate
 * minor clock skew, while still reliably catching a stale range from a
 * completely different period (e.g. a 1-year range appearing when the period
 * is now "1hr").
 */
export function getMaxSpanMs(timePeriod: TimePeriod): number {
  switch (timePeriod) {
    case "1hr":
      return 2 * 3600 * 1000; // 2 hours
    case "6hr":
      return 2 * 21600 * 1000; // 12 hours
    case "12hr":
      return 2 * 43200 * 1000; // 24 hours
    case "24hr":
      return 2 * 86400 * 1000; // 48 hours
    case "1wk":
      return 2 * 604800 * 1000; // 2 weeks
    case "30day":
      return 2 * 2592000 * 1000; // 60 days
    case "6mon":
      return 2 * 15768000 * 1000; // ~12 months
    case "1yr":
      return 2 * 31536000 * 1000; // 2 years
    default:
      return 2 * 86400 * 1000; // 48 hours fallback
  }
}

/**
 * Return a human-readable Y-axis label that reflects the bucket size for each
 * time period.  Each label describes what a single data point represents so
 * the reader immediately understands the unit of the plotted values.
 *
 * Bucket sizes come from the backend periodMap in handlers.ts:
 *   1hr / 6hr / 12hr  →  downsample: 60   (1-minute buckets)
 *   24hr              →  downsample: 300  (5-minute buckets)
 *   1wk               →  downsample: 1800 (30-minute buckets)
 *   30day             →  downsample: 3600 (1-hour buckets)
 *   6mon              →  downsample: 21600 (6-hour buckets)
 *   1yr               →  downsample: 43200 (12-hour buckets)
 */
export function getYAxisLabel(timePeriod: TimePeriod): string {
  switch (timePeriod) {
    case "1hr":
    case "6hr":
    case "12hr":
      return "Messages / min";
    case "24hr":
      return "Messages / 5 min";
    case "1wk":
      return "Messages / 30 min";
    case "30day":
      return "Messages / hr";
    case "6mon":
      return "Messages / 6 hr";
    case "1yr":
      return "Messages / 12 hr";
    default:
      return "Messages";
  }
}

/**
 * Get the maximum acceptable gap duration for a time period
 * Gaps larger than this will show as breaks in the chart line
 *
 * @param timePeriod - The time period being displayed
 * @returns Maximum gap duration in milliseconds
 */
function getMaxGapDuration(timePeriod: TimePeriod): number {
  // Allow gaps up to 2x the expected data point interval
  // RRD typically has regular intervals based on consolidation
  switch (timePeriod) {
    case "1hr":
    case "6hr":
      return 5 * 60 * 1000; // 5 minutes for short periods
    case "12hr":
    case "24hr":
      return 10 * 60 * 1000; // 10 minutes for daily views
    case "1wk":
      return 30 * 60 * 1000; // 30 minutes for weekly
    case "30day":
      return 2 * 60 * 60 * 1000; // 2 hours for monthly
    case "6mon":
    case "1yr":
      return 24 * 60 * 60 * 1000; // 1 day for long periods
    default:
      return 10 * 60 * 1000; // 10 minutes default
  }
}

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
import { useEffect, useMemo } from "react";
import { Line } from "react-chartjs-2";
import type {
  RRDDataPoint,
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
}: TimeSeriesChartProps) => {
  // Diagnostic logging to detect mount/unmount cycles
  useEffect(() => {
    console.log(`[TimeSeriesChart] ${timePeriod} - ${decoderType} MOUNTED`);
    return () => {
      console.log(`[TimeSeriesChart] ${timePeriod} - ${decoderType} UNMOUNTED`);
    };
  }, [timePeriod, decoderType]);

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
    [timePeriod, textColor, gridColor, backgroundColor],
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

  if (loading || data.length === 0) {
    return (
      <ChartContainer>
        <div className="chart__loading">
          <p>{loading ? "Loading chart data..." : "No data available"}</p>
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

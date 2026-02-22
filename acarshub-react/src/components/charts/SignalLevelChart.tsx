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
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type TooltipItem,
} from "chart.js";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SignalLevelData } from "../../types";
import { ChartContainer } from "./ChartContainer";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

/**
 * SignalLevelChart Component Props
 */
interface SignalLevelChartProps {
  /** Signal level data from backend (per-decoder format) */
  signalData: SignalLevelData | null;
  /** Optional CSS class name */
  className?: string;
}

/**
 * SignalLevelChart Component
 * Displays received signal levels as a line chart with per-decoder datasets
 *
 * Features:
 * - Multi-line chart showing signal level distribution per decoder
 * - Filters out whole numbers to avoid spikes from legacy data
 * - Catppuccin themed with consistent decoder colors
 * - Responsive design
 *
 * Note: The float check is a legacy workaround. Old acarsdec stored whole numbers
 * differently than floats, causing spikes in the graph. This filter smooths the data.
 */
export const SignalLevelChart = ({
  signalData,
  className = "",
}: SignalLevelChartProps) => {
  const theme = useSettingsStore((state) => state.settings.appearance.theme);
  const isDark = theme === "mocha";

  // Process signal data and prepare for chart
  const chartData = useMemo(() => {
    if (!signalData || Object.keys(signalData).length === 0) {
      return null;
    }

    // Decoder color palette (consistent with other charts)
    const decoderColors: Record<string, { border: string; bg: string }> = {
      ACARS: {
        border: isDark ? "rgb(137, 180, 250)" : "rgb(30, 102, 245)", // Blue
        bg: isDark ? "rgba(137, 180, 250, 0.1)" : "rgba(30, 102, 245, 0.1)",
      },
      "VDL-M2": {
        border: isDark ? "rgb(166, 227, 161)" : "rgb(64, 160, 43)", // Green
        bg: isDark ? "rgba(166, 227, 161, 0.1)" : "rgba(64, 160, 43, 0.1)",
      },
      HFDL: {
        border: isDark ? "rgb(245, 194, 231)" : "rgb(234, 118, 203)", // Pink
        bg: isDark ? "rgba(245, 194, 231, 0.1)" : "rgba(234, 118, 203, 0.1)",
      },
      IMSL: {
        border: isDark ? "rgb(249, 226, 175)" : "rgb(223, 142, 29)", // Yellow
        bg: isDark ? "rgba(249, 226, 175, 0.1)" : "rgba(223, 142, 29, 0.1)",
      },
      IRDM: {
        border: isDark ? "rgb(203, 166, 247)" : "rgb(136, 57, 239)", // Mauve
        bg: isDark ? "rgba(203, 166, 247, 0.1)" : "rgba(136, 57, 239, 0.1)",
      },
    };

    // Collect all unique signal levels across all decoders
    const allLevels = new Set<number>();
    for (const decoder in signalData) {
      const decoderData = signalData[decoder];
      if (Array.isArray(decoderData)) {
        for (const item of decoderData) {
          const level = item.level;
          // Only include float values (skip whole numbers to avoid legacy artifacts)
          if (Number(level) === level && level % 1 !== 0) {
            allLevels.add(level);
          }
        }
      }
    }

    // Return null if no valid data after filtering
    if (allLevels.size === 0) {
      return null;
    }

    // Sort levels for x-axis
    const sortedLevels = Array.from(allLevels).sort((a, b) => a - b);
    const labels = sortedLevels.map((level) => level.toFixed(1));

    // Build datasets for each decoder
    const datasets = [];
    for (const decoder in signalData) {
      const decoderData = signalData[decoder];
      if (!Array.isArray(decoderData) || decoderData.length === 0) {
        continue;
      }

      // Create a map of level -> count for this decoder
      const levelMap = new Map<number, number>();
      for (const item of decoderData) {
        const level = item.level;
        const count = item.count;
        // Only include float values (skip null)
        if (
          level !== null &&
          count !== null &&
          Number(level) === level &&
          level % 1 !== 0
        ) {
          levelMap.set(level, count);
        }
      }

      // Map sorted levels to counts (0 if level not present for this decoder)
      const data = sortedLevels.map((level) => levelMap.get(level) || 0);

      // Get colors for this decoder (fallback to blue if unknown)
      const colors = decoderColors[decoder] || decoderColors.ACARS;

      datasets.push({
        label: decoder,
        data,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2, // Slight curve for smoother line
        fill: true,
      });
    }

    return {
      labels,
      datasets,
    };
  }, [signalData, isDark]);

  // Chart options with Catppuccin theming - memoized with stable dependencies
  const options: ChartOptions<"line"> = useMemo(() => {
    // Get current theme colors from CSS variables - read fresh when theme changes
    // Explicitly reference theme to trigger re-computation on theme changes
    void theme; // Used to force re-read of CSS variables
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--color-text").trim();
    const gridColor = styles.getPropertyValue("--color-surface2").trim();
    const surface0 = styles.getPropertyValue("--color-surface0").trim();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0, // Disable animations to prevent layout shifts
      },
      plugins: {
        datalabels: {
          display: false, // Disable count labels at each point
        },
        legend: {
          display: true, // Show legend to identify decoders
          position: "top" as const,
          labels: {
            color: textColor,
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          enabled: true,
          position: "nearest" as const, // Position tooltip closer to cursor
          backgroundColor: surface0,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context: TooltipItem<"line">) => {
              const value = context.parsed.y;
              const datasetLabel = context.dataset.label || "";
              return `${datasetLabel}: ${value !== null ? value.toLocaleString() : "N/A"}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: gridColor,
            drawBorder: false,
          },
          ticks: {
            color: textColor,
            maxRotation: 45,
            minRotation: 0,
          },
          title: {
            display: true,
            text: "Signal Level (dB)",
            color: textColor,
            font: {
              size: 12,
              weight: "bold" as const,
            },
          },
        },
        y: {
          grid: {
            color: gridColor,
            drawBorder: false,
          },
          ticks: {
            color: textColor,
            callback: (value: string | number) => {
              // Format large numbers with commas
              return typeof value === "number" ? value.toLocaleString() : value;
            },
          },
          title: {
            display: true,
            text: "Count",
            color: textColor,
            font: {
              size: 12,
              weight: "bold" as const,
            },
          },
        },
      },
      interaction: {
        mode: "nearest" as const,
        intersect: false,
        axis: "x" as const,
      },
    };
  }, [theme]);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer className={className}>
        <div className="chart-no-data">
          <p className="chart-no-data__message">
            No signal level data available
          </p>
          <p className="chart-no-data__hint">
            Data will appear once messages are received
          </p>
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer className={className}>
      <div key="signal-level-chart-wrapper">
        <Line
          key={`signal-level-${theme}`}
          data={chartData}
          options={options}
        />
      </div>
    </ChartContainer>
  );
};

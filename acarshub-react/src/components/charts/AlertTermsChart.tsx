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
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type TooltipItem,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { AlertTerm } from "../../types";
import { ChartContainer } from "./ChartContainer";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels,
);

/**
 * AlertTermsChart Component Props
 */
interface AlertTermsChartProps {
  /** Alert term data from backend */
  alertTermData: AlertTerm | null;
  /** Optional CSS class name */
  className?: string;
}

/**
 * AlertTermsChart Component
 * Displays alert term counts as a horizontal bar chart
 *
 * Features:
 * - Bar chart showing alert term frequency
 * - Data labels showing exact counts
 * - Catppuccin Tol color palette (12 colors)
 * - Responsive design
 * - Mobile-friendly with horizontal bars
 */
export const AlertTermsChart = ({
  alertTermData,
  className = "",
}: AlertTermsChartProps) => {
  const theme = useSettingsStore((state) => state.settings.appearance.theme);
  const isDark = theme === "mocha";

  // Catppuccin color palette - theme-aware
  const chartColors = useMemo(() => {
    if (isDark) {
      // Catppuccin Mocha colors
      return [
        "#89b4fa", // Blue
        "#a6e3a1", // Green
        "#f9e2af", // Yellow
        "#f5c2e7", // Pink
        "#94e2d5", // Teal
        "#fab387", // Peach
        "#cba6f7", // Mauve
        "#f38ba8", // Red
        "#eba0ac", // Maroon
        "#74c7ec", // Sapphire
        "#89dceb", // Sky
        "#b4befe", // Lavender
      ];
    }
    // Catppuccin Latte colors
    return [
      "#1e66f5", // Blue
      "#40a02b", // Green
      "#df8e1d", // Yellow
      "#ea76cb", // Pink
      "#179299", // Teal
      "#fe640b", // Peach
      "#8839ef", // Mauve
      "#d20f39", // Red
      "#e64553", // Maroon
      "#209fb5", // Sapphire
      "#04a5e5", // Sky
      "#7287fd", // Lavender
    ];
  }, [isDark]);

  // Diagnostic logging to detect mount/unmount cycles
  useEffect(() => {
    console.log("[AlertTermsChart] MOUNTED");
    return () => {
      console.log("[AlertTermsChart] UNMOUNTED");
    };
  }, []);

  // Process alert term data and prepare for chart
  const chartData = useMemo(() => {
    if (!alertTermData) {
      return null;
    }

    const labels: string[] = [];
    const data: number[] = [];
    let totalCount = 0;

    // Extract labels and counts from alert term data
    for (const key in alertTermData) {
      const term = alertTermData[key];
      labels.push(term.term);
      data.push(term.count);
      totalCount += term.count;
    }

    // Return null if no data
    if (labels.length === 0) {
      return null;
    }

    return {
      labels,
      datasets: [
        {
          label: "Received Alert Terms",
          data,
          backgroundColor: chartColors,
          borderWidth: 0,
        },
      ],
      totalCount,
    };
  }, [alertTermData, chartColors]);

  // Calculate dynamic height based on number of bars - stabilized to prevent layout shifts
  const chartHeight = useMemo(() => {
    const barCount = chartData?.labels.length || 0;
    const minHeight = 300; // Increased min height for stability
    const maxHeight = 600; // Cap maximum height to prevent huge jumps
    const barHeight = 25; // Space per bar (includes bar + padding)
    const paddingHeight = 150; // Increased padding for labels

    const calculatedHeight = barCount * barHeight + paddingHeight;
    return Math.min(Math.max(minHeight, calculatedHeight), maxHeight);
  }, [chartData?.labels.length]); // Only depend on label count, not entire chartData

  // Get current theme colors from CSS variables - read fresh on every render
  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue("--color-text").trim();
  const gridColor = styles.getPropertyValue("--color-surface2").trim();
  const surface0 = styles.getPropertyValue("--color-surface0").trim();

  // Chart options with Catppuccin theming - memoized with stable dependencies
  const options = useMemo(() => {
    const totalCount = chartData?.totalCount || 1;

    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y" as const, // Horizontal bars
      maxBarThickness: 15, // Limit bar height to 15px
      animation: {
        duration: 0, // Disable animations to prevent layout shifts
      },
      layout: {
        padding: {
          right: 70, // Add padding to prevent label clipping
        },
      },
      plugins: {
        legend: {
          display: false, // Hide legend for cleaner look
        },
        tooltip: {
          enabled: true,
          position: "nearest" as const,
          backgroundColor: surface0,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context: TooltipItem<"bar">) => {
              const count = context.parsed.x;
              if (count === null) return "Count: N/A";
              const percentage = ((count / totalCount) * 100).toFixed(1);
              return `Count: ${count.toLocaleString()} (${percentage}%)`;
            },
          },
        },
        title: {
          display: true,
          text: "Alert Terms Frequency",
          color: textColor,
          font: {
            size: 14,
            weight: "bold" as const,
          },
          padding: {
            top: 0,
            bottom: 10,
          },
        },
        datalabels: {
          backgroundColor: (context: { dataIndex: number }) => {
            // Use same color as bar by accessing from the dataset
            return chartColors[context.dataIndex % chartColors.length];
          },
          borderRadius: 4,
          color: isDark ? "white" : "black",
          clamp: true,
          font: {
            weight: "bold" as const,
            size: 10,
          },
          formatter: (value: number) => {
            return value.toLocaleString();
          },
          align: "start" as const,
          anchor: "end" as const,
          clip: false,
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
            callback: (value: string | number) => {
              // Format large numbers with commas
              return typeof value === "number" ? value.toLocaleString() : value;
            },
          },
          title: {
            display: true,
            text: "Message Count",
            color: textColor,
            font: {
              size: 12,
              weight: "bold" as const,
            },
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: textColor,
            font: {
              size: 11,
            },
          },
        },
      },
    };
  }, [
    chartData?.totalCount,
    chartColors,
    isDark,
    textColor,
    gridColor,
    surface0,
  ]);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer className={className}>
        <div className="chart-no-data">
          <p className="chart-no-data__message">
            No alert terms data available
          </p>
          <p className="chart-no-data__hint">
            Data will appear once alert terms are matched
          </p>
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer className={className}>
      <div
        key="alert-terms-chart-wrapper"
        style={{
          height: `${chartHeight}px`,
          willChange: "contents",
          contain: "layout style",
        }}
      >
        <Bar
          key={`alert-terms-${theme}`}
          data={chartData}
          options={options}
          redraw={false}
        />
      </div>
    </ChartContainer>
  );
};

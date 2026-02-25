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
import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { SignalCountData } from "../../types";
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
 * MessageCountChart Component Props
 */
interface MessageCountChartProps {
  /** Message count data from backend */
  countData: SignalCountData | null;
  /** Whether to show empty messages (true) or data messages (false) */
  showEmptyMessages: boolean;
  /** Optional CSS class name */
  className?: string;
}

/**
 * MessageCountChart Component
 * Displays message count statistics (good vs error) as a horizontal bar chart
 *
 * Features:
 * - Bar chart showing message counts with error breakdown
 * - Separate charts for data messages and empty messages
 * - Data labels showing exact counts
 * - Catppuccin themed (green for good, red for errors)
 * - Responsive design
 */
export const MessageCountChart = ({
  countData,
  showEmptyMessages,
  className = "",
}: MessageCountChartProps) => {
  const theme = useSettingsStore((state) => state.settings.appearance.theme);
  const isDark = theme === "mocha";

  // Process count data and prepare for chart
  const chartData = useMemo(() => {
    if (!countData || !countData.count) {
      return null;
    }

    const count = countData.count;
    let goodCount: number;
    let errorCount: number;
    let totalCount: number;

    if (showEmptyMessages) {
      // Empty messages chart
      goodCount = count.empty_total - count.empty_errors;
      errorCount = count.empty_errors;
      totalCount = count.empty_total;
    } else {
      // Data messages chart
      goodCount = count.non_empty_total - count.non_empty_errors;
      errorCount = count.non_empty_errors;
      totalCount = count.non_empty_total;
    }

    // Return null if no data
    if (totalCount === 0) {
      return null;
    }

    const labels = ["Good Messages", "Errors", "Total"];
    const data = [goodCount, errorCount, totalCount];

    // Theme-aware colors
    const goodColor = isDark ? "rgb(166, 227, 161)" : "rgb(64, 160, 43)"; // Green
    const errorColor = isDark ? "rgb(243, 139, 168)" : "rgb(210, 15, 57)"; // Red
    const totalColor = isDark ? "rgb(137, 180, 250)" : "rgb(30, 102, 245)"; // Blue

    return {
      labels,
      datasets: [
        {
          label: showEmptyMessages
            ? "Empty Message Counts"
            : "Data Message Counts",
          data,
          backgroundColor: [goodColor, errorColor, totalColor],
          borderWidth: 0,
        },
      ],
    };
  }, [countData, showEmptyMessages, isDark]);

  // Chart options with Catppuccin theming - memoized with stable dependencies
  const options = useMemo(() => {
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
      maxBarThickness: 15, // Limit bar width to 15px
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
              const value = context.parsed.x;
              return `Count: ${value !== null ? value.toLocaleString() : "N/A"}`;
            },
          },
        },
        title: {
          display: true,
          text: showEmptyMessages
            ? "Empty Message Statistics"
            : "Data Message Statistics",
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
            // Use same color as bar by accessing the predefined colors
            const colors = [
              "rgb(166, 227, 161)", // Catppuccin Mocha Green (good)
              "rgb(243, 139, 168)", // Catppuccin Mocha Red (errors)
              "rgb(137, 180, 250)", // Catppuccin Mocha Blue (total)
            ];
            return colors[context.dataIndex];
          },
          borderRadius: 4,
          color: "rgba(0, 0, 0, 0.9)",
          font: {
            weight: "bold" as const,
            size: 11,
          },
          align: "end" as const,
          formatter: (value: number) => {
            return value.toLocaleString();
          },
          padding: 6,
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
            text: "Count",
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
              size: 12,
            },
          },
        },
      },
    };
  }, [showEmptyMessages, theme]);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer className={className}>
        <div className="chart-no-data">
          <p className="chart-no-data__message">
            No message count data available
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
      <div
        key={`message-count-chart-wrapper-${showEmptyMessages ? "empty" : "data"}`}
      >
        <Bar
          key={`message-count-${showEmptyMessages ? "empty" : "data"}-${theme}`}
          data={chartData}
          options={options}
        />
      </div>
    </ChartContainer>
  );
};

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
import type { Signal } from "../../types";
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
  /** Signal level data from backend */
  signalData: Signal | null;
  /** Optional CSS class name */
  className?: string;
}

/**
 * SignalLevelChart Component
 * Displays received signal levels as a line chart
 *
 * Features:
 * - Line chart showing signal level distribution
 * - Filters out whole numbers to avoid spikes from legacy data
 * - Catppuccin themed
 * - Responsive design
 *
 * Note: The float check is a legacy workaround. Old acarsdec stored whole numbers
 * differently than floats, causing spikes in the graph. This filter smooths the data.
 */
export const SignalLevelChart = ({
  signalData,
  className = "",
}: SignalLevelChartProps) => {
  // Process signal data and prepare for chart
  const chartData = useMemo(() => {
    if (!signalData) {
      return null;
    }

    const labels: string[] = [];
    const data: number[] = [];

    // Filter and process signal level data
    // Skip whole numbers to avoid legacy database artifacts
    for (const key in signalData) {
      const level = signalData[key].level;
      const count = signalData[key].count;

      // Only include float values (skip whole numbers)
      if (Number(level) === level && level % 1 !== 0) {
        labels.push(level.toFixed(1));
        data.push(count);
      }
    }

    // Return null if no valid data after filtering
    if (labels.length === 0) {
      return null;
    }

    return {
      labels,
      datasets: [
        {
          label: "Received Signal Levels",
          data,
          borderColor: "rgb(166, 227, 161)", // Catppuccin Mocha Green
          backgroundColor: "rgba(166, 227, 161, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.2, // Slight curve for smoother line
          fill: true,
        },
      ],
    };
  }, [signalData]);

  // Chart options with Catppuccin theming
  const options = useMemo(() => {
    // Get current theme colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--color-text").trim();
    const gridColor = styles.getPropertyValue("--color-surface2").trim();

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // Hide legend for cleaner look
        },
        tooltip: {
          enabled: true,
          backgroundColor: styles.getPropertyValue("--color-surface0").trim(),
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context: TooltipItem<"line">) => {
              const value = context.parsed.y;
              return `Count: ${value !== null ? value.toLocaleString() : "N/A"}`;
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
        mode: "index" as const,
        intersect: false,
      },
    };
  }, []);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer
        title="Signal Levels"
        subtitle="Distribution of received signal strengths"
        className={className}
      >
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
    <ChartContainer
      title="Signal Levels"
      subtitle="Distribution of received signal strengths"
      className={className}
    >
      <Line data={chartData} options={options} />
    </ChartContainer>
  );
};

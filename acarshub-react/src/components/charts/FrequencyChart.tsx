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
import type { SignalData } from "../../types";
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
 * FrequencyChart Component Props
 */
interface FrequencyChartProps {
  /** Frequency data for a specific decoder */
  frequencyData: SignalData[];
  /** Decoder type (ACARS, VDLM, HFDL, IMSL, IRDM) */
  decoderType: string;
  /** Optional CSS class name */
  className?: string;
}

/**
 * FrequencyChart Component
 * Displays frequency distribution for a specific decoder type
 *
 * Features:
 * - Horizontal bar chart showing frequency usage
 * - Data labels with counts
 * - Aggregates "Other" category if more than 14 frequencies
 * - Catppuccin Rainbow color palette
 * - Responsive design
 *
 * Note: Limits to top 14 frequencies, aggregates the rest into "Other"
 * to prevent overcrowded charts
 */
// Catppuccin Rainbow color palette (8 colors from legacy palette.js) - defined outside component to prevent recreation
const rainbowColors = [
  "#1B9E77",
  "#D95F02",
  "#7570B3",
  "#E7298A",
  "#66A61E",
  "#E6AB02",
  "#A6761D",
  "#666666",
];

export const FrequencyChart = ({
  frequencyData,
  decoderType,
  className = "",
}: FrequencyChartProps) => {
  // Diagnostic logging to detect mount/unmount cycles
  useEffect(() => {
    console.log(`[FrequencyChart] ${decoderType} MOUNTED`);
    return () => {
      console.log(`[FrequencyChart] ${decoderType} UNMOUNTED`);
    };
  }, [decoderType]);

  // Process frequency data and prepare for chart
  const chartData = useMemo(() => {
    if (!frequencyData || frequencyData.length === 0) {
      return null;
    }

    let labels: string[] = [];
    let data: number[] = [];
    let totalCount = 0;

    // Calculate total count
    for (const item of frequencyData) {
      totalCount += item.count;
    }

    // If we have 15 or fewer frequencies, use them all
    if (frequencyData.length <= 15) {
      labels = frequencyData.map((item) => item.freq);
      data = frequencyData.map((item) => item.count);
    } else {
      // Take top 14 frequencies and aggregate the rest into "Other"
      const topFreqs = frequencyData.slice(0, 14);
      const otherFreqs = frequencyData.slice(14);

      labels = topFreqs.map((item) => item.freq);
      data = topFreqs.map((item) => item.count);

      // Calculate "Other" count
      const otherCount = otherFreqs.reduce((sum, item) => sum + item.count, 0);

      if (otherCount > 0) {
        labels.push("Other");
        data.push(otherCount);
      }
    }

    // Generate colors by cycling through rainbow palette
    const colors = labels.map(
      (_, index) => rainbowColors[index % rainbowColors.length],
    );

    return {
      labels,
      datasets: [
        {
          label: `${decoderType} Frequencies`,
          data,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
      totalCount,
    };
  }, [frequencyData, decoderType]);

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

  // Chart options with Catppuccin theming - memoized with stable dependencies
  const options = useMemo(() => {
    // Get current theme colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--color-text").trim();
    const gridColor = styles.getPropertyValue("--color-surface2").trim();
    const surface0 = styles.getPropertyValue("--color-surface0").trim();
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
          text: `${decoderType} Frequency Distribution`,
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
            return rainbowColors[context.dataIndex % rainbowColors.length];
          },
          borderRadius: 4,
          color: "white",
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
  }, [decoderType, chartData?.totalCount]);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer
        title={`${decoderType} Frequencies`}
        subtitle="Distribution of messages across frequencies"
        className={className}
      >
        <div className="chart-no-data">
          <p className="chart-no-data__message">
            No frequency data available for {decoderType}
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
        key={`freq-chart-wrapper-${decoderType}`}
        style={{
          height: `${chartHeight}px`,
          willChange: "contents",
          contain: "layout style",
        }}
      >
        <Bar data={chartData} options={options} redraw={false} />
      </div>
    </ChartContainer>
  );
};

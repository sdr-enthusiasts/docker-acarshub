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
  // Catppuccin Tol color palette (12 colors from legacy palette.js)
  const tolColors = [
    "#332288",
    "#117733",
    "#44AA99",
    "#88CCEE",
    "#DDCC77",
    "#CC6677",
    "#AA4499",
    "#882255",
    "#661100",
    "#6699CC",
    "#AA4466",
    "#4477AA",
  ];

  // Process alert term data and prepare for chart
  const chartData = useMemo(() => {
    if (!alertTermData) {
      return null;
    }

    const labels: string[] = [];
    const data: number[] = [];

    // Extract labels and counts from alert term data
    for (const key in alertTermData) {
      const term = alertTermData[key];
      labels.push(term.term);
      data.push(term.count);
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
          backgroundColor: tolColors,
          borderWidth: 0,
        },
      ],
    };
  }, [alertTermData]);

  // Chart options with Catppuccin theming
  const options = useMemo(() => {
    // Get current theme colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--color-text").trim();
    const gridColor = styles.getPropertyValue("--color-surface2").trim();

    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y" as const, // Horizontal bars
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
            label: (context: TooltipItem<"bar">) => {
              const value = context.parsed.x;
              return `Count: ${value !== null ? value.toLocaleString() : "N/A"}`;
            },
          },
        },
        datalabels: {
          backgroundColor: (context: { dataIndex: number }) => {
            // Use same color as bar by accessing from the dataset
            const colors = tolColors;
            return colors[context.dataIndex % colors.length];
          },
          borderRadius: 4,
          color: "white",
          font: {
            weight: "bold" as const,
            size: 11,
          },
          formatter: (value: number) => {
            return value.toLocaleString();
          },
          padding: 6,
          align: "end" as const,
          anchor: "end" as const,
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
  }, []);

  // Show empty state if no data
  if (!chartData) {
    return (
      <ChartContainer
        title="Alert Terms"
        subtitle="Frequency of matched alert terms"
        className={className}
      >
        <div className="chart-no-data">
          <p className="chart-no-data__message">No alert term data available</p>
          <p className="chart-no-data__hint">
            Configure alert terms in Settings to track specific messages
          </p>
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title="Alert Terms"
      subtitle="Frequency of matched alert terms"
      className={className}
    >
      <Bar data={chartData} options={options} />
    </ChartContainer>
  );
};

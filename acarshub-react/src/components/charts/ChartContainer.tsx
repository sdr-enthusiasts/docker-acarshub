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

import type { ReactNode } from "react";

/**
 * ChartContainer Component Props
 */
interface ChartContainerProps {
  /** Chart title displayed above the chart */
  title?: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Chart content (canvas element) */
  children: ReactNode;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * ChartContainer Component
 * Wrapper component for charts that provides consistent styling and layout
 *
 * Features:
 * - Responsive container that maintains aspect ratio
 * - Optional title and subtitle
 * - Catppuccin theming integration
 * - Mobile-friendly layout
 *
 * @example
 * ```tsx
 * <ChartContainer title="Signal Levels" subtitle="Last 100 samples">
 *   <Line data={chartData} options={chartOptions} />
 * </ChartContainer>
 * ```
 */
export const ChartContainer = ({
  title,
  subtitle,
  children,
  className = "",
}: ChartContainerProps) => {
  return (
    <div className={`chart-container ${className}`}>
      {(title || subtitle) && (
        <div className="chart-container__header">
          {title && <h3 className="chart-container__title">{title}</h3>}
          {subtitle && <p className="chart-container__subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="chart-container__canvas">{children}</div>
    </div>
  );
};

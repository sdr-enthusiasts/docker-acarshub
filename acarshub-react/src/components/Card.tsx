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

export interface CardProps {
  /**
   * Card title displayed in the header
   */
  title?: string;

  /**
   * Optional subtitle displayed below title
   */
  subtitle?: string;

  /**
   * Card content
   */
  children: ReactNode;

  /**
   * Optional footer content
   */
  footer?: ReactNode;

  /**
   * Visual variant of the card
   * @default 'default'
   */
  variant?: "default" | "info" | "success" | "warning" | "error";

  /**
   * Additional CSS class names
   */
  className?: string;

  /**
   * Whether the card should be padded
   * @default true
   */
  padded?: boolean;

  /**
   * Whether the card should be hoverable (adds hover effect)
   * @default false
   */
  hoverable?: boolean;
}

/**
 * Card Component
 * A flexible container component with optional header, footer, and variant styling
 */
export const Card = ({
  title,
  subtitle,
  children,
  footer,
  variant = "default",
  className = "",
  padded = true,
  hoverable = false,
}: CardProps) => {
  const cardClasses = [
    "card",
    variant !== "default" && `card--${variant}`,
    !padded && "card--no-padding",
    hoverable && "card--hoverable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      {(title || subtitle) && (
        <div className="card__header">
          {title && <h3 className="card__title">{title}</h3>}
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="card__content">{children}</div>
      {footer && <div className="card__footer">{footer}</div>}
    </div>
  );
};

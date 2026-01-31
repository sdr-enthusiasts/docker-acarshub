/* Copyright (C) 2022-2026 Frederick Clausen II
 * This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
 *
 * acarshub is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * acarshub is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with acarshub.  If not, see <http://www.gnu.org/licenses/>.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button Component Props
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant style */
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning"
    | "info"
    | "ghost"
    | "outline-primary"
    | "outline-secondary"
    | "outline-success"
    | "outline-danger"
    | "outline-warning"
    | "outline-info";

  /** Button size */
  size?: "sm" | "md" | "lg";

  /** Whether button is in loading state */
  loading?: boolean;

  /** Whether button should be full width */
  block?: boolean;

  /** Whether button is icon-only (square) */
  iconOnly?: boolean;

  /** Button content */
  children: ReactNode;
}

/**
 * Button Component
 *
 * Reusable button component with Catppuccin theming
 * Supports multiple variants, sizes, and states
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="lg">Click me</Button>
 * <Button variant="outline-danger" disabled>Disabled</Button>
 * <Button variant="success" loading>Saving...</Button>
 * ```
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  iconOnly = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    loading && "btn--loading",
    block && "btn--block",
    iconOnly && "btn--icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
}

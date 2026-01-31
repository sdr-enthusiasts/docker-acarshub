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

import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { Button } from "./Button";

/**
 * Theme type definition
 */
export type Theme = "dark" | "light";

/**
 * ThemeSwitcher Component Props
 */
export interface ThemeSwitcherProps {
  /** Optional class name */
  className?: string;
}

/**
 * ThemeSwitcher Component
 *
 * Toggles between Catppuccin Mocha (dark) and Latte (light) themes
 * Persists theme preference to localStorage
 *
 * @example
 * ```tsx
 * <ThemeSwitcher />
 * ```
 */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Try to load theme from localStorage
    const savedTheme = localStorage.getItem("theme") as Theme | null;

    // If no saved theme, check system preference
    if (!savedTheme) {
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }

    return savedTheme;
  });

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }

    // Save to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  return (
    <Button
      variant="ghost"
      iconOnly
      onClick={toggleTheme}
      className={className}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
    </Button>
  );
}

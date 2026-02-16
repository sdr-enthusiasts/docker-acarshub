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

import { faLightbulb } from "@fortawesome/free-solid-svg-icons/faLightbulb";
import { faMoon } from "@fortawesome/free-solid-svg-icons/faMoon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { useSettingsStore, useTheme } from "../store/useSettingsStore";
import type { Theme } from "../types";
import { Button } from "./Button";

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
 * Persists theme preference to settings store (which uses localStorage)
 * Now integrated with the global settings system
 *
 * @example
 * ```tsx
 * <ThemeSwitcher />
 * ```
 */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const theme = useTheme();
  const setTheme = useSettingsStore((state) => state.setTheme);

  // Apply theme to document root whenever it changes
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "latte") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === "mocha" ? "latte" : "mocha";
    setTheme(newTheme);
  };

  const isDark = theme === "mocha";

  return (
    <Button
      variant="ghost"
      iconOnly
      onClick={toggleTheme}
      className={className}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
    >
      <FontAwesomeIcon icon={isDark ? faLightbulb : faMoon} />
    </Button>
  );
}

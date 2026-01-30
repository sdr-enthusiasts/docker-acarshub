// Copyright (C) 2022-2024 Frederick Clausen II
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

import Cookies from "js-cookie";

type Theme = "light" | "dark";

class ThemeManager {
  #currentTheme: Theme = "light";
  readonly #COOKIE_NAME = "acarshub_theme_preference";
  readonly #COOKIE_EXPIRY_DAYS = 365;

  constructor() {
    this.initializeTheme();
  }

  /**
   * Initialize theme on page load
   * Priority: 1) Cookie preference, 2) System preference, 3) Light mode default
   */
  private initializeTheme(): void {
    const cookieTheme = this.getThemeFromCookie();

    if (cookieTheme) {
      // User has manually set a preference
      this.#currentTheme = cookieTheme;
      console.log(`Theme loaded from cookie: ${cookieTheme}`);
    } else {
      // No cookie, use system preference
      this.#currentTheme = this.getSystemPreference();
      console.log(`Theme loaded from system preference: ${this.#currentTheme}`);
    }

    this.applyTheme(this.#currentTheme);
  }

  /**
   * Get theme preference from cookie if it exists
   */
  private getThemeFromCookie(): Theme | null {
    const cookieValue = Cookies.get(this.#COOKIE_NAME);

    if (cookieValue === "light" || cookieValue === "dark") {
      return cookieValue;
    }

    return null;
  }

  /**
   * Detect system color scheme preference
   */
  private getSystemPreference(): Theme {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  /**
   * Apply the theme to the document
   */
  private applyTheme(theme: Theme): void {
    console.log(`Applying theme: ${theme}`);
    console.log("document.documentElement:", document.documentElement);

    // Always set the data-theme attribute explicitly
    // This ensures we override system preferences
    document.documentElement.setAttribute("data-theme", theme);
    console.log(`Set data-theme=${theme} on document.documentElement`);
    console.log(
      "Attribute value:",
      document.documentElement.getAttribute("data-theme"),
    );

    // Log computed background color to verify CSS variables are working
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    console.log("Body background color:", bodyBg);
  }

  /**
   * Toggle between light and dark mode
   * Called when user manually changes the setting
   */
  public toggleTheme(): void {
    const newTheme: Theme = this.#currentTheme === "light" ? "dark" : "light";
    this.setTheme(newTheme, true);
  }

  /**
   * Set a specific theme
   * @param theme - The theme to set
   * @param savePreference - Whether to save this choice in a cookie
   */
  public setTheme(theme: Theme, savePreference: boolean = false): void {
    this.#currentTheme = theme;
    this.applyTheme(theme);

    if (savePreference) {
      this.saveThemePreference(theme);
      console.log(`Theme preference saved: ${theme}`);
    }

    // Dispatch custom event so other parts of the app can react
    window.dispatchEvent(
      new CustomEvent("themeChanged", { detail: { theme } }),
    );
  }

  /**
   * Save theme preference to cookie
   */
  private saveThemePreference(theme: Theme): void {
    Cookies.set(this.#COOKIE_NAME, theme, {
      expires: this.#COOKIE_EXPIRY_DAYS,
      sameSite: "strict",
    });
  }

  /**
   * Get current theme
   */
  public getCurrentTheme(): Theme {
    return this.#currentTheme;
  }

  /**
   * Check if current theme is dark
   */
  public isDarkMode(): boolean {
    return this.#currentTheme === "dark";
  }

  /**
   * Clear saved preference and revert to system preference
   */
  public clearPreference(): void {
    Cookies.remove(this.#COOKIE_NAME);
    this.#currentTheme = this.getSystemPreference();
    this.applyTheme(this.#currentTheme);
    console.log("Theme preference cleared, using system preference");
  }
}

// Global theme manager instance
export const themeManager = new ThemeManager();

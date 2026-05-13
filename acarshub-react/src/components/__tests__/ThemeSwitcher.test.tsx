// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * ThemeSwitcher Component Tests
 *
 * Why this exists: ThemeSwitcher is the single chokepoint that wires the
 * Zustand `theme` setting to the live DOM via
 * `document.documentElement.setAttribute("data-theme", "light")`. Every
 * SCSS theme rule in the app keys off that attribute, so a regression
 * here silently breaks the entire light-mode experience — the button
 * keeps "working" (icon flips, store updates) but the page never
 * actually re-themes.
 *
 * The contract this suite locks down:
 *
 *  1. Mounting with theme="mocha" leaves data-theme UNSET. The SCSS
 *     defaults to Mocha when the attribute is absent; setting any value
 *     (even "dark") would break that default path.
 *  2. Mounting with theme="latte" sets data-theme="light". This is the
 *     only signal the SCSS uses to swap Catppuccin variables.
 *  3. Clicking the button toggles the store theme value. We assert
 *     against the store rather than re-render output so a future
 *     refactor that memoises the button still gets caught.
 *  4. After a click that flips mocha→latte, the data-theme attribute
 *     reflects the new state (the useEffect ran). This is the
 *     end-to-end regression guard — if the effect dependency array or
 *     the conditional logic ever drifts, this fails.
 *  5. aria-label and title advertise the TARGET theme ("Switch to
 *     light theme" while currently dark), because the button is an
 *     action, not a status indicator. Reversing this wording is a
 *     screen-reader-visible UX regression.
 *  6. The rendered icon matches the TARGET theme (lightbulb while dark,
 *     moon while light) — same rationale as #5, but for sighted users.
 */

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../store/useSettingsStore";
import { ThemeSwitcher } from "../ThemeSwitcher";

/**
 * Reset both the store theme AND the document-level side effect before
 * every test. The data-theme attribute is global mutable state that
 * persists across renders within the same jsdom instance, so without
 * this cleanup test order would matter.
 */
beforeEach(() => {
  // Use the store's own setTheme action rather than hand-rolling a
  // setState shape: theme lives at settings.appearance.theme, and
  // going through the action keeps the test refactor-resistant.
  useSettingsStore.getState().setTheme("mocha");
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeSwitcher", () => {
  describe("document-level theme application (the silent-failure surface)", () => {
    it("leaves data-theme unset when mounted with theme=mocha", () => {
      // SCSS treats absence-of-attribute as Mocha. Setting it to
      // anything (even "dark") would break the default path.
      render(<ThemeSwitcher />);
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it('sets data-theme="light" when mounted with theme=latte', () => {
      useSettingsStore.getState().setTheme("latte");

      render(<ThemeSwitcher />);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("updates data-theme when the store theme changes after mount", () => {
      // End-to-end regression: useEffect must re-run on theme change.
      // If the dependency array drifts, the icon would flip but the
      // page would not actually re-theme — exactly the silent failure
      // this component exists to prevent.
      const { getByRole } = render(<ThemeSwitcher />);
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

      fireEvent.click(getByRole("button"));
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");

      fireEvent.click(getByRole("button"));
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });

  describe("store interaction", () => {
    it("toggles the store theme on click (mocha → latte)", () => {
      // Assert against the store directly so a future
      // React.memo/useCallback refactor still gets caught.
      const { getByRole } = render(<ThemeSwitcher />);
      expect(useSettingsStore.getState().settings.appearance.theme).toBe(
        "mocha",
      );

      fireEvent.click(getByRole("button"));
      expect(useSettingsStore.getState().settings.appearance.theme).toBe(
        "latte",
      );
    });

    it("toggles the store theme on click (latte → mocha)", () => {
      useSettingsStore.getState().setTheme("latte");

      const { getByRole } = render(<ThemeSwitcher />);
      fireEvent.click(getByRole("button"));
      expect(useSettingsStore.getState().settings.appearance.theme).toBe(
        "mocha",
      );
    });
  });

  describe("accessible labelling (target-theme semantics)", () => {
    it("advertises the TARGET theme in aria-label while currently dark", () => {
      // The button is an action ("switch to X"), not a status
      // indicator. Reversing this wording is a screen-reader-visible
      // regression that sighted testing would not catch.
      const { getByRole } = render(<ThemeSwitcher />);
      const button = getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
      expect(button.getAttribute("title")).toBe("Switch to light theme");
    });

    it("advertises the TARGET theme in aria-label while currently light", () => {
      useSettingsStore.getState().setTheme("latte");

      const { getByRole } = render(<ThemeSwitcher />);
      const button = getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("Switch to dark theme");
      expect(button.getAttribute("title")).toBe("Switch to dark theme");
    });
  });

  describe("icon selection (target-theme semantics)", () => {
    it("renders the lightbulb icon while currently dark (action: go light)", () => {
      // Icons are anonymous SVGs from createIcon(); they're
      // distinguished by viewBox. IconLightbulb uses "0 0 384 512";
      // IconMoon uses "0 0 512 512". Pinning the viewBox is the most
      // refactor-resistant assertion available without bolting a
      // data-testid onto the icon factory.
      const { container } = render(<ThemeSwitcher />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 384 512");
    });

    it("renders the moon icon while currently light (action: go dark)", () => {
      useSettingsStore.getState().setTheme("latte");

      const { container } = render(<ThemeSwitcher />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 512 512");
    });
  });

  describe("className passthrough", () => {
    it("forwards className to the underlying Button", () => {
      // Callers (e.g. Navigation) position the switcher via this prop.
      // Dropping it would silently break layouts.
      const { getByRole } = render(<ThemeSwitcher className="custom-class" />);
      expect(getByRole("button").classList.contains("custom-class")).toBe(true);
    });
  });
});

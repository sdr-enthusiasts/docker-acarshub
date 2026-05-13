// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * useThemeAwareMapProvider Hook Tests
 *
 * Why this exists: this hook is the only mechanism that keeps the map
 * tile provider visually aligned with the Catppuccin theme (Mocha →
 * carto_dark_all, Latte → carto_light_all).  It also implements an
 * explicit-override escape hatch: once the user picks a provider from
 * Settings (userSelectedProvider=true) the hook MUST stop auto-
 * switching, forever, until they reset.
 *
 * The silent-failure modes that justify these tests:
 *
 *  1. Override regression — if the userSelectedProvider check is ever
 *     inverted/dropped, the hook will silently overwrite the user's
 *     deliberate choice on every theme change.  No error, no log line
 *     they would notice; just "my map keeps reverting".
 *
 *  2. Identity check regression — if the `mapSettings.provider !==
 *     themeProvider` guard is dropped, the hook calls setMapProvider
 *     on every render, which would in turn re-fire the effect because
 *     setMapProvider mutates state the effect depends on.  Render loop.
 *
 *  3. Mapping regression — if the THEME_MAP_PROVIDERS lookup gets
 *     swapped (Mocha→light_all, Latte→dark_all) the map will be
 *     un-readable against the theme.  Catppuccin contrast contract
 *     broken; sighted-user UX regression.
 *
 *  4. Reactivity regression — if the effect's dependency array drifts
 *     (e.g. drops `theme`), switching themes post-mount will leave the
 *     map provider stale.  The button "works" but the map doesn't
 *     re-tile.
 *
 * The hook returns void; we assert against the store state after
 * render, which is the actual observable side effect.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useThemeAwareMapProvider } from "../useThemeAwareMapProvider";

/**
 * Reset both theme and map settings to a known baseline before every
 * test. We use store actions rather than hand-rolled setState calls so
 * that future schema changes (e.g. moving map under another key) only
 * have to be fixed in one place.
 */
beforeEach(() => {
  const store = useSettingsStore.getState();
  store.setTheme("mocha");
  // Land on the wrong-for-mocha provider with userSelected=false so
  // the hook has work to do unless explicitly overridden.
  store.setMapProvider("carto_light_all", false);
});

describe("useThemeAwareMapProvider", () => {
  describe("auto-switching (no user override)", () => {
    it("switches to carto_dark_all when theme is mocha", () => {
      useSettingsStore.getState().setTheme("mocha");

      renderHook(() => useThemeAwareMapProvider());

      const map = useSettingsStore.getState().settings.map;
      expect(map.provider).toBe("carto_dark_all");
      // Critical: auto-switch MUST preserve userSelectedProvider=false
      // so subsequent theme changes are still picked up. A regression
      // that flips this would freeze the map provider after first
      // auto-switch.
      expect(map.userSelectedProvider).toBe(false);
    });

    it("switches to carto_light_all when theme is latte", () => {
      useSettingsStore.getState().setTheme("latte");
      // Reset provider to something other than the latte target so
      // the hook has work to do.
      useSettingsStore.getState().setMapProvider("carto_dark_all", false);

      renderHook(() => useThemeAwareMapProvider());

      const map = useSettingsStore.getState().settings.map;
      expect(map.provider).toBe("carto_light_all");
      expect(map.userSelectedProvider).toBe(false);
    });

    it("reactively re-syncs when theme changes after mount", () => {
      // Regression guard against dependency-array drift. If `theme`
      // is ever dropped from the effect deps, this fails.
      const { rerender } = renderHook(() => useThemeAwareMapProvider());

      // Initial mount lands on carto_dark_all (mocha baseline).
      expect(useSettingsStore.getState().settings.map.provider).toBe(
        "carto_dark_all",
      );

      // Flip theme; the hook's effect should re-run and re-sync.
      useSettingsStore.getState().setTheme("latte");
      rerender();

      expect(useSettingsStore.getState().settings.map.provider).toBe(
        "carto_light_all",
      );
    });
  });

  describe("user-override escape hatch (the most dangerous regression surface)", () => {
    it("does NOT overwrite the provider when userSelectedProvider=true", () => {
      // The whole point of the override flag. If this regresses, the
      // user's deliberate choice gets clobbered on every theme change.
      useSettingsStore.getState().setMapProvider("osm", true);
      // Theme is mocha (from beforeEach); without the guard the hook
      // would force carto_dark_all here.
      renderHook(() => useThemeAwareMapProvider());

      const map = useSettingsStore.getState().settings.map;
      expect(map.provider).toBe("osm");
      expect(map.userSelectedProvider).toBe(true);
    });

    it("does NOT overwrite even when user-chosen provider mismatches theme", () => {
      // Edge case: user picked carto_light_all but is on Mocha.
      // The mismatch is INTENTIONAL — they want a light map on a
      // dark UI. Hook must respect that.
      useSettingsStore.getState().setTheme("mocha");
      useSettingsStore.getState().setMapProvider("carto_light_all", true);

      renderHook(() => useThemeAwareMapProvider());

      expect(useSettingsStore.getState().settings.map.provider).toBe(
        "carto_light_all",
      );
    });

    it("continues to honour override across theme changes post-mount", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      const { rerender } = renderHook(() => useThemeAwareMapProvider());

      useSettingsStore.getState().setTheme("latte");
      rerender();
      expect(useSettingsStore.getState().settings.map.provider).toBe("osm");

      useSettingsStore.getState().setTheme("mocha");
      rerender();
      expect(useSettingsStore.getState().settings.map.provider).toBe("osm");
    });
  });

  describe("no-op when already aligned (render-loop guard)", () => {
    it("does not call setMapProvider when provider already matches theme", () => {
      // If the identity guard (provider !== themeProvider) regresses,
      // the hook would call setMapProvider every render, which
      // mutates state the effect depends on, which re-fires the
      // effect, which... — render loop. We can't directly assert
      // "setMapProvider was not called" without mocking the store,
      // but we CAN assert userSelectedProvider stays exactly false
      // and provider stays exactly carto_dark_all across multiple
      // rerenders without any test-side mutation.
      useSettingsStore.getState().setMapProvider("carto_dark_all", false);

      const { rerender } = renderHook(() => useThemeAwareMapProvider());
      const beforeUpdatedAt = useSettingsStore.getState().settings.updatedAt;
      const before = useSettingsStore.getState().settings.map;

      rerender();
      rerender();
      rerender();

      const after = useSettingsStore.getState().settings.map;
      const afterUpdatedAt = useSettingsStore.getState().settings.updatedAt;
      expect(after.provider).toBe("carto_dark_all");
      expect(after.userSelectedProvider).toBe(false);
      // settings.updatedAt is the cheapest tripwire for "did
      // setMapProvider fire?": setMapProvider stamps it on every
      // call, so an unchanged value across 3 rerenders proves the
      // no-op path held.
      expect(afterUpdatedAt).toBe(beforeUpdatedAt);
      // Also pin the map sub-object reference: setMapProvider creates
      // a new map object on every call. Reference equality across
      // rerenders is a strict no-op proof.
      expect(after).toBe(before);
    });
  });
});

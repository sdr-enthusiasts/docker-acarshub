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

/**
 * Tests for MapTab (GOD-05 extraction from SettingsModal.tsx).
 *
 * SettingsModal.test.tsx exercises tab navigation and confirms the "Map" tab
 * button exists, but never clicks into the panel itself — this file closes
 * that pre-existing gap (surfaced, not introduced, by the GOD-05 split: the
 * untested JSX previously hid inside the much-larger, mostly-tested
 * SettingsModal.tsx and its 0% coverage wasn't visible in the aggregate).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { MapTab } from "../MapTab";

describe("MapTab", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().resetToDefaults();
  });

  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  it("renders the tabpanel with correct ARIA wiring", () => {
    render(<MapTab />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "map-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "map-tab");
  });

  describe("theme-aware mode", () => {
    it("shows the theme-aware info banner when no provider has been user-selected", () => {
      render(<MapTab />);
      expect(screen.getByText(/Theme-Aware Mode Active/i)).toBeInTheDocument();
    });

    it("hides the theme-aware banner once a provider is user-selected", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);
      expect(
        screen.queryByText(/Theme-Aware Mode Active/i),
      ).not.toBeInTheDocument();
    });

    it("shows a 'Reset to Theme-Aware Mode' button only when user-selected", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);
      const resetButton = screen.getByRole("button", {
        name: /Reset to Theme-Aware Mode/i,
      });
      expect(resetButton).toBeInTheDocument();
    });

    it("resets to theme-aware mode (userSelected=false) when the reset button is clicked", async () => {
      const user = userEvent.setup();
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);

      await user.click(
        screen.getByRole("button", { name: /Reset to Theme-Aware Mode/i }),
      );

      expect(
        useSettingsStore.getState().settings.map.userSelectedProvider,
      ).toBe(false);
    });
  });

  describe("map provider selection", () => {
    it("selecting a concrete provider marks it as user-selected", async () => {
      const user = userEvent.setup();
      render(<MapTab />);

      const select = screen.getByLabelText("Map Provider");
      await user.selectOptions(select, "osm");

      const state = useSettingsStore.getState().settings.map;
      expect(state.provider).toBe("osm");
      expect(state.userSelectedProvider).toBe(true);
    });

    it("selecting the empty 'Default' option switches to the theme-appropriate carto provider", async () => {
      const user = userEvent.setup();
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);

      const select = screen.getByLabelText("Map Provider");
      await user.selectOptions(select, "");

      const state = useSettingsStore.getState().settings.map;
      expect(state.userSelectedProvider).toBe(false);
      expect(["carto_dark_all", "carto_light_all"]).toContain(state.provider);
    });

    it("displays the current provider's friendly name", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);
      expect(screen.getByText(/Current Provider:/)).toBeInTheDocument();
    });
  });

  describe("custom tile URL", () => {
    it("typing a custom tile URL sets both the URL and provider to 'custom'", () => {
      render(<MapTab />);

      // fireEvent.change (not user.type) — the URL contains `{z}`/`{x}`/`{y}`
      // literals, which user-event v14 interprets as special key syntax.
      const input = screen.getByLabelText("Custom Tile URL");
      fireEvent.change(input, {
        target: { value: "https://example.com/{z}/{x}/{y}.png" },
      });

      const state = useSettingsStore.getState().settings.map;
      expect(state.provider).toBe("custom");
      expect(state.customTileUrl).toBe("https://example.com/{z}/{x}/{y}.png");
    });

    it("shows the custom URL in the current-provider info block", () => {
      useSettingsStore
        .getState()
        .setCustomTileUrl("https://example.com/{z}/{x}/{y}.png");
      useSettingsStore.getState().setMapProvider("custom", true);
      render(<MapTab />);

      expect(
        screen.getByText(/Custom URL: https:\/\/example\.com/),
      ).toBeInTheDocument();
    });
  });

  describe("ground altitude threshold", () => {
    it("defaults to 500 ft MSL", () => {
      render(<MapTab />);
      const input = screen.getByLabelText(
        "Ground Altitude Threshold",
      ) as HTMLInputElement;
      expect(input.value).toBe("500");
    });

    it("updates the store when a valid number is entered", () => {
      render(<MapTab />);

      // fireEvent.change (not user.type/clear) — user-event's clear() on
      // <input type="number"> doesn't reliably empty jsdom's value in this
      // environment, causing digits to append rather than replace.
      const input = screen.getByLabelText("Ground Altitude Threshold");
      fireEvent.change(input, { target: { value: "750" } });

      expect(
        useSettingsStore.getState().settings.map.groundAltitudeThreshold,
      ).toBe(750);
    });

    it("ignores a cleared (NaN) value without writing to the store", () => {
      render(<MapTab />);

      const input = screen.getByLabelText("Ground Altitude Threshold");
      fireEvent.change(input, { target: { value: "" } });

      // NaN guard means the store keeps its last valid value (500 default).
      expect(
        useSettingsStore.getState().settings.map.groundAltitudeThreshold,
      ).toBe(500);
    });
  });
});

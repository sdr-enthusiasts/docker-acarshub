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

    it.each([
      ["mocha", "openfreemap_dark"],
      ["latte", "openfreemap_positron"],
    ] as const)(
      "selecting the empty 'Default' option on %s switches to %s",
      async (theme, expected) => {
        const user = userEvent.setup();
        useSettingsStore.getState().setTheme(theme);
        useSettingsStore.getState().setMapProvider("osm", true);
        render(<MapTab />);

        const select = screen.getByLabelText("Map Provider");
        await user.selectOptions(select, "");

        const state = useSettingsStore.getState().settings.map;
        expect(state.userSelectedProvider).toBe(false);
        expect(state.provider).toBe(expected);
      },
    );

    it("displays the current provider's friendly name", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);
      expect(screen.getByText(/Current Provider:/)).toBeInTheDocument();
    });
  });

  describe("CARTO API key", () => {
    const CARTO_IDS = [
      "carto_english",
      "carto_dark_all",
      "carto_dark_nolabels",
      "carto_light_all",
      "carto_light_nolabels",
    ];

    function providerOption(value: string): HTMLOptionElement {
      const select = screen.getByLabelText("Map Provider");
      const option = select.querySelector<HTMLOptionElement>(
        `option[value="${value}"]`,
      );
      if (!option) throw new Error(`no option for ${value}`);
      return option;
    }

    it("renders a masked, non-autocompleting key input", () => {
      render(<MapTab />);
      const input = screen.getByLabelText("CARTO API key");
      expect(input).toHaveAttribute("type", "password");
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveValue("");
    });

    it("links to the CARTO key page in a new tab", () => {
      render(<MapTab />);
      const link = screen.getByRole("link", {
        name: "carto.com/basemaps/apikey",
      });
      expect(link).toHaveAttribute("href", "https://carto.com/basemaps/apikey");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("typing a key stores it (trimmed) in the settings store", () => {
      render(<MapTab />);
      fireEvent.change(screen.getByLabelText("CARTO API key"), {
        target: { value: " abc123 " },
      });
      expect(useSettingsStore.getState().settings.map.cartoApiKey).toBe(
        "abc123",
      );
      expect(screen.getByLabelText("CARTO API key")).toHaveValue("abc123");
    });

    it("disables CARTO options with a hint when no key is set", () => {
      render(<MapTab />);
      for (const id of CARTO_IDS) {
        const option = providerOption(id);
        expect(option.disabled).toBe(true);
        expect(option.textContent).toMatch(/\(requires CARTO API key\)$/);
      }
      expect(providerOption("osm").disabled).toBe(false);
      expect(providerOption("openfreemap_dark").disabled).toBe(false);
    });

    it("enables CARTO options once a key is set", () => {
      useSettingsStore.getState().setCartoApiKey("abc123");
      render(<MapTab />);
      for (const id of CARTO_IDS) {
        const option = providerOption(id);
        expect(option.disabled).toBe(false);
        expect(option.textContent).not.toMatch(/requires CARTO API key/);
      }
    });

    it("enables CARTO options as soon as a key is typed", () => {
      render(<MapTab />);
      expect(providerOption("carto_dark_all").disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("CARTO API key"), {
        target: { value: "abc123" },
      });
      expect(providerOption("carto_dark_all").disabled).toBe(false);
    });

    it("shows the fallback notice when a CARTO provider is stored without a key", () => {
      useSettingsStore.getState().setMapProvider("carto_dark_all", true);
      render(<MapTab />);
      expect(screen.getByText(/CARTO API key required:/)).toBeInTheDocument();
      expect(
        screen.getByText(/theme default \(OpenFreeMap Dark\) is shown/),
      ).toBeInTheDocument();
    });

    it("hides the fallback notice once a key is entered", () => {
      useSettingsStore.getState().setMapProvider("carto_dark_all", true);
      render(<MapTab />);
      fireEvent.change(screen.getByLabelText("CARTO API key"), {
        target: { value: "abc123" },
      });
      expect(
        screen.queryByText(/CARTO API key required:/),
      ).not.toBeInTheDocument();
    });

    it("does not show the fallback notice for non-CARTO providers", () => {
      useSettingsStore.getState().setMapProvider("osm", true);
      render(<MapTab />);
      expect(
        screen.queryByText(/CARTO API key required:/),
      ).not.toBeInTheDocument();
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

  describe("marker size (FEAT-MARKER-SIZE)", () => {
    // Accessible name includes the option's description text (the <label>
    // wraps both), so queries use a leading-anchor regex rather than an
    // exact string match — see components/__tests__/RadioGroup.test.tsx
    // for the same convention.

    it("defaults to 'medium' selected", () => {
      render(<MapTab />);
      const mediumRadio = screen.getByRole("radio", {
        name: /^Medium/,
      }) as HTMLInputElement;
      expect(mediumRadio.checked).toBe(true);
    });

    it.each([
      ["small", /^Small/],
      ["medium", /^Medium/],
      ["large", /^Large/],
    ] as const)("selecting '%s' updates the store", async (size, pattern) => {
      const user = userEvent.setup();
      render(<MapTab />);

      await user.click(screen.getByRole("radio", { name: pattern }));

      expect(useSettingsStore.getState().settings.map.markerSize).toBe(size);
    });

    it("reflects the current store value when it is not the default", () => {
      useSettingsStore.getState().setMarkerSize("large");
      render(<MapTab />);

      const largeRadio = screen.getByRole("radio", {
        name: /^Large/,
      }) as HTMLInputElement;
      expect(largeRadio.checked).toBe(true);
    });
  });
});

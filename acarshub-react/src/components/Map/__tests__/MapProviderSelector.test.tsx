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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { MapProviderSelector } from "../MapProviderSelector";

describe("MapProviderSelector", () => {
  beforeEach(() => {
    // Reset store to defaults
    useSettingsStore.getState().resetToDefaults();
  });

  afterEach(() => {
    // Cleanup
    useSettingsStore.getState().resetToDefaults();
  });

  describe("Rendering", () => {
    it("should render the trigger button", () => {
      render(<MapProviderSelector />);
      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      expect(button).toBeInTheDocument();
    });

    it("should not show menu initially", () => {
      render(<MapProviderSelector />);
      const menu = screen.queryByRole("menu");
      expect(menu).not.toBeInTheDocument();
    });

    it("should show menu when button is clicked", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      const menu = screen.getByRole("menu", { name: /map provider options/i });
      expect(menu).toBeInTheDocument();
    });

    it("should display current provider in menu", async () => {
      const user = userEvent.setup();
      useSettingsStore.getState().setMapProvider("osm", true);

      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      expect(screen.getByText(/Current:/i)).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "OpenStreetMap" }),
      ).toBeInTheDocument();
    });

    it("should highlight current provider", async () => {
      const user = userEvent.setup();
      useSettingsStore.getState().setMapProvider("osm", true);

      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      const activeItem = screen.getByRole("menuitem", {
        name: "OpenStreetMap",
      });
      expect(activeItem).toHaveClass("map-provider-selector__item--active");
    });
  });

  describe("Menu Interaction", () => {
    it("should close menu when clicking close button", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      // Open menu
      const openButton = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(openButton);

      // Click close button
      const closeButton = screen.getByRole("button", { name: /close menu/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
    });

    it("should close menu when pressing Escape", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      // Open menu
      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      // Press Escape
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
    });

    it("should select provider when clicking menu item", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      // Open menu
      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      // Click OpenStreetMap provider
      const osmItem = screen.getByRole("menuitem", { name: "OpenStreetMap" });
      await user.click(osmItem);

      // Verify provider was changed
      expect(useSettingsStore.getState().settings.map.provider).toBe("osm");
    });

    it("should mark provider as user-selected", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      // Open menu
      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      // Click OpenStreetMap provider
      const osmItem = screen.getByRole("menuitem", { name: "OpenStreetMap" });
      await user.click(osmItem);

      // Verify userSelectedProvider flag is set
      expect(
        useSettingsStore.getState().settings.map.userSelectedProvider,
      ).toBe(true);
    });

    it("should close menu after selecting provider", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      // Open menu
      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      // Click a provider
      const osmItem = screen.getByRole("menuitem", { name: "OpenStreetMap" });
      await user.click(osmItem);

      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
    });
  });

  describe("Provider Groups", () => {
    it("should display worldwide providers section", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      expect(screen.getByText(/worldwide/i)).toBeInTheDocument();
    });

    it("should display US aviation charts section", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      expect(screen.getByText(/us aviation charts/i)).toBeInTheDocument();
    });

    it("should display vector badge for vector providers", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      // OpenFreeMap providers are vector tiles
      const badges = screen.getAllByText(/vector/i);
      expect(badges.length).toBeGreaterThan(0);
    });

    it("should show provider count in footer", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      expect(screen.getByText(/providers available/i)).toBeInTheDocument();
    });
  });

  describe("CARTO API key gating", () => {
    async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
      const user = userEvent.setup();
      render(<MapProviderSelector />);
      await user.click(
        screen.getByRole("button", { name: /select map provider/i }),
      );
      return user;
    }

    it("renders CARTO entries disabled with a hint when no key is set", async () => {
      await openMenu();

      const cartoItems = screen.getAllByRole("menuitem", { name: /^CARTO/ });
      expect(cartoItems).toHaveLength(5);
      for (const item of cartoItems) {
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item).toHaveClass("map-provider-selector__item--disabled");
        expect(item).toHaveTextContent("requires CARTO API key");
      }

      const osm = screen.getByRole("menuitem", { name: "OpenStreetMap" });
      expect(osm).not.toHaveAttribute("aria-disabled");
    });

    it("ignores clicks on a disabled CARTO entry", async () => {
      const user = await openMenu();

      await user.click(
        screen.getByRole("menuitem", { name: /^CARTO\.com Dark All/ }),
      );

      const { map } = useSettingsStore.getState().settings;
      expect(map.provider).toBe("openfreemap_dark");
      expect(map.userSelectedProvider).toBe(false);
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("lets CARTO entries be selected once a key is set", async () => {
      useSettingsStore.getState().setCartoApiKey("abc123");
      const user = await openMenu();

      const item = screen.getByRole("menuitem", { name: "CARTO.com Dark All" });
      expect(item).not.toHaveAttribute("aria-disabled");
      expect(item).not.toHaveTextContent("requires CARTO API key");

      await user.click(item);

      const { map } = useSettingsStore.getState().settings;
      expect(map.provider).toBe("carto_dark_all");
      expect(map.userSelectedProvider).toBe(true);
    });

    it("shows the theme default as current when a stored CARTO choice has no key", async () => {
      useSettingsStore.getState().setMapProvider("carto_dark_all", true);
      await openMenu();

      const current = screen.getByText(/Current:/i);
      expect(current).toHaveTextContent("OpenFreeMap Dark");
      expect(current).toHaveTextContent("CARTO needs an API key");
    });

    it("shows the CARTO provider as current once a key is set", async () => {
      useSettingsStore.getState().setMapProvider("carto_dark_all", true);
      useSettingsStore.getState().setCartoApiKey("abc123");
      await openMenu();

      const current = screen.getByText(/Current:/i);
      expect(current).toHaveTextContent("CARTO.com Dark All");
      expect(current).not.toHaveTextContent("CARTO needs an API key");
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes on button", () => {
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-haspopup", "true");
    });

    it("should update aria-expanded when menu opens", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("should have proper role on menu", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      const menu = screen.getByRole("menu");
      expect(menu).toHaveAttribute("aria-label", "Map provider options");
    });

    it("should have menuitem role on provider options", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      const menuItems = screen.getAllByRole("menuitem");
      expect(menuItems.length).toBeGreaterThan(0);
    });

    it("should focus button after closing with Escape", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(button).toHaveFocus();
      });
    });

    it("should focus button after closing with close button", async () => {
      const user = userEvent.setup();
      render(<MapProviderSelector />);

      const button = screen.getByRole("button", {
        name: /select map provider/i,
      });
      await user.click(button);

      const closeButton = screen.getByRole("button", { name: /close menu/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(button).toHaveFocus();
      });
    });
  });
});

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

// Mock geojson URL imports BEFORE importing the component under test —
// Vite's `?url` suffix is not resolvable in the Vitest pipeline without
// a config-level loader, so we stub the entire config module to a known
// shape that exercises every branch of GeoJSONOverlayButton (category
// fully enabled / disabled / indeterminate; multi-category counts).
import { vi } from "vitest";

vi.mock("../../../config/geojsonOverlays", () => {
  const GEOJSON_OVERLAYS = [
    {
      name: "Test Region A",
      overlays: [
        {
          id: "a-one",
          name: "Overlay A1",
          path: "/fake/a1.geojson",
          category: "Test Region A",
          enabled: false,
          color: "#ff0000",
          opacity: 0.6,
        },
        {
          id: "a-two",
          name: "Overlay A2",
          path: "/fake/a2.geojson",
          category: "Test Region A",
          enabled: false,
          color: "#00ff00",
          opacity: 0.6,
        },
      ],
    },
    {
      name: "Test Region B",
      overlays: [
        {
          id: "b-one",
          name: "Overlay B1",
          path: "/fake/b1.geojson",
          category: "Test Region B",
          enabled: false,
          color: "#0000ff",
          opacity: 0.6,
        },
      ],
    },
  ];

  return {
    GEOJSON_OVERLAYS,
    // The settings store imports getOverlaysByCategory from this module too;
    // wire it through the same fixture so category-toggle store actions
    // resolve to the test fixture, not the real (unmocked) overlays.
    getOverlaysByCategory: (name: string) =>
      GEOJSON_OVERLAYS.find((c) => c.name === name)?.overlays ?? [],
  };
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { GeoJSONOverlayButton } from "../GeoJSONOverlayButton";

function setEnabledOverlays(ids: string[]) {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      map: { ...state.settings.map, enabledGeoJSONOverlays: ids },
    },
  }));
}

describe("GeoJSONOverlayButton", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  describe("trigger button", () => {
    it("renders the trigger collapsed (aria-expanded=false, no dropdown content)", () => {
      render(<GeoJSONOverlayButton />);

      const trigger = screen.getByRole("button", { name: /geojson overlays/i });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("type", "button");
      // Dropdown header should not be in the DOM yet
      expect(
        screen.queryByText("GeoJSON Overlays", { selector: "div" }),
      ).not.toBeInTheDocument();
    });

    it("does NOT apply the active modifier when no overlays are enabled", () => {
      setEnabledOverlays([]);
      render(<GeoJSONOverlayButton />);

      const trigger = screen.getByRole("button", { name: /geojson overlays/i });
      expect(trigger).not.toHaveClass("map-control-button--active");
    });

    it("applies the active modifier when any overlay is enabled", () => {
      setEnabledOverlays(["a-one"]);
      render(<GeoJSONOverlayButton />);

      const trigger = screen.getByRole("button", { name: /geojson overlays/i });
      expect(trigger).toHaveClass("map-control-button--active");
    });

    it("hides the count badge when zero overlays are enabled", () => {
      setEnabledOverlays([]);
      const { container } = render(<GeoJSONOverlayButton />);

      expect(
        container.querySelector(".geojson-overlay-button__badge"),
      ).not.toBeInTheDocument();
    });

    it("shows the count badge with the number of enabled overlays", () => {
      setEnabledOverlays(["a-one", "a-two", "b-one"]);
      const { container } = render(<GeoJSONOverlayButton />);

      const badge = container.querySelector(".geojson-overlay-button__badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("3");
    });
  });

  describe("dropdown lifecycle", () => {
    it("opens the dropdown when the trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );

      expect(screen.getByText("Test Region A")).toBeInTheDocument();
      expect(screen.getByText("Test Region B")).toBeInTheDocument();
    });

    it("closes the dropdown when the trigger is clicked again", async () => {
      const user = userEvent.setup();
      render(<GeoJSONOverlayButton />);

      const trigger = screen.getByRole("button", { name: /geojson overlays/i });
      await user.click(trigger);
      expect(screen.getByText("Test Region A")).toBeInTheDocument();

      await user.click(trigger);
      expect(screen.queryByText("Test Region A")).not.toBeInTheDocument();
    });

    it("closes the dropdown when clicking outside", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <button type="button" data-testid="outside">
            Outside
          </button>
          <GeoJSONOverlayButton />
        </div>,
      );

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      expect(screen.getByText("Test Region A")).toBeInTheDocument();

      await user.click(screen.getByTestId("outside"));
      expect(screen.queryByText("Test Region A")).not.toBeInTheDocument();
    });

    it("closes the dropdown when Escape is pressed", async () => {
      const user = userEvent.setup();
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      expect(screen.getByText("Test Region A")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByText("Test Region A")).not.toBeInTheDocument();
    });

    it("ignores keys other than Escape while open", async () => {
      const user = userEvent.setup();
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      await user.keyboard("a");

      expect(screen.getByText("Test Region A")).toBeInTheDocument();
    });
  });

  describe("category-level controls", () => {
    it("category checkbox is UNCHECKED and not indeterminate when no overlays in the category are enabled", async () => {
      const user = userEvent.setup();
      setEnabledOverlays([]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );

      const cat = screen.getByRole("checkbox", {
        name: /toggle all test region a overlays/i,
      });
      expect(cat).not.toBeChecked();
      expect((cat as HTMLInputElement).indeterminate).toBe(false);
    });

    it("category checkbox is CHECKED (not indeterminate) when ALL overlays in the category are enabled", async () => {
      const user = userEvent.setup();
      setEnabledOverlays(["a-one", "a-two"]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );

      const cat = screen.getByRole("checkbox", {
        name: /toggle all test region a overlays/i,
      });
      expect(cat).toBeChecked();
      expect((cat as HTMLInputElement).indeterminate).toBe(false);
    });

    it("category checkbox is INDETERMINATE when only some overlays in the category are enabled", async () => {
      const user = userEvent.setup();
      setEnabledOverlays(["a-one"]); // Region A has [a-one, a-two]
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );

      const cat = screen.getByRole("checkbox", {
        name: /toggle all test region a overlays/i,
      });
      // HTML doesn't represent indeterminate via the checked attribute — the
      // underlying boolean is exposed only on the DOM property, hence the cast.
      expect((cat as HTMLInputElement).indeterminate).toBe(true);
    });

    it("clicking the category checkbox enables every overlay in the category", async () => {
      const user = userEvent.setup();
      setEnabledOverlays([]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: /toggle all test region a overlays/i,
        }),
      );

      const enabled =
        useSettingsStore.getState().settings.map.enabledGeoJSONOverlays;
      expect(enabled).toContain("a-one");
      expect(enabled).toContain("a-two");
      expect(enabled).not.toContain("b-one");
    });

    it("clicking a checked category checkbox disables every overlay in the category (leaves others alone)", async () => {
      const user = userEvent.setup();
      setEnabledOverlays(["a-one", "a-two", "b-one"]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: /toggle all test region a overlays/i,
        }),
      );

      const enabled =
        useSettingsStore.getState().settings.map.enabledGeoJSONOverlays;
      expect(enabled).not.toContain("a-one");
      expect(enabled).not.toContain("a-two");
      // b-one (different category) must be untouched
      expect(enabled).toContain("b-one");
    });
  });

  describe("individual overlay toggles", () => {
    it("renders one checkbox per overlay, reflecting the persisted-enabled state", async () => {
      const user = userEvent.setup();
      setEnabledOverlays(["a-one"]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );

      expect(
        screen.getByRole("checkbox", { name: "Overlay A1" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Overlay A2" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Overlay B1" }),
      ).not.toBeChecked();
    });

    it("clicking an unchecked overlay enables it via toggleGeoJSONOverlay", async () => {
      const user = userEvent.setup();
      setEnabledOverlays([]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      await user.click(screen.getByRole("checkbox", { name: "Overlay A1" }));

      expect(
        useSettingsStore.getState().settings.map.enabledGeoJSONOverlays,
      ).toEqual(["a-one"]);
    });

    it("clicking a checked overlay disables it (does not affect siblings)", async () => {
      const user = userEvent.setup();
      setEnabledOverlays(["a-one", "a-two"]);
      render(<GeoJSONOverlayButton />);

      await user.click(
        screen.getByRole("button", { name: /geojson overlays/i }),
      );
      await user.click(screen.getByRole("checkbox", { name: "Overlay A1" }));

      expect(
        useSettingsStore.getState().settings.map.enabledGeoJSONOverlays,
      ).toEqual(["a-two"]);
    });
  });
});

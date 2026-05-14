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

import type { Decoders } from "@acarshub/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store/useAppStore";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { MapControls } from "../MapControls";

// Mock heavy children — they have their own test files. We just need to
// confirm MapControls *would* render them; we don't re-test their behaviour.
vi.mock("../MapProviderSelector", () => ({
  MapProviderSelector: () => (
    <div data-testid="map-provider-selector-mock">provider</div>
  ),
}));
vi.mock("../GeoJSONOverlayButton", () => ({
  GeoJSONOverlayButton: () => (
    <div data-testid="geojson-overlay-button-mock">geojson</div>
  ),
}));
vi.mock("../MapOverlaysMenu", () => ({
  MapOverlaysMenu: ({
    overlays,
  }: {
    overlays: Array<{ id: string; label: string; active: boolean }>;
  }) => (
    <div data-testid="overlays-menu-mock">
      overlays-menu:{overlays.map((o) => `${o.id}=${o.active}`).join(",")}
    </div>
  ),
}));
vi.mock("../MapFiltersMenu", () => ({
  MapFiltersMenu: ({
    filters,
  }: {
    filters: Array<{ id: string; label: string; active: boolean }>;
  }) => (
    <div data-testid="filters-menu-mock">
      filters-menu:{filters.map((f) => `${f.id}=${f.active}`).join(",")}
    </div>
  ),
}));

function makeDecoders(overrides: Partial<Decoders["adsb"]> = {}): Decoders {
  return {
    acars: true,
    vdlm: false,
    hfdl: false,
    imsl: false,
    irdm: false,
    allow_remote_updates: true,
    adsb: {
      enabled: true,
      lat: 0,
      lon: 0,
      range_rings: true,
      ...overrides,
    },
  };
}

describe("MapControls", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
    useAppStore.setState({ decoders: makeDecoders() });
  });

  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
    useAppStore.setState({ decoders: null });
  });

  describe("Action controls — Pause + Unfollow", () => {
    it("does not render the action group when no callbacks are provided", () => {
      const { container } = render(<MapControls />);
      // Pause/unfollow buttons should be absent
      expect(
        screen.queryByRole("button", { name: /pause updates/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /resume updates/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /unfollow aircraft/i }),
      ).not.toBeInTheDocument();
      // Sanity: the controls container itself still renders
      expect(container.querySelector(".map-controls")).toBeInTheDocument();
    });

    it("renders the Pause button when onTogglePause is provided", () => {
      render(<MapControls onTogglePause={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: /pause updates/i }),
      ).toBeInTheDocument();
    });

    it("renders the Resume button (and not Pause) when isPaused is true", () => {
      render(<MapControls isPaused onTogglePause={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: /resume updates/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /pause updates/i }),
      ).not.toBeInTheDocument();
    });

    it("invokes onTogglePause when the pause button is clicked", async () => {
      const user = userEvent.setup();
      const onTogglePause = vi.fn();
      render(<MapControls onTogglePause={onTogglePause} />);

      await user.click(screen.getByRole("button", { name: /pause updates/i }));
      expect(onTogglePause).toHaveBeenCalledTimes(1);
    });

    it("renders the Unfollow button only when isFollowingAircraft AND onUnfollowAircraft are both set", () => {
      // Neither
      const { rerender } = render(<MapControls />);
      expect(
        screen.queryByRole("button", { name: /unfollow aircraft/i }),
      ).not.toBeInTheDocument();

      // Only callback (no following) — still hidden
      rerender(<MapControls onUnfollowAircraft={vi.fn()} />);
      expect(
        screen.queryByRole("button", { name: /unfollow aircraft/i }),
      ).not.toBeInTheDocument();

      // Only following (no callback) — still hidden
      rerender(<MapControls isFollowingAircraft />);
      expect(
        screen.queryByRole("button", { name: /unfollow aircraft/i }),
      ).not.toBeInTheDocument();

      // Both — visible
      rerender(
        <MapControls isFollowingAircraft onUnfollowAircraft={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: /unfollow aircraft/i }),
      ).toBeInTheDocument();
    });

    it("invokes onUnfollowAircraft when the unfollow button is clicked", async () => {
      const user = userEvent.setup();
      const onUnfollowAircraft = vi.fn();
      render(
        <MapControls
          isFollowingAircraft
          onUnfollowAircraft={onUnfollowAircraft}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /unfollow aircraft/i }),
      );
      expect(onUnfollowAircraft).toHaveBeenCalledTimes(1);
    });
  });

  describe("Sprite + color-by-decoder toggles", () => {
    it("toggles useSprites in the settings store", async () => {
      const user = userEvent.setup();
      // Default is true — clicking should flip to false
      expect(useSettingsStore.getState().settings.map.useSprites).toBe(true);

      render(<MapControls />);
      await user.click(
        screen.getByRole("button", { name: /aircraft markers/i }),
      );

      expect(useSettingsStore.getState().settings.map.useSprites).toBe(false);
    });

    it("toggles colorByDecoder in the settings store", async () => {
      const user = userEvent.setup();
      expect(useSettingsStore.getState().settings.map.colorByDecoder).toBe(
        false,
      );

      render(<MapControls />);
      await user.click(screen.getByRole("button", { name: /color by/i }));

      expect(useSettingsStore.getState().settings.map.colorByDecoder).toBe(
        true,
      );
    });

    it("reflects current tooltip based on store state", () => {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: { ...s.settings.map, useSprites: false },
        },
      }));

      render(<MapControls />);
      // Tooltip text becomes the accessible name on hover
      expect(
        screen.getByRole("button", { name: /aircraft markers: svg/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Range rings backend gating", () => {
    it("renders the range-rings button when backend allows it", () => {
      useAppStore.setState({
        decoders: makeDecoders({ range_rings: true }),
      });
      render(<MapControls />);
      expect(
        screen.getByRole("button", { name: /show range rings/i }),
      ).toBeInTheDocument();
    });

    it("hides the range-rings button when backend disallows it (privacy)", () => {
      useAppStore.setState({
        decoders: makeDecoders({ range_rings: false }),
      });
      render(<MapControls />);
      expect(
        screen.queryByRole("button", { name: /show range rings/i }),
      ).not.toBeInTheDocument();
    });

    it("defaults to allowed (true) when decoders state is null", () => {
      useAppStore.setState({ decoders: null });
      render(<MapControls />);
      expect(
        screen.getByRole("button", { name: /show range rings/i }),
      ).toBeInTheDocument();
    });

    it("excludes range-rings from the overlays-menu when backend disallows it", () => {
      useAppStore.setState({
        decoders: makeDecoders({ range_rings: false }),
      });
      render(<MapControls />);
      // Mock passes through the overlays array as text; assert range-rings absent
      expect(screen.getByTestId("overlays-menu-mock")).not.toHaveTextContent(
        "range-rings",
      );
    });
  });

  describe("Hey What's That gating", () => {
    it("hides the Hey What's That button when no heywhatsthat_url is configured", () => {
      useAppStore.setState({ decoders: makeDecoders() });
      render(<MapControls />);
      expect(
        screen.queryByRole("button", {
          name: /hey what's that coverage outline/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("shows the Hey What's That button when heywhatsthat_url is configured", () => {
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "https://x/y.geojson" }),
      });
      render(<MapControls />);
      expect(
        screen.getByRole("button", {
          name: /hey what's that coverage outline/i,
        }),
      ).toBeInTheDocument();
    });

    it("excludes heywhatsthat from the overlays-menu when no URL is configured", () => {
      useAppStore.setState({ decoders: makeDecoders() });
      render(<MapControls />);
      expect(screen.getByTestId("overlays-menu-mock")).not.toHaveTextContent(
        "heywhatsthat",
      );
    });
  });

  describe("Weather / Aviation overlay toggles", () => {
    it("toggles NEXRAD in the settings store", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showNexrad;

      await user.click(
        screen.getByRole("button", { name: /show nexrad weather radar/i }),
      );

      expect(useSettingsStore.getState().settings.map.showNexrad).toBe(!before);
    });

    it("toggles RainViewer in the settings store", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showRainViewer;

      await user.click(
        screen.getByRole("button", { name: /show rainviewer radar/i }),
      );

      expect(useSettingsStore.getState().settings.map.showRainViewer).toBe(
        !before,
      );
    });

    it("toggles OpenAIP in the settings store", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showOpenAIP;

      await user.click(
        screen.getByRole("button", { name: /show openaip aviation charts/i }),
      );

      expect(useSettingsStore.getState().settings.map.showOpenAIP).toBe(
        !before,
      );
    });
  });

  describe("Mutually exclusive ACARS ↔ Unread filters", () => {
    it("enabling ACARS filter disables an active Unread filter", async () => {
      const user = userEvent.setup();
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: {
            ...s.settings.map,
            showOnlyAcars: false,
            showOnlyUnread: true,
          },
        },
      }));

      render(<MapControls />);
      await user.click(
        screen.getByRole("button", { name: /show only aircraft with acars/i }),
      );

      const state = useSettingsStore.getState().settings.map;
      expect(state.showOnlyAcars).toBe(true);
      expect(state.showOnlyUnread).toBe(false);
    });

    it("enabling Unread filter disables an active ACARS filter", async () => {
      const user = userEvent.setup();
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: {
            ...s.settings.map,
            showOnlyAcars: true,
            showOnlyUnread: false,
          },
        },
      }));

      render(<MapControls />);
      await user.click(
        screen.getByRole("button", {
          name: /show only aircraft with unread messages/i,
        }),
      );

      const state = useSettingsStore.getState().settings.map;
      expect(state.showOnlyUnread).toBe(true);
      expect(state.showOnlyAcars).toBe(false);
    });

    it("disabling ACARS does not touch Unread", async () => {
      const user = userEvent.setup();
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: {
            ...s.settings.map,
            showOnlyAcars: true,
            showOnlyUnread: false,
          },
        },
      }));

      render(<MapControls />);
      await user.click(
        screen.getByRole("button", { name: /show only aircraft with acars/i }),
      );

      const state = useSettingsStore.getState().settings.map;
      expect(state.showOnlyAcars).toBe(false);
      expect(state.showOnlyUnread).toBe(false);
    });

    it("disabling Unread does not touch ACARS", async () => {
      const user = userEvent.setup();
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: {
            ...s.settings.map,
            showOnlyAcars: false,
            showOnlyUnread: true,
          },
        },
      }));

      render(<MapControls />);
      await user.click(
        screen.getByRole("button", {
          name: /show only aircraft with unread messages/i,
        }),
      );

      const state = useSettingsStore.getState().settings.map;
      expect(state.showOnlyUnread).toBe(false);
      expect(state.showOnlyAcars).toBe(false);
    });
  });

  describe("Single-aircraft filter toggles (military / interesting / PIA / LADD)", () => {
    it("toggles military filter", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showOnlyMilitary;

      await user.click(
        screen.getByRole("button", { name: /show only military aircraft/i }),
      );

      expect(useSettingsStore.getState().settings.map.showOnlyMilitary).toBe(
        !before,
      );
    });

    it("toggles interesting filter", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before =
        useSettingsStore.getState().settings.map.showOnlyInteresting;

      await user.click(
        screen.getByRole("button", {
          name: /show only interesting aircraft/i,
        }),
      );

      expect(useSettingsStore.getState().settings.map.showOnlyInteresting).toBe(
        !before,
      );
    });

    it("toggles PIA filter", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showOnlyPIA;

      await user.click(
        screen.getByRole("button", { name: /show only pia aircraft/i }),
      );

      expect(useSettingsStore.getState().settings.map.showOnlyPIA).toBe(
        !before,
      );
    });

    it("toggles LADD filter", async () => {
      const user = userEvent.setup();
      render(<MapControls />);
      const before = useSettingsStore.getState().settings.map.showOnlyLADD;

      await user.click(
        screen.getByRole("button", { name: /show only ladd aircraft/i }),
      );

      expect(useSettingsStore.getState().settings.map.showOnlyLADD).toBe(
        !before,
      );
    });
  });

  describe("Child component composition", () => {
    it("renders the map provider selector, geojson overlay button, overlays menu, and filters menu", () => {
      render(<MapControls />);
      expect(
        screen.getByTestId("map-provider-selector-mock"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("geojson-overlay-button-mock"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("overlays-menu-mock")).toBeInTheDocument();
      expect(screen.getByTestId("filters-menu-mock")).toBeInTheDocument();
    });

    it("forwards active state of overlays into the overlays menu", () => {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: { ...s.settings.map, showNexrad: true, showOpenAIP: false },
        },
      }));

      render(<MapControls />);
      const menu = screen.getByTestId("overlays-menu-mock");
      expect(menu).toHaveTextContent("nexrad=true");
      expect(menu).toHaveTextContent("openaip=false");
    });

    it("forwards active state of filters into the filters menu", () => {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          map: {
            ...s.settings.map,
            showOnlyMilitary: true,
            showOnlyLADD: false,
          },
        },
      }));

      render(<MapControls />);
      const menu = screen.getByTestId("filters-menu-mock");
      expect(menu).toHaveTextContent("military=true");
      expect(menu).toHaveTextContent("ladd=false");
    });
  });
});

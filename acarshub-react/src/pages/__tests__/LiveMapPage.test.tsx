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

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { ADSBAircraft, ADSBData } from "../../types";
import { LiveMapPage } from "../LiveMapPage";

// ---------------------------------------------------------------------------
// Mocks
//
// Strategy: keep the Zustand stores (useAppStore, useSettingsStore) real so
// state-driven behaviours (sidebar width persistence, pause persistence,
// theme-aware provider badge) exercise production code.  Mock only the
// heavy/imperative bits: the MapLibre-backed <MapComponent>, side controls,
// the Socket.IO service, and react-map-gl's MapRef so flyTo() can be spied on.
// ---------------------------------------------------------------------------

// Capture mapRef.flyTo / getMap / getMap().flyTo calls so the URL-focus and
// follow-aircraft effects can be asserted without a real map.
//
// vi.hoisted is required because vi.mock(...) factories are hoisted to the top
// of the file by Vitest's transform; module-scope `const` declarations would
// therefore be in the temporal dead zone when the factory runs.
const { flyToSpy, getMapFlyToSpy, fakeGetMap, notifyPageChangeSpy } =
  vi.hoisted(() => {
    const flyToSpy = vi.fn();
    const getMapFlyToSpy = vi.fn();
    return {
      flyToSpy,
      getMapFlyToSpy,
      fakeGetMap: vi.fn(() => ({ flyTo: getMapFlyToSpy })),
      notifyPageChangeSpy: vi.fn(),
    };
  });

// MapComponent props captured across renders (also hoisted-safe).
const { capturedMapProps } = vi.hoisted(() => ({
  capturedMapProps: [] as Array<Record<string, unknown>>,
}));

// Captures so tests can drive MapComponent callbacks (onLoad, onViewStateChange,
// onFollowAircraft, onViewportBoundsChange) and inspect props on every render.
type MapProps = {
  mapRef: React.MutableRefObject<unknown>;
  onLoad?: () => void;
  onViewStateChange?: (vs: { zoom: number }) => void;
  onFollowAircraft?: (hex: string | null) => void;
  onViewportBoundsChange?: (bounds: unknown) => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
  aircraft?: Array<{ hex: string; lat?: number; lon?: number }>;
  className?: string;
};

vi.mock("../../components/Map", () => ({
  MapComponent: (props: MapProps) => {
    capturedMapProps.push(props as unknown as Record<string, unknown>);
    // Install the fake MapRef API on the parent's ref so flyTo() works.
    if (props.mapRef && typeof props.mapRef === "object") {
      (props.mapRef as { current: unknown }).current = {
        flyTo: flyToSpy,
        getMap: fakeGetMap,
      };
    }
    return (
      <div
        data-testid="map-component"
        data-loaded={props.className?.includes("loaded") ? "true" : "false"}
        data-paused={String(props.isPaused)}
        data-aircraft-count={props.aircraft?.length ?? 0}
      >
        Map ({props.aircraft?.length ?? 0} aircraft)
      </div>
    );
  },
  MapControls: ({
    isPaused,
    onTogglePause,
    isFollowingAircraft,
    onUnfollowAircraft,
  }: {
    isPaused: boolean;
    onTogglePause: () => void;
    isFollowingAircraft: boolean;
    onUnfollowAircraft: () => void;
  }) => (
    <div data-testid="map-controls">
      <button
        type="button"
        data-testid="map-controls-pause"
        data-paused={String(isPaused)}
        onClick={onTogglePause}
      >
        {isPaused ? "Resume" : "Pause"}
      </button>
      {isFollowingAircraft && (
        <button
          type="button"
          data-testid="map-controls-unfollow"
          onClick={onUnfollowAircraft}
        >
          Unfollow
        </button>
      )}
    </div>
  ),
  MapLegend: () => <div data-testid="map-legend">Legend</div>,
}));

// AircraftList is a deep component (its own tree).  Mock to a flat list so the
// list↔map interactions (click → flyTo, hover → highlight, pause toggle,
// collapse toggle) can be asserted without rendering the real list.
type AircraftListProps = {
  aircraft: Array<{ hex: string; flight?: string; lat?: number; lon?: number }>;
  onAircraftClick: (a: AircraftListProps["aircraft"][number]) => void;
  onAircraftHover: (a: AircraftListProps["aircraft"][number] | null) => void;
  hoveredAircraft: string | null;
  isPaused: boolean;
  onPauseToggle: () => void;
  onCollapseToggle: () => void;
};
vi.mock("../../components/Map/AircraftList", () => ({
  AircraftList: (props: AircraftListProps) => (
    <div
      data-testid="aircraft-list"
      data-hovered={props.hoveredAircraft ?? ""}
      data-paused={String(props.isPaused)}
      data-count={props.aircraft.length}
    >
      <button
        type="button"
        data-testid="aircraft-list-pause"
        onClick={props.onPauseToggle}
      >
        toggle pause
      </button>
      <button
        type="button"
        data-testid="aircraft-list-collapse"
        onClick={props.onCollapseToggle}
      >
        collapse
      </button>
      {props.aircraft.map((a) => (
        <button
          type="button"
          key={a.hex}
          data-testid={`aircraft-row-${a.hex}`}
          onClick={() => props.onAircraftClick(a)}
          onMouseEnter={() => props.onAircraftHover(a)}
          onMouseLeave={() => props.onAircraftHover(null)}
        >
          {a.flight ?? a.hex}
        </button>
      ))}
    </div>
  ),
}));

// Socket service is imperative — page calls notifyPageChange in an effect.
// Mock it so we can assert the notification and skip the real connection.
vi.mock("../../services/socket", () => ({
  socketService: {
    notifyPageChange: notifyPageChangeSpy,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isInitialized: vi.fn(() => false),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render LiveMapPage inside a MemoryRouter (required for useSearchParams). */
function renderPage(initialPath = "/map") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LiveMapPage />
    </MemoryRouter>,
  );
}

/** Build a minimal ADS-B aircraft fixture. */
function makeAircraft(
  hex: string,
  overrides: Partial<ADSBAircraft> = {},
): ADSBAircraft {
  return {
    hex,
    flight: `FL${hex}`,
    lat: 40 + parseInt(hex.slice(0, 2), 16) / 255,
    lon: -100 + parseInt(hex.slice(2, 4), 16) / 255,
    alt_baro: 35000,
    gs: 450,
    track: 90,
    seen: 1,
    ...overrides,
  };
}

/** Seed the app store with ADS-B aircraft and clear messageGroups. Wraps in
 *  act() so React flushes consumer subscribers within the same tick. */
function seedAircraft(aircraft: ADSBAircraft[]): void {
  act(() => {
    useAppStore.setState({
      adsbAircraft: {
        now: Date.now() / 1000,
        aircraft,
      } satisfies ADSBData,
      messageGroups: new Map(),
    });
  });
}

/** Fire the MapComponent.onLoad callback inside act() so the resulting state
 *  updates (isMapLoaded → true) are flushed before assertions run. */
function fireMapLoad(): void {
  act(() => {
    latestMapProps().onLoad?.();
  });
}

/** Fire the MapComponent.onFollowAircraft callback inside act(). */
function fireFollow(hex: string | null): void {
  act(() => {
    latestMapProps().onFollowAircraft?.(hex);
  });
}

/** Fire MapComponent.onViewStateChange inside act(). */
function fireZoom(zoom: number): void {
  act(() => {
    latestMapProps().onViewStateChange?.({ zoom } as never);
  });
}

/** Return the most-recent props captured from MapComponent. */
function latestMapProps(): MapProps {
  const props = capturedMapProps[capturedMapProps.length - 1];
  if (!props) throw new Error("MapComponent never rendered");
  return props as unknown as MapProps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveMapPage", () => {
  beforeEach(() => {
    // Reset captured spies/props between tests.
    capturedMapProps.length = 0;
    flyToSpy.mockClear();
    getMapFlyToSpy.mockClear();
    fakeGetMap.mockClear();
    notifyPageChangeSpy.mockClear();

    // Reset app-store slices touched by the page.
    useAppStore.setState({
      adsbAircraft: null,
      messageGroups: new Map(),
      currentPage: "",
    });

    // Reset settings-store map slice to its defaults so each test starts in a
    // known state for sidebar width / collapse / provider.
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        map: {
          ...state.settings.map,
          provider: "carto_dark_all",
          userSelectedProvider: false,
          mapSidebarWidth: 408,
          mapSidebarCollapsed: false,
        },
      },
    }));

    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------

  describe("initial render", () => {
    it("renders the map, sidebar list, and resize separator", () => {
      renderPage();
      expect(screen.getByTestId("map-component")).toBeInTheDocument();
      expect(screen.getByTestId("aircraft-list")).toBeInTheDocument();
      expect(
        screen.getByRole("separator", { name: /sidebar resize/i }),
      ).toBeInTheDocument();
    });

    it("shows the loading overlay until MapComponent fires onLoad", () => {
      renderPage();
      expect(screen.getByText(/loading map/i)).toBeInTheDocument();
      expect(screen.queryByTestId("map-controls")).not.toBeInTheDocument();
      expect(screen.queryByTestId("map-legend")).not.toBeInTheDocument();
    });

    it("hides the loading overlay and shows controls + legend after onLoad", () => {
      renderPage();
      fireMapLoad();
      expect(screen.queryByText(/loading map/i)).not.toBeInTheDocument();
      expect(screen.getByTestId("map-controls")).toBeInTheDocument();
      expect(screen.getByTestId("map-legend")).toBeInTheDocument();
    });

    it("registers the page with the socket service on mount", () => {
      renderPage();
      expect(notifyPageChangeSpy).toHaveBeenCalledWith("Live Map");
    });

    it("sets the current page in the app store on mount", () => {
      renderPage();
      expect(useAppStore.getState().currentPage).toBe("Live Map");
    });

    it("renders the provider name and theme badge for theme-aware providers", () => {
      renderPage();
      fireMapLoad();
      // userSelectedProvider=false → the 🎨 theme badge should render.
      expect(screen.getByText(/provider:/i)).toBeInTheDocument();
      expect(screen.getByText(/🎨/)).toBeInTheDocument();
    });

    it("hides the theme badge when the user has explicitly chosen a provider", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          map: {
            ...state.settings.map,
            provider: "carto_dark_all",
            userSelectedProvider: true,
          },
        },
      }));
      renderPage();
      fireMapLoad();
      expect(screen.queryByText(/🎨/)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Aircraft pairing → MapComponent.aircraft prop
  // -------------------------------------------------------------------------

  describe("aircraft data flow", () => {
    it("passes paired aircraft into MapComponent and AircraftList", () => {
      seedAircraft([makeAircraft("ABC123"), makeAircraft("DEF456")]);
      renderPage();
      const map = screen.getByTestId("map-component");
      expect(map.getAttribute("data-aircraft-count")).toBe("2");
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-count"),
      ).toBe("2");
    });

    it("updates the displayed aircraft list when the store changes", () => {
      seedAircraft([makeAircraft("ABC123")]);
      renderPage();
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-count"),
      ).toBe("1");

      seedAircraft([
        makeAircraft("ABC123"),
        makeAircraft("DEF456"),
        makeAircraft("FFF000"),
      ]);
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-count"),
      ).toBe("3");
    });
  });

  // -------------------------------------------------------------------------
  // Pause behaviour
  // -------------------------------------------------------------------------

  describe("pause", () => {
    it("toggles pause when the AircraftList pause button is clicked", async () => {
      const user = userEvent.setup();
      renderPage();
      fireMapLoad();
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("false");

      await user.click(screen.getByTestId("aircraft-list-pause"));

      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("true");
      expect(screen.getByText(/updates paused/i)).toBeInTheDocument();
    });

    it("persists pause state to localStorage", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("aircraft-list-pause"));
      expect(localStorage.getItem("liveMap.isPaused")).toBe("true");
    });

    it("reads the pause state back from localStorage on mount", () => {
      localStorage.setItem("liveMap.isPaused", "true");
      renderPage();
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("true");
    });

    it("toggles pause via the 'p' keyboard shortcut", () => {
      renderPage();
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("false");

      fireEvent.keyDown(document, { key: "p" });

      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("true");

      // Capital P also toggles (back to unpaused).
      fireEvent.keyDown(document, { key: "P" });
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("false");
    });

    it("regression: 'p' is ignored when focus is in a text input", () => {
      renderPage();
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, { key: "p" });

      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-paused"),
      ).toBe("false");

      document.body.removeChild(input);
    });

    it("freezes the displayed aircraft snapshot while paused", () => {
      seedAircraft([makeAircraft("ABC123"), makeAircraft("DEF456")]);
      renderPage();

      fireEvent.keyDown(document, { key: "p" });
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-count"),
      ).toBe("2");

      // Add a new aircraft to the store; sidebar list and map should still
      // show the frozen count of 2.
      seedAircraft([
        makeAircraft("ABC123"),
        makeAircraft("DEF456"),
        makeAircraft("AAAAAA"),
      ]);

      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-count"),
      ).toBe("2");
      expect(
        screen.getByTestId("map-component").getAttribute("data-aircraft-count"),
      ).toBe("2");
    });
  });

  // -------------------------------------------------------------------------
  // Sidebar collapse / resize
  // -------------------------------------------------------------------------

  describe("sidebar", () => {
    it("collapses the sidebar and shows the expand button", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("aircraft-list-collapse"));

      expect(screen.queryByTestId("aircraft-list")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /expand sidebar/i }),
      ).toBeInTheDocument();
    });

    it("persists the collapsed state to the settings store", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("aircraft-list-collapse"));
      expect(useSettingsStore.getState().settings.map.mapSidebarCollapsed).toBe(
        true,
      );
    });

    it("expands the sidebar again when the expand button is clicked", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("aircraft-list-collapse"));
      await user.click(screen.getByRole("button", { name: /expand sidebar/i }));
      expect(screen.getByTestId("aircraft-list")).toBeInTheDocument();
    });

    it("hides the resize separator while the sidebar is collapsed", async () => {
      const user = userEvent.setup();
      renderPage();
      expect(screen.getByRole("separator")).toBeInTheDocument();
      await user.click(screen.getByTestId("aircraft-list-collapse"));
      expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    });

    it("resizes the sidebar via ArrowRight on the separator", () => {
      // Start at minimum so ArrowRight has headroom regardless of dynamic max.
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          map: { ...state.settings.map, mapSidebarWidth: 335 },
        },
      }));
      renderPage();
      const sep = screen.getByRole("separator");
      const initial = Number(sep.getAttribute("aria-valuenow"));
      act(() => {
        fireEvent.keyDown(sep, { key: "ArrowRight" });
      });
      const after = Number(
        screen.getByRole("separator").getAttribute("aria-valuenow"),
      );
      expect(after).toBeGreaterThan(initial);
    });

    it("resizes the sidebar via ArrowLeft, clamped to the minimum", () => {
      renderPage();
      // Press Home to slam to minimum, then ArrowLeft (should stay at min).
      const sep = screen.getByRole("separator");
      fireEvent.keyDown(sep, { key: "Home" });
      const atMin = Number(
        screen.getByRole("separator").getAttribute("aria-valuenow"),
      );
      fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
      const after = Number(
        screen.getByRole("separator").getAttribute("aria-valuenow"),
      );
      expect(after).toBe(atMin);
    });

    it("commits the new width to the settings store on keyboard resize", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          map: { ...state.settings.map, mapSidebarWidth: 335 },
        },
      }));
      renderPage();
      const before = useSettingsStore.getState().settings.map.mapSidebarWidth;
      act(() => {
        fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
      });
      const after = useSettingsStore.getState().settings.map.mapSidebarWidth;
      expect(after).not.toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // Aircraft click / hover / follow
  // -------------------------------------------------------------------------

  describe("aircraft interactions", () => {
    it("flies the map to the clicked aircraft", async () => {
      const user = userEvent.setup();
      seedAircraft([makeAircraft("ABC123", { lat: 41, lon: -101 })]);
      renderPage();
      fireMapLoad();

      await user.click(screen.getByTestId("aircraft-row-ABC123"));

      expect(flyToSpy).toHaveBeenCalledTimes(1);
      const call = flyToSpy.mock.calls[0]?.[0] as {
        center: [number, number];
        zoom: number;
      };
      expect(call.center).toEqual([-101, 41]);
      expect(call.zoom).toBe(10);
    });

    it("does not fly to aircraft without coordinates", async () => {
      const user = userEvent.setup();
      seedAircraft([
        makeAircraft("ABC123", { lat: undefined, lon: undefined }),
      ]);
      renderPage();
      fireMapLoad();
      await user.click(screen.getByTestId("aircraft-row-ABC123"));
      expect(flyToSpy).not.toHaveBeenCalled();
    });

    it("propagates the hovered hex into MapComponent props", async () => {
      const user = userEvent.setup();
      seedAircraft([makeAircraft("ABC123")]);
      renderPage();

      await user.hover(screen.getByTestId("aircraft-row-ABC123"));
      // hoveredAircraft on AircraftList is updated immediately; assert via list.
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-hovered"),
      ).toBe("ABC123");

      await user.unhover(screen.getByTestId("aircraft-row-ABC123"));
      expect(
        screen.getByTestId("aircraft-list").getAttribute("data-hovered"),
      ).toBe("");
    });

    it("shows the Unfollow control after a follow request is made", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 41, lon: -101 })]);
      renderPage();
      fireMapLoad();
      expect(
        screen.queryByTestId("map-controls-unfollow"),
      ).not.toBeInTheDocument();

      // Drive the MapComponent's onFollowAircraft callback directly.
      fireFollow("ABC123");

      expect(screen.getByTestId("map-controls-unfollow")).toBeInTheDocument();
    });

    it("clears the followed aircraft when Unfollow is clicked", async () => {
      const user = userEvent.setup();
      seedAircraft([makeAircraft("ABC123", { lat: 41, lon: -101 })]);
      renderPage();
      fireMapLoad();
      fireFollow("ABC123");

      await user.click(screen.getByTestId("map-controls-unfollow"));

      expect(
        screen.queryByTestId("map-controls-unfollow"),
      ).not.toBeInTheDocument();
    });

    it("stops following an aircraft that disappears from ADS-B", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 41, lon: -101 })]);
      renderPage();
      fireMapLoad();
      fireFollow("ABC123");
      expect(screen.getByTestId("map-controls-unfollow")).toBeInTheDocument();

      // Aircraft leaves the ADS-B feed.
      seedAircraft([makeAircraft("DEF456")]);

      expect(
        screen.queryByTestId("map-controls-unfollow"),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // URL ?aircraft= focus
  // -------------------------------------------------------------------------

  describe("URL aircraft focus", () => {
    it("flies to the aircraft from the ?aircraft= query param after the map loads", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 42, lon: -102 })]);
      renderPage("/map?aircraft=ABC123");

      // Effect is gated on isMapLoaded → fire onLoad to satisfy it.
      fireMapLoad();

      expect(flyToSpy).toHaveBeenCalledTimes(1);
      const call = flyToSpy.mock.calls[0]?.[0] as {
        center: [number, number];
        zoom: number;
      };
      expect(call.center).toEqual([-102, 42]);
      expect(call.zoom).toBe(10);
    });

    it("matches the ?aircraft= param case-insensitively against hex", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 42, lon: -102 })]);
      renderPage("/map?aircraft=abc123");
      fireMapLoad();
      expect(flyToSpy).toHaveBeenCalledTimes(1);
    });

    it("does nothing when no matching aircraft is present", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 42, lon: -102 })]);
      renderPage("/map?aircraft=ZZZZZZ");
      fireMapLoad();
      expect(flyToSpy).not.toHaveBeenCalled();
    });

    it("starts following the focused aircraft", () => {
      seedAircraft([makeAircraft("ABC123", { lat: 42, lon: -102 })]);
      renderPage("/map?aircraft=ABC123");
      fireMapLoad();
      // Follow indicator should be present (handled by MapControls mock).
      expect(screen.getByTestId("map-controls-unfollow")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Zoom freeze
  // -------------------------------------------------------------------------

  describe("zoom freezing", () => {
    it("freezes the displayed aircraft set during a zoom and thaws after the cooldown", () => {
      vi.useFakeTimers();
      seedAircraft([makeAircraft("ABC123"), makeAircraft("DEF456")]);
      renderPage();
      fireMapLoad();

      // Prime the previous-zoom ref.
      fireZoom(5);
      // Now trigger a zoom change.
      fireZoom(7);

      // Add a new aircraft mid-zoom – display count should NOT update yet.
      seedAircraft([
        makeAircraft("ABC123"),
        makeAircraft("DEF456"),
        makeAircraft("AAAAAA"),
      ]);

      expect(
        screen.getByTestId("map-component").getAttribute("data-aircraft-count"),
      ).toBe("2");

      // Cooldown is 200 ms — advance and assert the new count appears.
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(
        screen.getByTestId("map-component").getAttribute("data-aircraft-count"),
      ).toBe("3");
    });
  });
});

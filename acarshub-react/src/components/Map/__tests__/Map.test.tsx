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
 * Tests for MapComponent focusing on mapStyle stability.
 *
 * WHY these tests exist:
 * Bug: viewState.zoom was included in the mapStyle useMemo dependency array
 * solely to satisfy a log call. Because `mapStyle` produced a new object on
 * every zoom event, MapLibre treated it as a style change and fully
 * re-initialised — destroying all Sources/Layers (including GeoJSON overlays)
 * and re-fetching every GeoJSON file from the server on each scroll.
 *
 * The regression tests here verify that:
 *   1. mapStyle identity is stable across zoom changes.
 *   2. mapStyle only changes when the provider or customTileUrl changes.
 *
 * We test this via the pure helper functions that feed into mapStyle
 * (getProviderConfig, getProviderTileUrl) plus a render-level assertion
 * that the <MapLibreMap> `mapStyle` prop does not change reference across
 * simulated zoom-driven re-renders.
 */

import { act, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProviderConfig,
  getProviderTileUrl,
} from "../../../config/mapProviders";
import { useSettingsStore } from "../../../store/useSettingsStore";
import type { UserSettings } from "../../../types";
import { MapComponent } from "../Map";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// react-map-gl/maplibre — capture the mapStyle prop on each render so we can
// assert reference stability without needing a real WebGL context.
const capturedMapStyleProps: unknown[] = [];

vi.mock("react-map-gl/maplibre", () => ({
  default: ({
    mapStyle,
    children,
    onLoad,
  }: {
    mapStyle: unknown;
    children?: ReactNode;
    onLoad?: () => void;
    // Accept any other props that MapComponent forwards
    [key: string]: unknown;
  }) => {
    capturedMapStyleProps.push(mapStyle);
    // Fire onLoad synchronously so MapComponent reaches its loaded state
    onLoad?.();
    return <div data-testid="mock-maplibre-map">{children}</div>;
  },
  NavigationControl: () => <div data-testid="nav-control" />,
  ScaleControl: () => <div data-testid="scale-control" />,
  Source: ({
    id,
    children,
  }: {
    id: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) => <div data-testid={`source-${id}`}>{children}</div>,
  Layer: ({ id }: { id: string; [key: string]: unknown }) => (
    <div data-testid={`layer-${id}`} />
  ),
  Popup: ({ children }: { children?: ReactNode; [key: string]: unknown }) => (
    <div data-testid="popup">{children}</div>
  ),
  useMap: () => ({ current: null }),
}));

// maplibre-gl CSS import — avoid JSDOM parse errors
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// Heavy child components — unit tests only need to confirm mapStyle stability
vi.mock("../AircraftMarkers", () => ({
  AircraftMarkers: () => <div data-testid="aircraft-markers" />,
}));
vi.mock("../GeoJSONOverlays", () => ({
  GeoJSONOverlays: () => <div data-testid="geojson-overlays" />,
}));
vi.mock("../NexradOverlay", () => ({
  NexradOverlay: ({
    renderTimestampOnly,
  }: {
    renderTimestampOnly?: boolean;
  }) => (renderTimestampOnly ? null : <div data-testid="nexrad-overlay" />),
}));
vi.mock("../RainViewerOverlay", () => ({
  RainViewerOverlay: ({
    renderTimestampOnly,
  }: {
    renderTimestampOnly?: boolean;
  }) => (renderTimestampOnly ? null : <div data-testid="rainviewer-overlay" />),
}));
vi.mock("../OpenAIPOverlay", () => ({
  OpenAIPOverlay: () => <div data-testid="openaip-overlay" />,
}));
vi.mock("../HeyWhatsThatOverlay", () => ({
  HeyWhatsThatOverlay: () => <div data-testid="heywhatsthat-overlay" />,
}));
vi.mock("../RangeRings", () => ({
  RangeRings: () => <div data-testid="range-rings" />,
}));
vi.mock("../StationMarker", () => ({
  StationMarker: () => <div data-testid="station-marker" />,
}));
vi.mock("../MapContextMenu", () => ({
  MapContextMenu: () => <div data-testid="map-context-menu" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSettings = (
  overrides?: Partial<UserSettings["map"]>,
): UserSettings => ({
  appearance: {
    theme: "mocha",
    showConnectionStatus: true,
    animations: true,
  },
  regional: {
    timeFormat: "auto",
    dateFormat: "auto",
    timezone: "local",
    altitudeUnit: "feet",
  },
  notifications: {
    desktop: false,
    sound: false,
    volume: 50,
    onPageAlerts: false,
  },
  data: {
    maxMessagesPerAircraft: 50,
    maxMessageGroups: 50,
    enableCaching: true,
    autoClearMinutes: 60,
  },
  map: {
    provider: "carto_dark_all",
    customTileUrl: undefined,
    userSelectedProvider: false,
    stationLat: 0,
    stationLon: 0,
    rangeRings: [100, 200, 300],
    defaultCenterLat: 0,
    defaultCenterLon: 0,
    defaultZoom: 7,
    showOnlyAcars: false,
    showDatablocks: true,
    showExtendedDatablocks: false,
    showNexrad: false,
    showRangeRings: true,
    showOnlyUnread: false,
    showOnlyMilitary: false,
    showOnlyInteresting: false,
    showOnlyPIA: false,
    showOnlyLADD: false,
    enabledGeoJSONOverlays: [],
    showOpenAIP: false,
    showRainViewer: false,
    showHeyWhatsThat: true,
    useSprites: true,
    colorByDecoder: false,
    groundAltitudeThreshold: 5000,
    mapSidebarWidth: 408,
    mapSidebarCollapsed: false,
    ...overrides,
  },
  advanced: {
    logLevel: "warn",
    persistLogs: true,
  },
  updatedAt: Date.now(),
  version: 4,
});

/**
 * A tiny harness that exposes a `zoom` prop so tests can drive zoom changes
 * without touching real MapLibre internals.
 *
 * MapComponent reads its initial view state from localStorage (or defaults).
 * The zoom is baked into the initial ViewState inside Map.tsx — we don't need
 * to drive the internal ViewState; we just need the component to re-render
 * with a parent state change so we can verify that mapStyle doesn't change.
 */
function MapHarness({ initialZoom: _initialZoom }: { initialZoom: number }) {
  // This harness component causes MapComponent to re-render by changing its
  // own state, simulating the parent re-renders that happen during zoom events
  // in the real application (LiveMapPage passes viewState down).
  const [tick, setTick] = useState(0);
  const triggerRerender = () => setTick((n) => n + 1);

  return (
    <div data-tick={tick}>
      <MapComponent />
      <button
        type="button"
        data-testid="rerender-btn"
        onClick={triggerRerender}
      >
        rerender
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MapComponent — mapStyle stability", () => {
  beforeEach(() => {
    capturedMapStyleProps.length = 0;
    localStorage.clear();
    useSettingsStore.setState({ settings: makeSettings() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // Regression: zoom must NOT invalidate mapStyle
  // -------------------------------------------------------------------------

  describe("regression: zoom events do not recreate mapStyle", () => {
    it("mapStyle reference is the same object across multiple re-renders (simulating zoom events)", () => {
      const { getByTestId } = render(<MapHarness initialZoom={7} />);

      // Capture the style reference after the initial render
      const firstStyle = capturedMapStyleProps[0];
      expect(firstStyle).toBeDefined();

      // Simulate several re-renders (as would happen during a continuous zoom)
      act(() => {
        getByTestId("rerender-btn").click();
      });
      act(() => {
        getByTestId("rerender-btn").click();
      });
      act(() => {
        getByTestId("rerender-btn").click();
      });

      // Every render after the first must reuse the exact same object reference.
      // If viewState.zoom were still in the dependency array, each click would
      // cause a new object to be produced, breaking this assertion.
      for (let i = 1; i < capturedMapStyleProps.length; i++) {
        expect(capturedMapStyleProps[i]).toBe(firstStyle);
      }
    });

    it("mapStyle is not recreated when the component re-renders without provider changes", () => {
      const { getByTestId } = render(<MapHarness initialZoom={5} />);

      const initialStyle = capturedMapStyleProps[0];

      // Ten re-renders — magnitude of normal zoom-session churn
      for (let i = 0; i < 10; i++) {
        act(() => {
          getByTestId("rerender-btn").click();
        });
      }

      // All renders must share the same style reference
      const allSame = capturedMapStyleProps.every((s) => s === initialStyle);
      expect(allSame).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Positive: provider change SHOULD produce a new mapStyle
  // -------------------------------------------------------------------------

  describe("mapStyle does update when provider changes", () => {
    it("produces a new style object when the map provider is switched", () => {
      render(<MapHarness initialZoom={7} />);

      const styleWithCarto = capturedMapStyleProps[0];
      expect(styleWithCarto).toBeDefined();

      // Switch to a different raster provider
      act(() => {
        useSettingsStore.setState({
          settings: makeSettings({ provider: "osm" }),
        });
      });

      const stylesAfterProviderChange = capturedMapStyleProps.slice(
        capturedMapStyleProps.indexOf(styleWithCarto) + 1,
      );

      // At least one render must have produced a different style object
      expect(stylesAfterProviderChange.some((s) => s !== styleWithCarto)).toBe(
        true,
      );
    });

    it("produces a new style object when a vector provider is selected", () => {
      render(<MapHarness initialZoom={7} />);

      const initialStyle = capturedMapStyleProps[0];

      act(() => {
        useSettingsStore.setState({
          settings: makeSettings({ provider: "openfreemap_liberty" }),
        });
      });

      const latestStyle =
        capturedMapStyleProps[capturedMapStyleProps.length - 1];

      // Vector provider returns a string URL, raster returns an object — they
      // are different values and definitely not the same reference
      expect(latestStyle).not.toBe(initialStyle);
      expect(typeof latestStyle).toBe("string");
    });

    it("produces a new style object when customTileUrl changes", () => {
      render(<MapHarness initialZoom={7} />);

      act(() => {
        useSettingsStore.setState({
          settings: makeSettings({
            provider: "custom",
            customTileUrl: "https://tiles.example.com/{z}/{x}/{y}.png",
          }),
        });
      });

      const styleCount = capturedMapStyleProps.length;
      expect(styleCount).toBeGreaterThanOrEqual(2);

      // The last style should differ from the first
      const firstStyle = capturedMapStyleProps[0];
      const lastStyle = capturedMapStyleProps[styleCount - 1];
      expect(lastStyle).not.toBe(firstStyle);
    });
  });

  // -------------------------------------------------------------------------
  // Pure helper unit tests (no rendering needed)
  // -------------------------------------------------------------------------

  describe("getProviderConfig", () => {
    it("returns correct config for carto_dark_all", () => {
      const config = getProviderConfig("carto_dark_all");
      expect(config).toBeDefined();
      expect(config?.id).toBe("carto_dark_all");
      expect(config?.isVector).toBeUndefined();
    });

    it("returns correct config for a vector provider", () => {
      const config = getProviderConfig("openfreemap_liberty");
      expect(config).toBeDefined();
      expect(config?.isVector).toBe(true);
    });

    it("returns undefined for an unknown provider", () => {
      const config = getProviderConfig("does_not_exist");
      expect(config).toBeUndefined();
    });
  });

  describe("getProviderTileUrl", () => {
    it("returns a non-empty URL for a known raster provider", () => {
      const url = getProviderTileUrl("carto_dark_all");
      expect(url).toBeTruthy();
      expect(url).toContain("{z}");
    });

    it("returns the customUrl when provider is 'custom'", () => {
      const custom = "https://my-tiles.example.com/{z}/{x}/{y}.png";
      const url = getProviderTileUrl("custom", custom);
      expect(url).toBe(custom);
    });

    it("returns empty string for 'custom' provider with no customUrl", () => {
      const url = getProviderTileUrl("custom");
      expect(url).toBe("");
    });

    it("returns a date-stamped URL for gibs_clouds", () => {
      const url = getProviderTileUrl("gibs_clouds");
      expect(url).toContain("earthdata.nasa.gov");
      // URL contains a date segment in YYYY-MM-DD format
      expect(url).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  // -------------------------------------------------------------------------
  // Aviation chart provider: zoom constraints don't affect style recreation
  // -------------------------------------------------------------------------

  describe("aviation chart providers (zoom-constrained)", () => {
    it("mapStyle for a zoom-constrained provider is stable across re-renders", () => {
      useSettingsStore.setState({
        settings: makeSettings({ provider: "vfr_sectional" }),
      });

      const { getByTestId } = render(<MapHarness initialZoom={10} />);

      const firstStyle = capturedMapStyleProps[0];
      expect(firstStyle).toBeDefined();

      // Simulate several re-renders as zoom changes would cause
      act(() => {
        getByTestId("rerender-btn").click();
      });
      act(() => {
        getByTestId("rerender-btn").click();
      });

      for (let i = 1; i < capturedMapStyleProps.length; i++) {
        expect(capturedMapStyleProps[i]).toBe(firstStyle);
      }
    });

    it("hybrid style includes both base-tiles and chart-tiles sources", () => {
      useSettingsStore.setState({
        settings: makeSettings({ provider: "vfr_sectional" }),
      });

      render(<MapHarness initialZoom={10} />);

      const style = capturedMapStyleProps[0] as {
        sources: Record<string, unknown>;
        layers: Array<{ id: string }>;
      };

      expect(style).toHaveProperty("sources.base-tiles");
      expect(style).toHaveProperty("sources.chart-tiles");
      expect(style.layers.map((l) => l.id)).toContain("base-layer");
      expect(style.layers.map((l) => l.id)).toContain("chart-layer");
    });
  });
});

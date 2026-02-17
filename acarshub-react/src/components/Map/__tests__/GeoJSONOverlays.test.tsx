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

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as geojsonConfig from "../../../config/geojsonOverlays";
import { useSettingsStore } from "../../../store/useSettingsStore";
import type { UserSettings } from "../../../types";
import { GeoJSONOverlays } from "../GeoJSONOverlays";

// Default settings for tests
const getTestSettings = (overrides?: Partial<UserSettings>): UserSettings => ({
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
    useSprites: true,
    colorByDecoder: false,
    groundAltitudeThreshold: 5000,
  },
  advanced: {
    logLevel: "warn",
    persistLogs: true,
  },
  updatedAt: Date.now(),
  version: 4,
  ...overrides,
});

// Mock react-map-gl/maplibre
vi.mock("react-map-gl/maplibre", () => ({
  Source: ({
    id,
    children,
    ...props
  }: {
    id: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div data-testid={`source-${id}`} data-source-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
  Layer: ({ id, ...props }: { id: string; [key: string]: unknown }) => (
    <div data-testid={`layer-${id}`} data-layer-props={JSON.stringify(props)} />
  ),
}));

describe("GeoJSONOverlays", () => {
  beforeEach(() => {
    // Reset settings store with complete settings structure
    useSettingsStore.setState({
      settings: getTestSettings(),
    });

    // Spy on getOverlayById to verify it's called correctly
    vi.spyOn(geojsonConfig, "getOverlayById");
  });

  describe("path resolution", () => {
    it("should render no overlays when none are enabled", () => {
      const { container } = render(<GeoJSONOverlays />);
      expect(container.children).toHaveLength(0);
    });

    it("should resolve GeoJSON paths relative to BASE_URL", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
        color: "#00ff00",
        opacity: 0.7,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      // Find the source element
      const source = getByTestId("source-test_overlay-source");
      const sourceProps = JSON.parse(
        source.getAttribute("data-source-props") || "{}",
      );

      // Verify the path has been resolved (should not start with just "/geojson")
      // In tests, BASE_URL is typically "/" or "./", so we check it's been processed
      expect(sourceProps.type).toBe("geojson");
      expect(sourceProps.data).toBeDefined();

      // The path should be resolved via resolveBasePath
      // With BASE_URL = "/" it should remain "/geojson/test.geojson"
      // With BASE_URL = "./" it should become "./geojson/test.geojson"
      // With BASE_URL = "/acarshub-test/" it should become "/acarshub-test/geojson/test.geojson"
      const baseUrl = import.meta.env.BASE_URL;
      if (baseUrl === "./") {
        expect(sourceProps.data).toBe("./geojson/test.geojson");
      } else if (baseUrl === "/") {
        expect(sourceProps.data).toBe("/geojson/test.geojson");
      } else {
        // Subpath deployment - should include base path
        expect(sourceProps.data).toContain("geojson/test.geojson");
        expect(sourceProps.data).not.toMatch(/\/\/+/); // No double slashes
      }
    });

    it("should create fill, line, and circle layers for each overlay", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
        color: "#00ff00",
        opacity: 0.7,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      // Should create three layers: fill, line, circle
      expect(getByTestId("layer-test_overlay-fill")).toBeInTheDocument();
      expect(getByTestId("layer-test_overlay-line")).toBeInTheDocument();
      expect(getByTestId("layer-test_overlay-circle")).toBeInTheDocument();
    });

    it("should apply custom colors and opacity to layers", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
        color: "#ff0000",
        opacity: 0.8,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      const lineLayer = getByTestId("layer-test_overlay-line");
      const lineProps = JSON.parse(
        lineLayer.getAttribute("data-layer-props") || "{}",
      );

      expect(lineProps.paint["line-color"]).toBe("#ff0000");
      expect(lineProps.paint["line-opacity"]).toBe(0.8);

      const fillLayer = getByTestId("layer-test_overlay-fill");
      const fillProps = JSON.parse(
        fillLayer.getAttribute("data-layer-props") || "{}",
      );

      expect(fillProps.paint["fill-color"]).toBe("#ff0000");
      // Fill opacity is 30% of line opacity
      expect(fillProps.paint["fill-opacity"]).toBe(0.24);
    });

    it("should render multiple overlays when multiple are enabled", () => {
      const overlay1 = {
        id: "overlay_1",
        name: "Overlay 1",
        path: "/geojson/overlay1.geojson",
        category: "Test",
        enabled: true,
        color: "#00ff00",
        opacity: 0.7,
      };

      const overlay2 = {
        id: "overlay_2",
        name: "Overlay 2",
        path: "/geojson/overlay2.geojson",
        category: "Test",
        enabled: true,
        color: "#0000ff",
        opacity: 0.5,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockImplementation((id) => {
        if (id === "overlay_1") return overlay1;
        if (id === "overlay_2") return overlay2;
        return undefined;
      });

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["overlay_1", "overlay_2"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      // Both sources should exist
      expect(getByTestId("source-overlay_1-source")).toBeInTheDocument();
      expect(getByTestId("source-overlay_2-source")).toBeInTheDocument();

      // Both should have layers
      expect(getByTestId("layer-overlay_1-line")).toBeInTheDocument();
      expect(getByTestId("layer-overlay_2-line")).toBeInTheDocument();
    });

    it("should skip rendering if overlay config not found", () => {
      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(undefined);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["nonexistent_overlay"],
          },
        }),
      });

      const { container } = render(<GeoJSONOverlays />);

      // Should render nothing
      expect(container.children).toHaveLength(0);
    });

    it("should use default color and opacity if not specified in overlay config", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
        // No color or opacity specified
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      const lineLayer = getByTestId("layer-test_overlay-line");
      const lineProps = JSON.parse(
        lineLayer.getAttribute("data-layer-props") || "{}",
      );

      // Should use defaults
      expect(lineProps.paint["line-color"]).toBe("#00ff00");
      expect(lineProps.paint["line-opacity"]).toBe(0.7);
    });
  });

  describe("layer filters", () => {
    it("should configure line layer to render LineString and Polygon geometries", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      const lineLayer = getByTestId("layer-test_overlay-line");
      const lineProps = JSON.parse(
        lineLayer.getAttribute("data-layer-props") || "{}",
      );

      // Should filter for LineString and Polygon types
      expect(lineProps.filter).toEqual([
        "in",
        ["geometry-type"],
        [
          "literal",
          ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
        ],
      ]);
    });

    it("should configure fill layer to render only Polygon geometries", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      const fillLayer = getByTestId("layer-test_overlay-fill");
      const fillProps = JSON.parse(
        fillLayer.getAttribute("data-layer-props") || "{}",
      );

      // Should filter for Polygon types only
      expect(fillProps.filter).toEqual([
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ]);
    });

    it("should configure circle layer to render only Point geometries", () => {
      const testOverlay = {
        id: "test_overlay",
        name: "Test Overlay",
        path: "/geojson/test.geojson",
        category: "Test",
        enabled: true,
      };

      vi.spyOn(geojsonConfig, "getOverlayById").mockReturnValue(testOverlay);

      useSettingsStore.setState({
        settings: getTestSettings({
          map: {
            ...getTestSettings().map,
            enabledGeoJSONOverlays: ["test_overlay"],
          },
        }),
      });

      const { getByTestId } = render(<GeoJSONOverlays />);

      const circleLayer = getByTestId("layer-test_overlay-circle");
      const circleProps = JSON.parse(
        circleLayer.getAttribute("data-layer-props") || "{}",
      );

      // Should filter for Point types only
      expect(circleProps.filter).toEqual([
        "in",
        ["geometry-type"],
        ["literal", ["Point", "MultiPoint"]],
      ]);
    });
  });
});

// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store/useAppStore";
import { useSettingsStore } from "../../../store/useSettingsStore";
import type { Decoders } from "../../../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { capturedSources, capturedLayers, useMapResult } = vi.hoisted(() => ({
  capturedSources: [] as Array<Record<string, unknown>>,
  capturedLayers: [] as Array<Record<string, unknown>>,
  useMapResult: { current: null as unknown },
}));

vi.mock("react-map-gl/maplibre", () => ({
  Source: ({
    children,
    ...props
  }: { children?: ReactNode } & Record<string, unknown>) => {
    capturedSources.push(props);
    return <div data-testid={`source-${props.id ?? "anon"}`}>{children}</div>;
  },
  Layer: (props: Record<string, unknown>) => {
    capturedLayers.push(props);
    return <div data-testid={`layer-${props.id ?? "anon"}`} />;
  },
  useMap: () => useMapResult,
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { RangeRings } from "../RangeRings";

function makeDecoders(overrides: Partial<Decoders["adsb"]> = {}): Decoders {
  return {
    acars: true,
    vdlm: false,
    hfdl: false,
    imsl: false,
    irdm: false,
    allow_remote_updates: false,
    adsb: {
      enabled: true,
      lat: 0,
      lon: 0,
      range_rings: true,
      ...overrides,
    },
  };
}

/**
 * Build a fake MapLibre `Map` API exposing `getBounds()` returning the
 * specified NE/SW corners.  Only the methods RangeRings actually calls
 * are implemented.
 */
function makeFakeMap(opts: {
  ne: { lat: number; lng: number };
  sw: { lat: number; lng: number };
}): { getBounds: () => unknown } {
  return {
    getBounds: () => ({
      getNorthEast: () => ({ lat: opts.ne.lat, lng: opts.ne.lng }),
      getSouthWest: () => ({ lat: opts.sw.lat, lng: opts.sw.lng }),
    }),
  };
}

beforeEach(() => {
  capturedSources.length = 0;
  capturedLayers.length = 0;
  useMapResult.current = null;
  useSettingsStore.getState().resetToDefaults();
  // Use a non-(0,0) station location so the SUT doesn't bail early.
  useSettingsStore.getState().setStationLocation(40, -75);
  useAppStore.setState({ decoders: null });
});

afterEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ decoders: null });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RangeRings", () => {
  describe("visibility gates", () => {
    it("renders nothing when backend disables range_rings (privacy)", () => {
      useAppStore.setState({
        decoders: makeDecoders({ range_rings: false }),
      });

      const { container } = render(<RangeRings />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when user has toggled showRangeRings off", () => {
      useSettingsStore.getState().setShowRangeRings(false);

      const { container } = render(<RangeRings />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when station coordinates are (0,0)", () => {
      useSettingsStore.getState().setStationLocation(0, 0);

      const { container } = render(<RangeRings />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders 2 Sources + 2 Layers (rings + labels) when enabled with valid station", () => {
      render(<RangeRings />);

      expect(capturedSources.length).toBeGreaterThanOrEqual(2);
      expect(capturedLayers.length).toBeGreaterThanOrEqual(2);
      // Last two captured renders should be the ring + label sources
      const ids = capturedSources.map((s) => s.id);
      expect(ids).toContain("range-rings");
      expect(ids).toContain("range-rings-labels");
    });
  });

  describe("ring radii — static fallback", () => {
    it("falls back to settings.map.rangeRings when no map+viewState is provided", () => {
      // Settings default is [100, 200, 300]
      render(<RangeRings />);

      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ properties: { radius: number } }>;
      };
      const radii = fc.features.map((f) => f.properties.radius);
      expect(radii).toEqual([100, 200, 300]);
    });

    it("falls back to [100, 200, 300] when settings has empty rangeRings AND no map", () => {
      useSettingsStore.getState().setRangeRings([]);

      render(<RangeRings />);

      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ properties: { radius: number } }>;
      };
      expect(fc.features.map((f) => f.properties.radius)).toEqual([
        100, 200, 300,
      ]);
    });
  });

  describe("ring radii — dynamic from viewport", () => {
    it("computes 3 rings sized to fit the current viewport when map+viewState are provided", () => {
      // Station at (40, -75); viewport ~±2° (very roughly 120nm each way).
      useMapResult.current = makeFakeMap({
        ne: { lat: 42, lng: -73 },
        sw: { lat: 38, lng: -77 },
      });

      render(
        <RangeRings viewState={{ longitude: -75, latitude: 40, zoom: 8 }} />,
      );

      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ properties: { radius: number } }>;
      };
      const radii = fc.features.map((f) => f.properties.radius);
      expect(radii).toHaveLength(3);

      // Rings are in 1x, 2x, 3x sequence
      expect(radii[1]).toBe(radii[0] * 2);
      expect(radii[2]).toBe(radii[0] * 3);

      // The base ring radius must be a "nice" interval (multiple of 10/20/50
      // times a power of 10) — verify it's a positive integer of one of the
      // canonical forms.
      const base = radii[0];
      expect(base).toBeGreaterThan(0);
      const niceForms = [1, 2, 5];
      const magnitude = 10 ** Math.floor(Math.log10(base));
      expect(niceForms).toContain(Math.round(base / magnitude));
    });

    it("falls back to settings rings when getBounds returns null", () => {
      useMapResult.current = { getBounds: () => null };

      render(
        <RangeRings viewState={{ longitude: -75, latitude: 40, zoom: 8 }} />,
      );

      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ properties: { radius: number } }>;
      };
      expect(fc.features.map((f) => f.properties.radius)).toEqual([
        100, 200, 300,
      ]);
    });
  });

  describe("GeoJSON shape", () => {
    it("emits one Polygon feature per ring with a closed 64-segment ring (65 coords)", () => {
      render(<RangeRings />);

      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{
          geometry: { type: string; coordinates: number[][][] };
        }>;
      };
      expect(fc.features).toHaveLength(3);
      for (const feature of fc.features) {
        expect(feature.geometry.type).toBe("Polygon");
        // coordinates[0] is the exterior ring
        expect(feature.geometry.coordinates[0]).toHaveLength(65);
      }
    });

    it("emits 4 label points (N/E/S/W) per ring → 12 total for 3 rings", () => {
      render(<RangeRings />);

      const labelSource = capturedSources.find(
        (s) => s.id === "range-rings-labels",
      );
      const fc = labelSource?.data as {
        features: Array<{
          properties: { radius: number; label: string };
          geometry: { type: string; coordinates: number[] };
        }>;
      };
      expect(fc.features).toHaveLength(12); // 3 rings × 4 cardinal points
      for (const feature of fc.features) {
        expect(feature.geometry.type).toBe("Point");
        expect(feature.properties.label).toMatch(/^\d+ NM$/);
      }
    });
  });

  describe("theming", () => {
    it("uses mocha palette for line and label colors when theme is mocha", () => {
      useSettingsStore.getState().setTheme("mocha");

      render(<RangeRings />);

      const ringLayer = capturedLayers.find(
        (l) => l.id === "range-rings-outline",
      );
      expect((ringLayer?.paint as Record<string, unknown>)["line-color"]).toBe(
        "#89b4fa",
      );

      const labelLayer = capturedLayers.find(
        (l) => l.id === "range-rings-label-text",
      );
      const labelPaint = labelLayer?.paint as Record<string, unknown>;
      expect(labelPaint["text-color"]).toBe("#cdd6f4");
      expect(labelPaint["text-halo-color"]).toBe("#1e1e2e");
    });

    it("uses latte palette when theme is latte", () => {
      useSettingsStore.getState().setTheme("latte");

      render(<RangeRings />);

      const ringLayer = capturedLayers.find(
        (l) => l.id === "range-rings-outline",
      );
      expect((ringLayer?.paint as Record<string, unknown>)["line-color"]).toBe(
        "#1e66f5",
      );

      const labelLayer = capturedLayers.find(
        (l) => l.id === "range-rings-label-text",
      );
      const labelPaint = labelLayer?.paint as Record<string, unknown>;
      expect(labelPaint["text-color"]).toBe("#4c4f69");
      expect(labelPaint["text-halo-color"]).toBe("#eff1f5");
    });
  });

  describe("station coordinate resolution", () => {
    it("uses backend decoders.adsb lat/lon when settings stationLat/Lon are (0,0)", () => {
      useSettingsStore.getState().setStationLocation(0, 0);
      useAppStore.setState({
        decoders: makeDecoders({ lat: 51, lon: -1, range_rings: true }),
      });

      render(<RangeRings />);

      // First polygon point should be ~due north of (51, -1) at 100 NM
      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ geometry: { coordinates: number[][][] } }>;
      };
      const firstPoint = fc.features[0].geometry.coordinates[0][0];
      // Longitude near -1, latitude > 51 (offset north)
      expect(firstPoint[0]).toBeCloseTo(-1, 1);
      expect(firstPoint[1]).toBeGreaterThan(51);
    });
  });
});

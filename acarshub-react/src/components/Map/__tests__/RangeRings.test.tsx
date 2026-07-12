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

import {
  calculateRangeRingRadii,
  getMaxRingCount,
  RangeRings,
} from "../RangeRings";

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
  /** Optional — omitted mirrors real usage where `getContainer` may be
   * absent on older mocks; `getMaxRingCount(undefined)` falls back to 3. */
  containerWidth?: number;
}): { getBounds: () => unknown; getContainer?: () => { clientWidth: number } } {
  return {
    getBounds: () => ({
      getNorthEast: () => ({ lat: opts.ne.lat, lng: opts.ne.lng }),
      getSouthWest: () => ({ lat: opts.sw.lat, lng: opts.sw.lng }),
    }),
    ...(opts.containerWidth !== undefined
      ? { getContainer: () => ({ clientWidth: opts.containerWidth as number }) }
      : {}),
  };
}

/** Nice-interval rounding, mirroring `RangeRings.tsx`'s private helper —
 * duplicated here (not imported) since it's intentionally an internal
 * `useCallback`, not part of the module's public/testable surface. */
function roundToNiceInterval(distance: number): number {
  if (distance <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(distance));
  const intervals = [magnitude * 1, magnitude * 2, magnitude * 5];
  return intervals.reduce((prev, curr) =>
    Math.abs(curr - distance) < Math.abs(prev - distance) ? curr : prev,
  );
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

    /**
     * REGRESSION (user-reported, post-Phase-B): ring size/count used to be
     * computed from the STATION's distance to the viewport edges/corners.
     * Panning the map moves the station off-center within the visible
     * frame without changing zoom at all, which made `minEdgeDistance`
     * collapse toward zero as the station approached any edge — rings
     * would shrink, change count, or nearly disappear purely from
     * panning. The fix moves the size calculation onto the *viewport's
     * own center* (`viewState`), independent of where the station sits
     * within the frame.
     */
    function radiiFor(
      station: { lat: number; lon: number },
      bounds: {
        ne: { lat: number; lng: number };
        sw: { lat: number; lng: number };
      },
      viewState: { longitude: number; latitude: number; zoom: number },
    ): number[] {
      useSettingsStore.getState().setStationLocation(station.lat, station.lon);
      useMapResult.current = makeFakeMap(bounds);
      // capturedSources/capturedLayers are shared module-level buffers —
      // clear them before each render within this helper so multiple
      // calls in a single test don't accumulate matches from prior calls.
      capturedSources.length = 0;
      capturedLayers.length = 0;
      const { unmount } = render(<RangeRings viewState={viewState} />);
      const ringSource = capturedSources.find((s) => s.id === "range-rings");
      const fc = ringSource?.data as {
        features: Array<{ properties: { radius: number } }>;
      };
      const radii = fc.features.map((f) => f.properties.radius);
      unmount();
      return radii;
    }

    it("ring size/count is identical regardless of where the station sits within a fixed viewport", () => {
      const bounds = {
        ne: { lat: 42, lng: -73 },
        sw: { lat: 38, lng: -77 },
      };
      const viewState = { longitude: -75, latitude: 40, zoom: 8 };

      // Station exactly at the viewport center (the "default camera"
      // case).
      const centered = radiiFor({ lat: 40, lon: -75 }, bounds, viewState);

      // Same viewport, but the station has drifted close to the NE
      // corner — simulating the user having panned the map so the
      // station is no longer centered, without changing zoom.
      const offCenterNearEdge = radiiFor(
        { lat: 41.8, lon: -73.2 },
        bounds,
        viewState,
      );

      expect(offCenterNearEdge).toEqual(centered);
    });

    it("ring size/count is unaffected by a pure pan (same zoom, viewport translated east)", () => {
      const station = { lat: 40, lon: -75 };

      const before = radiiFor(
        station,
        { ne: { lat: 42, lng: -73 }, sw: { lat: 38, lng: -77 } },
        { longitude: -75, latitude: 40, zoom: 8 },
      );

      // Pan 10° of longitude east, same latitude (so the great-circle
      // geometry is exactly congruent, just translated) — the station's
      // real-world location doesn't move; only the visible frame does.
      const afterPan = radiiFor(
        station,
        { ne: { lat: 42, lng: -63 }, sw: { lat: 38, lng: -67 } },
        { longitude: -65, latitude: 40, zoom: 8 },
      );

      expect(afterPan).toEqual(before);
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

  describe("FEAT-RANGE-RINGS Phase B: getMaxRingCount", () => {
    it("returns 3 (MIN_RING_COUNT) when containerWidthPx is undefined", () => {
      expect(getMaxRingCount(undefined)).toBe(3);
    });

    it("returns 3 below the mobile breakpoint (400px)", () => {
      expect(getMaxRingCount(0)).toBe(3);
      expect(getMaxRingCount(320)).toBe(3);
      expect(getMaxRingCount(399)).toBe(3);
    });

    it("returns 4 between the mobile and tablet breakpoints (400-899px)", () => {
      expect(getMaxRingCount(400)).toBe(4);
      expect(getMaxRingCount(631)).toBe(4);
      expect(getMaxRingCount(899)).toBe(4);
    });

    it("returns 5 (MAX_RING_COUNT) at or above the tablet breakpoint (900px+)", () => {
      expect(getMaxRingCount(900)).toBe(5);
      expect(getMaxRingCount(1527)).toBe(5);
      expect(getMaxRingCount(1_000_000)).toBe(5);
    });
  });

  describe("FEAT-RANGE-RINGS Phase B: calculateRangeRingRadii", () => {
    it("never produces a ring count below 3 or above the requested maxRingCount", () => {
      for (const maxRingCount of [3, 4, 5]) {
        const radii = calculateRangeRingRadii(
          100,
          250,
          maxRingCount,
          roundToNiceInterval,
        );
        expect(radii.length).toBeGreaterThanOrEqual(3);
        expect(radii.length).toBeLessThanOrEqual(maxRingCount);
      }
    });

    it("the innermost ring never exceeds minEdgeDistance (no-clip invariant)", () => {
      // A wide range of edge/corner ratios, including near-square (edge ≈
      // corner) and very elongated (corner >> edge) viewports.
      const cases: Array<[number, number]> = [
        [40.4, 79.1], // 320w mobile fixture from Phase A
        [118.9, 224.1], // 1920w desktop fixture from Phase A
        [100, 101], // near-square: corner barely exceeds edge
        [50, 500], // extremely elongated
      ];
      for (const [minEdge, minCorner] of cases) {
        for (const maxRingCount of [3, 4, 5]) {
          const radii = calculateRangeRingRadii(
            minEdge,
            minCorner,
            maxRingCount,
            roundToNiceInterval,
          );
          expect(radii[0]).toBeLessThanOrEqual(minEdge);
        }
      }
    });

    it("picks the largest ring count whose nice-interval step still fits minEdgeDistance", () => {
      // minEdge=118.9, minCorner=224.1 (1920w desktop fixture) — outerTarget
      // = max(224.1*0.9, 118.9*0.7) = 201.69. At maxRingCount=5:
      // step = niceInterval(201.69/5=40.3) = 50; 50 <= 118.9 -> fits.
      const radii = calculateRangeRingRadii(
        118.9,
        224.1,
        5,
        roundToNiceInterval,
      );
      expect(radii).toEqual([50, 100, 150, 200, 250]);
    });

    it("falls back to the edge-only formula when even MIN_RING_COUNT clips the innermost ring", () => {
      // Real Phase A fixture (768w tablet-portrait canvas, 375x899):
      // minEdge=47.4, minCorner=121.3, maxRingCount=3 (narrow-viewport
      // cap). outerTarget = max(121.3*0.9, 47.4*0.7) = 109.17; at the only
      // count tried (3), niceInterval(109.17/3=36.39) = 50, which exceeds
      // minEdgeDistance (47.4) — the corner-based target doesn't fit even
      // at the minimum count, so this falls all the way back to the
      // edge-only formula.
      const radii = calculateRangeRingRadii(
        47.4,
        121.3,
        3,
        roundToNiceInterval,
      );
      // Fallback formula: niceInterval((47.4*0.7)/3) = niceInterval(11.06) = 10
      expect(radii).toEqual([10, 20, 30]);
      expect(radii[0]).toBeLessThanOrEqual(47.4);
    });

    it("REGRESSION: outer ring reaches materially farther than the pre-Phase-B formula on a landscape viewport", () => {
      // Same fixture as Phase A's screenshot cross-check (1024w laptop,
      // canvas 631x661): minEdge=79.7, minCorner=114.3.
      const minEdge = 79.7;
      const minCorner = 114.3;

      // Pre-Phase-B formula: outer = niceInterval((minEdge*0.7)/3) * 3.
      const oldStep = roundToNiceInterval((minEdge * 0.7) / 3);
      const oldOuter = oldStep * 3;

      const newRadii = calculateRangeRingRadii(
        minEdge,
        minCorner,
        getMaxRingCount(631),
        roundToNiceInterval,
      );
      const newOuter = newRadii[newRadii.length - 1];

      // This is the numeric proof the Phase A audit's "outer/minCorner:
      // 37.3%" (old) vs the new formula's improved reach requires: the new
      // outer ring must be strictly larger, and closer to minCorner as a
      // fraction, than the old one.
      expect(newOuter).toBeGreaterThan(oldOuter);
      expect(newOuter / minCorner).toBeGreaterThan(oldOuter / minCorner);
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

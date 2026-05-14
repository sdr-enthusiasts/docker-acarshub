// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store/useAppStore";
import { useSettingsStore } from "../../../store/useSettingsStore";
import type { Decoders } from "../../../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// react-map-gl/maplibre — capture every Marker render's props so tests can
// assert on coordinates without a real WebGL context.  Inline factory keeps
// the mock self-contained (per Map.test.tsx pattern).
//
// `vi.mock` is hoisted above all imports, so we declare the capture array
// inside the factory's closure scope via `vi.hoisted()`.
const { capturedMarkers } = vi.hoisted(() => ({
  capturedMarkers: [] as Array<{
    longitude: number;
    latitude: number;
    anchor?: string;
  }>,
}));

vi.mock("react-map-gl/maplibre", () => ({
  Marker: ({
    longitude,
    latitude,
    anchor,
    children,
  }: {
    longitude: number;
    latitude: number;
    anchor?: string;
    children?: ReactNode;
  }) => {
    capturedMarkers.push({ longitude, latitude, anchor });
    return (
      <div
        data-testid="marker"
        data-longitude={longitude}
        data-latitude={latitude}
        data-anchor={anchor}
      >
        {children}
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// SUT import — must come AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { StationMarker } from "../StationMarker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseDecoders: Decoders = {
  acars: true,
  vdlm: false,
  hfdl: false,
  imsl: false,
  irdm: false,
  adsb: {
    enabled: true,
    lat: 40.7128,
    lon: -74.006,
    range_rings: true,
  },
  allow_remote_updates: false,
};

beforeEach(() => {
  capturedMarkers.length = 0;
  useAppStore.getState().setDecoders({ ...baseDecoders });
  useSettingsStore.getState().resetToDefaults();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StationMarker", () => {
  describe("rendering", () => {
    it("renders a Marker at the backend station coordinates when settings have no override", () => {
      render(<StationMarker />);

      expect(capturedMarkers).toHaveLength(1);
      expect(capturedMarkers[0]).toEqual({
        longitude: -74.006,
        latitude: 40.7128,
        anchor: "center",
      });
    });

    it("renders the radio-tower SVG with an accessible label and title", () => {
      render(<StationMarker />);

      const svg = screen.getByRole("img", { name: /ground station/i });
      expect(svg).toBeInTheDocument();
      // <title> element nested inside <svg> provides screen-reader text
      expect(screen.getByText("Ground Station")).toBeInTheDocument();
    });

    it("wraps the SVG in a div.station-marker container", () => {
      const { container } = render(<StationMarker />);
      expect(container.querySelector(".station-marker")).not.toBeNull();
    });
  });

  describe("user-settings override", () => {
    it("uses settings.stationLat/stationLon when the user has set custom coordinates", () => {
      useSettingsStore.getState().setStationLocation(51.5074, -0.1278);

      render(<StationMarker />);

      expect(capturedMarkers).toHaveLength(1);
      expect(capturedMarkers[0]).toMatchObject({
        latitude: 51.5074,
        longitude: -0.1278,
      });
    });

    it("respects any non-(0,0) settings location verbatim (lat=10, lon=0)", () => {
      // The SUT only falls back to backend coords when BOTH stationLat AND
      // stationLon are exactly 0 — a half-set location (lat=10, lon=0) is
      // treated as intentional and used as-is.  Regression-pin this branch.
      useSettingsStore.getState().setStationLocation(10, 0);

      render(<StationMarker />);

      expect(capturedMarkers[0]).toMatchObject({
        latitude: 10,
        longitude: 0,
      });
    });
  });

  describe("privacy / visibility gates", () => {
    it("renders nothing when backend disables range_rings (privacy)", () => {
      useAppStore.getState().setDecoders({
        ...baseDecoders,
        adsb: { ...baseDecoders.adsb, range_rings: false },
      });

      const { container } = render(<StationMarker />);

      expect(capturedMarkers).toHaveLength(0);
      expect(container.querySelector(".station-marker")).toBeNull();
    });

    it("renders nothing when settings AND backend both report (0,0) coordinates", () => {
      useAppStore.getState().setDecoders({
        ...baseDecoders,
        adsb: { ...baseDecoders.adsb, lat: 0, lon: 0 },
      });
      // Settings already at (0,0) from resetToDefaults

      render(<StationMarker />);

      expect(capturedMarkers).toHaveLength(0);
    });

    it("defaults backendAllowsRangeRings to true when adsb config is absent", () => {
      // decoders=null → adsb?.range_rings is undefined → `?? true` applies.
      // Marker should render so long as a settings location exists.
      useAppStore.setState({ decoders: null });
      useSettingsStore.getState().setStationLocation(45, 45);

      render(<StationMarker />);

      expect(capturedMarkers).toHaveLength(1);
      expect(capturedMarkers[0]).toMatchObject({ latitude: 45, longitude: 45 });
    });
  });
});

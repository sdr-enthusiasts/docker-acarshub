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
import { useSettingsStore } from "../../../store/useSettingsStore";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture every Source and Layer render so we can assert on their props
// (tiles URL, opacity, visibility, maxzoom) without instantiating MapLibre.
const { capturedSources, capturedLayers } = vi.hoisted(() => ({
  capturedSources: [] as Array<Record<string, unknown>>,
  capturedLayers: [] as Array<Record<string, unknown>>,
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
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { OpenAIPOverlay } from "../OpenAIPOverlay";

beforeEach(() => {
  capturedSources.length = 0;
  capturedLayers.length = 0;
  useSettingsStore.getState().resetToDefaults();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAIPOverlay", () => {
  describe("visibility", () => {
    it("renders nothing when settings.map.showOpenAIP is false (default)", () => {
      const { container } = render(<OpenAIPOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders a Source + Layer pair when showOpenAIP is enabled", () => {
      useSettingsStore.getState().setShowOpenAIP(true);

      render(<OpenAIPOverlay />);

      expect(capturedSources).toHaveLength(1);
      expect(capturedLayers).toHaveLength(1);
    });
  });

  describe("Source configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowOpenAIP(true);
    });

    it("configures the Source as a raster TMS pointing at adsbexchange's OpenAIP proxy", () => {
      render(<OpenAIPOverlay />);

      const src = capturedSources[0];
      expect(src.id).toBe("openaip-source");
      expect(src.type).toBe("raster");
      expect(src.tiles).toEqual([
        "https://map.adsbexchange.com/mapproxy/tiles/1.0.0/openaip/ul_grid/{z}/{x}/{y}.png",
      ]);
      expect(src.tileSize).toBe(256);
      expect(src.maxzoom).toBe(12);
      expect(src.attribution).toBe("openAIP.net");
    });
  });

  describe("Layer configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowOpenAIP(true);
    });

    it("renders the layer with fixed 0.8 opacity and 300ms fade", () => {
      render(<OpenAIPOverlay />);

      const layer = capturedLayers[0];
      expect(layer.id).toBe("openaip-layer");
      expect(layer.type).toBe("raster");
      expect(layer.source).toBe("openaip-source");
      expect(layer.paint).toEqual({
        "raster-opacity": 0.8,
        "raster-fade-duration": 300,
      });
    });

    it("sets layout.visibility to 'visible' when showOpenAIP is true", () => {
      render(<OpenAIPOverlay />);

      expect(capturedLayers[0].layout).toEqual({ visibility: "visible" });
    });

    it("allows display up to zoom 13 (MAX_ZOOM + 1)", () => {
      render(<OpenAIPOverlay />);

      expect(capturedLayers[0].maxzoom).toBe(13);
    });
  });
});

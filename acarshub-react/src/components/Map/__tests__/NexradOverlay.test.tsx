// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../../../store/useSettingsStore";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

import { NexradOverlay } from "../NexradOverlay";

beforeEach(() => {
  capturedSources.length = 0;
  capturedLayers.length = 0;
  useSettingsStore.getState().resetToDefaults();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NexradOverlay", () => {
  describe("visibility", () => {
    it("renders nothing when showNexrad is false (default)", () => {
      const { container } = render(<NexradOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders Source + Layer when showNexrad is true and renderTimestampOnly is false", () => {
      useSettingsStore.getState().setShowNexrad(true);

      render(<NexradOverlay />);

      // The useEffect that sets the initial timestamp triggers a re-render,
      // so Source/Layer are captured more than once.  We only care that the
      // most recent render produced exactly one Source and one Layer.
      expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      expect(capturedLayers.length).toBeGreaterThanOrEqual(1);
      expect(capturedSources.at(-1)?.id).toBe("nexrad-source");
      expect(capturedLayers.at(-1)?.id).toBe("nexrad-layer");
    });

    it("renders timestamp DOM (not map layer) when renderTimestampOnly is true", () => {
      useSettingsStore.getState().setShowNexrad(true);

      render(<NexradOverlay renderTimestampOnly />);

      // Map primitives should NOT have been rendered
      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
      // But the timestamp container should be present
      expect(screen.getByText("NEXRAD:")).toBeInTheDocument();
    });

    it("renders nothing in renderTimestampOnly mode when showNexrad is false", () => {
      const { container } = render(<NexradOverlay renderTimestampOnly />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Source configuration (Iowa Mesonet WMS)", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowNexrad(true);
    });

    it("uses Iowa Mesonet WMS endpoint with EPSG:3857 and 256x256 tiles", () => {
      render(<NexradOverlay />);

      const src = capturedSources[0];
      expect(src.id).toBe("nexrad-source");
      expect(src.type).toBe("raster");
      expect(src.tileSize).toBe(256);
      expect(src.scheme).toBe("xyz");
      const tiles = src.tiles as string[];
      expect(tiles).toHaveLength(1);
      expect(tiles[0]).toContain(
        "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi",
      );
      expect(tiles[0]).toContain("LAYERS=nexrad-n0q-900913");
      expect(tiles[0]).toContain("SRS=EPSG:3857");
      expect(tiles[0]).toContain("WIDTH=256");
      expect(tiles[0]).toContain("HEIGHT=256");
      expect(tiles[0]).toContain("{bbox-epsg-3857}");
    });
  });

  describe("Layer configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowNexrad(true);
    });

    it("renders layer with 0.575 opacity and 300ms fade", () => {
      render(<NexradOverlay />);

      const layer = capturedLayers[0];
      expect(layer.id).toBe("nexrad-layer");
      expect(layer.type).toBe("raster");
      expect(layer.source).toBe("nexrad-source");
      expect(layer.paint).toEqual({
        "raster-opacity": 0.575,
        "raster-fade-duration": 300,
      });
    });

    it("sets layout.visibility to 'visible' when showNexrad is true", () => {
      render(<NexradOverlay />);
      expect(capturedLayers[0].layout).toEqual({ visibility: "visible" });
    });
  });

  describe("timestamp refresh", () => {
    it("populates an initial timestamp when enabled", () => {
      useSettingsStore.getState().setShowNexrad(true);

      render(<NexradOverlay renderTimestampOnly />);

      // toLocaleTimeString() output is locale-dependent; just assert
      // the label is present and the time span has some content.
      const time = screen.getByText("NEXRAD:").nextElementSibling;
      expect(time).not.toBeNull();
      expect(time?.textContent ?? "").not.toBe("");
    });

    it("refreshes the timestamp on the 5-minute interval", () => {
      // Pin the system clock BEFORE rendering so the initial timestamp is
      // deterministic; then advance the clock + interval and confirm the
      // displayed timestamp changes.
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      useSettingsStore.getState().setShowNexrad(true);

      render(<NexradOverlay renderTimestampOnly />);

      const initial =
        screen.getByText("NEXRAD:").nextElementSibling?.textContent ?? "";
      expect(initial).not.toBe("");

      act(() => {
        // Advance well past 5 minutes and align system time to match
        vi.setSystemTime(new Date("2024-01-01T01:23:45Z"));
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      const after =
        screen.getByText("NEXRAD:").nextElementSibling?.textContent ?? "";
      expect(after).not.toBe("");
      expect(after).not.toBe(initial);
    });
  });
});

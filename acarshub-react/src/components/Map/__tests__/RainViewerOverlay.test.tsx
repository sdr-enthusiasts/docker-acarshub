// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import { render, screen, waitFor } from "@testing-library/react";
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

// Silence logger noise during fetch error paths
vi.mock("../../../utils/logger", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/logger")>(
    "../../../utils/logger",
  );
  return {
    ...actual,
    mapLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { RainViewerOverlay } from "../RainViewerOverlay";

/** Helper: install a fetch stub that resolves with the given radar `past` array. */
function mockRainViewerApi(past: Array<{ time: number; path: string }>): void {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({
      version: "2.0",
      generated: 0,
      host: "https://tilecache.rainviewer.com",
      radar: { past, nowcast: [] },
    }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  capturedSources.length = 0;
  capturedLayers.length = 0;
  useSettingsStore.getState().resetToDefaults();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RainViewerOverlay", () => {
  describe("visibility", () => {
    it("renders nothing when showRainViewer is false (default)", () => {
      const { container } = render(<RainViewerOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing initially when enabled but radar frame not yet fetched", () => {
      // fetch hangs — never resolves
      global.fetch = vi.fn(
        () => new Promise(() => {}),
      ) as unknown as typeof fetch;
      useSettingsStore.getState().setShowRainViewer(true);

      const { container } = render(<RainViewerOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders Source + Layer once the radar frame is fetched", async () => {
      mockRainViewerApi([{ time: 1700000000, path: "/v2/radar/4cddb2c4b122" }]);
      useSettingsStore.getState().setShowRainViewer(true);

      render(<RainViewerOverlay />);

      await waitFor(() => {
        expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      });
      expect(capturedSources.at(-1)?.id).toBe("rainviewer-source");
      expect(capturedLayers.at(-1)?.id).toBe("rainviewer-layer");
    });

    it("renders timestamp DOM (not map layer) in renderTimestampOnly mode", async () => {
      mockRainViewerApi([{ time: 1700000000, path: "/v2/radar/4cddb2c4b122" }]);
      useSettingsStore.getState().setShowRainViewer(true);

      render(<RainViewerOverlay renderTimestampOnly />);

      await waitFor(() => {
        expect(screen.getByText("RainViewer:")).toBeInTheDocument();
      });
      // Map primitives are NOT rendered in timestamp-only mode
      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
    });
  });

  describe("Source configuration (RainViewer tile API)", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowRainViewer(true);
    });

    it("constructs the tile URL from the API-provided host + path, not the timestamp", async () => {
      // REGRESSION (410 Gone): RainViewer's v2 API returns an opaque path
      // identifier per frame (e.g. "/v2/radar/34aaa5a4ec78") that is NOT
      // derived from the frame's `time` field. A prior version of this
      // component reconstructed the tile URL as
      // `.../v2/radar/${time}/512/...`, which RainViewer serves as 410
      // Gone for any real (non-matching) path. Use a path here that
      // deliberately does not match the timestamp digit-for-digit, so
      // this test fails if the component ever regresses back to
      // building the URL from `time` instead of the API's `path`.
      mockRainViewerApi([{ time: 1700000999, path: "/v2/radar/34aaa5a4ec78" }]);

      render(<RainViewerOverlay />);

      await waitFor(() => {
        expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      });

      const src = capturedSources.at(-1);
      const tiles = src?.tiles as string[];
      expect(tiles[0]).toBe(
        "https://tilecache.rainviewer.com/v2/radar/34aaa5a4ec78/512/{z}/{x}/{y}/6/1_1.png",
      );
      expect(tiles[0]).not.toContain("1700000999");
      expect(src?.tileSize).toBe(256);
      expect(src?.maxzoom).toBe(7);
      expect(src?.attribution).toContain("RainViewer.com");
    });

    it("uses the LAST entry in radar.past as the latest frame", async () => {
      mockRainViewerApi([
        { time: 1, path: "/v2/radar/aaaaaaaaaaaa" },
        { time: 2, path: "/v2/radar/bbbbbbbbbbbb" },
        { time: 3, path: "/v2/radar/cccccccccccc" },
      ]);

      render(<RainViewerOverlay />);

      await waitFor(() => {
        expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      });

      const tiles = capturedSources.at(-1)?.tiles as string[];
      expect(tiles[0]).toContain("/v2/radar/cccccccccccc/512/");
    });

    it("builds the tile URL using the host returned by the API response", async () => {
      // The API response's `host` field is authoritative — don't hardcode
      // tilecache.rainviewer.com in a way that would silently ignore it.
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          version: "2.0",
          generated: 0,
          host: "https://some-other-host.example.com",
          radar: {
            past: [{ time: 1, path: "/v2/radar/deadbeefcafe" }],
            nowcast: [],
          },
        }),
      }) as unknown as typeof fetch;

      render(<RainViewerOverlay />);

      await waitFor(() => {
        expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      });

      const tiles = capturedSources.at(-1)?.tiles as string[];
      expect(tiles[0]).toBe(
        "https://some-other-host.example.com/v2/radar/deadbeefcafe/512/{z}/{x}/{y}/6/1_1.png",
      );
    });
  });

  describe("Layer configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowRainViewer(true);
    });

    it("renders the layer with 0.575 opacity and 300ms fade", async () => {
      mockRainViewerApi([{ time: 1, path: "/v2/radar/1" }]);

      render(<RainViewerOverlay />);

      await waitFor(() => {
        expect(capturedLayers.length).toBeGreaterThanOrEqual(1);
      });

      const layer = capturedLayers.at(-1);
      expect(layer?.paint).toEqual({
        "raster-opacity": 0.575,
        "raster-fade-duration": 300,
      });
      expect(layer?.layout).toEqual({ visibility: "visible" });
    });
  });

  describe("error handling", () => {
    it("renders nothing when the RainViewer API request fails", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error("network down"),
        ) as unknown as typeof fetch;
      useSettingsStore.getState().setShowRainViewer(true);

      const { container } = render(<RainViewerOverlay />);

      // Give the rejected promise a chance to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when the API returns an empty radar.past array", async () => {
      mockRainViewerApi([]);
      useSettingsStore.getState().setShowRainViewer(true);

      const { container } = render(<RainViewerOverlay />);

      await new Promise((r) => setTimeout(r, 0));

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });
  });
});

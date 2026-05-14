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

// resolvePathOrUrl prepends BASE_URL for relative paths; mock it to be the
// identity so we can assert exact data URLs.
vi.mock("../../../utils/pathUtils", () => ({
  resolvePathOrUrl: (path: string) => `RESOLVED:${path}`,
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { HeyWhatsThatOverlay } from "../HeyWhatsThatOverlay";

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

beforeEach(() => {
  capturedSources.length = 0;
  capturedLayers.length = 0;
  useSettingsStore.getState().resetToDefaults();
  useAppStore.setState({ decoders: null });
});

afterEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ decoders: null });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HeyWhatsThatOverlay", () => {
  describe("visibility gates", () => {
    it("renders nothing when no decoders are loaded", () => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);

      const { container } = render(<HeyWhatsThatOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(capturedLayers).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when backend has no heywhatsthat_url (HWT not configured)", () => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);
      useAppStore.setState({ decoders: makeDecoders() });

      const { container } = render(<HeyWhatsThatOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when user has toggled showHeyWhatsThat off", () => {
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson" }),
      });
      // Default is true; explicitly toggle off to exercise the gate.
      useSettingsStore.getState().setShowHeyWhatsThat(false);

      const { container } = render(<HeyWhatsThatOverlay />);

      expect(capturedSources).toHaveLength(0);
      expect(container.firstChild).toBeNull();
    });

    it("renders Source + 2 Layers when configured AND enabled", () => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson" }),
      });

      render(<HeyWhatsThatOverlay />);

      expect(capturedSources.length).toBeGreaterThanOrEqual(1);
      expect(capturedLayers.length).toBeGreaterThanOrEqual(2);
      expect(capturedSources.at(-1)?.id).toBe("heywhatsthat-coverage");
    });
  });

  describe("Source configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson?v=abc" }),
      });
    });

    it("passes the resolved URL as the GeoJSON data source", () => {
      render(<HeyWhatsThatOverlay />);

      const src = capturedSources.at(-1);
      expect(src?.type).toBe("geojson");
      expect(src?.data).toBe("RESOLVED:/data/hwt.geojson?v=abc");
    });

    it("regenerates the resolved URL when the backend URL changes", () => {
      const { rerender } = render(<HeyWhatsThatOverlay />);
      expect(capturedSources.at(-1)?.data).toBe(
        "RESOLVED:/data/hwt.geojson?v=abc",
      );

      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson?v=xyz" }),
      });
      rerender(<HeyWhatsThatOverlay />);

      expect(capturedSources.at(-1)?.data).toBe(
        "RESOLVED:/data/hwt.geojson?v=xyz",
      );
    });
  });

  describe("Layer configuration", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson" }),
      });
    });

    it("renders a line layer with dashed stroke and per-ring color match expression", () => {
      render(<HeyWhatsThatOverlay />);

      const lineLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-line",
      );
      expect(lineLayer).toBeDefined();
      expect(lineLayer?.type).toBe("line");

      const paint = lineLayer?.paint as Record<string, unknown>;
      expect(paint["line-width"]).toBe(2);
      expect(paint["line-opacity"]).toBe(0.85);
      expect(paint["line-dasharray"]).toEqual([6, 3]);

      // line-color is a MapLibre match expression — first element "match",
      // second element ["get", "ring_index"], then index/color pairs.
      const colorExpr = paint["line-color"] as unknown[];
      expect(colorExpr[0]).toBe("match");
      expect(colorExpr[1]).toEqual(["get", "ring_index"]);
      // 6 palette colors + 1 fallback = 13 entries after the first two
      expect(colorExpr).toHaveLength(2 + 6 * 2 + 1);
    });

    it("renders a symbol layer for altitude labels with text-field bound to altitude_label", () => {
      render(<HeyWhatsThatOverlay />);

      const labelLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-labels",
      );
      expect(labelLayer).toBeDefined();
      expect(labelLayer?.type).toBe("symbol");
      expect(labelLayer?.filter).toEqual(["==", ["geometry-type"], "Polygon"]);

      const layout = labelLayer?.layout as Record<string, unknown>;
      expect(layout["text-field"]).toEqual(["get", "altitude_label"]);
      expect(layout["text-size"]).toBe(12);
      expect(layout["symbol-placement"]).toBe("line");
    });
  });

  describe("theme-driven palette", () => {
    beforeEach(() => {
      useSettingsStore.getState().setShowHeyWhatsThat(true);
      useAppStore.setState({
        decoders: makeDecoders({ heywhatsthat_url: "/data/hwt.geojson" }),
      });
    });

    it("uses the mocha palette (Catppuccin dark) when theme is mocha", () => {
      useSettingsStore.getState().setTheme("mocha");

      render(<HeyWhatsThatOverlay />);

      const lineLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-line",
      );
      const paint = lineLayer?.paint as Record<string, unknown>;
      const colorExpr = paint["line-color"] as unknown[];
      // First palette entry (mocha green) sits at position 3 (after "match",
      // ["get","ring_index"], 0).
      expect(colorExpr[3]).toBe("#a6e3a1");

      const labelLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-labels",
      );
      const labelPaint = labelLayer?.paint as Record<string, unknown>;
      expect(labelPaint["text-color"]).toBe("#cdd6f4");
      expect(labelPaint["text-halo-color"]).toBe("#1e1e2e");
    });

    it("uses the latte palette (Catppuccin light) when theme is latte", () => {
      useSettingsStore.getState().setTheme("latte");

      render(<HeyWhatsThatOverlay />);

      const lineLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-line",
      );
      const paint = lineLayer?.paint as Record<string, unknown>;
      const colorExpr = paint["line-color"] as unknown[];
      expect(colorExpr[3]).toBe("#40a02b");

      const labelLayer = capturedLayers.find(
        (l) => l.id === "heywhatsthat-coverage-labels",
      );
      const labelPaint = labelLayer?.paint as Record<string, unknown>;
      expect(labelPaint["text-color"]).toBe("#4c4f69");
      expect(labelPaint["text-halo-color"]).toBe("#eff1f5");
    });
  });
});

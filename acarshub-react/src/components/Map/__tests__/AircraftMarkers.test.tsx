// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for AircraftMarkers.
 *
 * Scope: focus on observable, user-facing behaviors:
 *   - Null/empty rendering when ADS-B feed is missing
 *   - One Marker per filtered, in-viewport aircraft (using the
 *     `externalAircraft` prop to bypass internal pairing — the pairing
 *     pipeline has its own dedicated tests in aircraftPairing.test.ts)
 *   - Map setting filters: ACARS-only, unread-only, dbFlags filters
 *   - Skipping aircraft without lat/lon
 *   - Viewport culling with 10% buffer, including antimeridian crossing
 *   - onViewportBoundsChange notifications: raw bounds on move, null on unmount
 *   - Marker click opens messages modal only when aircraft has messages
 *   - Right-click opens context menu
 *
 * Intentionally NOT covered (covered by other suites or unsuitable for unit
 * test): sprite loading pipeline, sprite class derivation, follow/unfollow
 * flow (uses callback prop — covered at integration level). Tooltip
 * positioning math was extracted to hooks/useTooltipPositioning.ts (GOD-08)
 * and is covered by hooks/__tests__/useTooltipPositioning.test.ts.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store/useAppStore";
import { useSettingsStore } from "../../../store/useSettingsStore";
import type { PairedAircraft } from "../../../utils/aircraftPairing";

// ---------------------------------------------------------------------------
// Mocks — react-map-gl/maplibre
// ---------------------------------------------------------------------------

const { capturedMarkers, useMapResult } = vi.hoisted(() => ({
  capturedMarkers: [] as Array<{
    longitude: number;
    latitude: number;
    [key: string]: unknown;
  }>,
  useMapResult: { current: null as unknown },
}));

vi.mock("react-map-gl/maplibre", () => ({
  Marker: ({
    longitude,
    latitude,
    children,
    ...rest
  }: {
    longitude: number;
    latitude: number;
    children?: ReactNode;
  } & Record<string, unknown>) => {
    capturedMarkers.push({ longitude, latitude, ...rest });
    return (
      <div
        data-testid="aircraft-marker"
        data-lat={latitude}
        data-lon={longitude}
      >
        {children}
      </div>
    );
  },
  useMap: () => useMapResult,
}));

// ---------------------------------------------------------------------------
// Mocks — heavy child components
// ---------------------------------------------------------------------------

vi.mock("../AircraftMessagesModal", () => ({
  AircraftMessagesModal: ({
    messageGroup,
  }: {
    messageGroup: unknown;
    onClose: () => void;
  }) => (messageGroup ? <div data-testid="messages-modal-open" /> : null),
}));

vi.mock("../AircraftContextMenu", () => ({
  AircraftContextMenu: ({
    aircraft,
  }: {
    aircraft: { hex: string };
    x: number;
    y: number;
    isFollowed: boolean;
    onClose: () => void;
    onViewMessages: () => void;
    onFollow: () => void;
    onUnfollow: () => void;
  }) => <div data-testid="context-menu" data-hex={aircraft.hex} />,
}));

const { capturedAnimatedSpriteProps } = vi.hoisted(() => ({
  capturedAnimatedSpriteProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("../AnimatedSprite", () => ({
  AnimatedSprite: (props: Record<string, unknown>) => {
    capturedAnimatedSpriteProps.push(props);
    return <div data-testid="animated-sprite" />;
  },
}));

// ---------------------------------------------------------------------------
// Mocks — aircraftIcons (pure functions, but return canned data so we don't
// need to exercise full SVG generation in unit tests)
// ---------------------------------------------------------------------------

const { svgShapeToURI } = vi.hoisted(() => ({
  svgShapeToURI: vi.fn(() => ({
    svg: "data:image/svg+xml;base64,FAKE",
    width: 24,
    height: 24,
  })),
}));

vi.mock("../../../utils/aircraftIcons", () => ({
  getBaseMarker: () => ({ name: "jet_swept", scale: 1.0 }),
  getAircraftColor: () => "#ffffff",
  svgShapeToURI,
  shouldRotate: () => true,
}));

// ---------------------------------------------------------------------------
// Mock — spriteLoader (most tests run with useSprites=false, so this is a
// no-op stub for them; the "marker size (FEAT-MARKER-SIZE)" describe block
// below overrides these to non-null returns for its sprite-mode scale test).
// ---------------------------------------------------------------------------

const { getSpritePosition, getCSSBackgroundSize, getSprite } = vi.hoisted(
  () => ({
    getSpritePosition: vi.fn(
      () =>
        null as null | {
          x: number;
          y: number;
          width: number;
          height: number;
          anchor: { x: number; y: number };
          scale: number;
          shouldRotate: boolean;
          frames?: number[];
          frameTime?: number;
        },
    ),
    getCSSBackgroundSize: vi.fn(() => null as string | null),
    getSprite: vi.fn(
      () => null as null | { spriteName: string; matchType: string },
    ),
  }),
);

vi.mock("../../../utils/spriteLoader", () => ({
  getSpriteLoader: () => ({
    isLoaded: () => true,
    load: () => Promise.resolve(),
    getSprite,
    getSpritePosition,
    getCSSBackgroundSize,
  }),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { AircraftMarkers, type ViewportBounds } from "../AircraftMarkers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeMapBoundsOpts {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface FakeMap {
  getBounds: () => {
    getNorth: () => number;
    getSouth: () => number;
    getEast: () => number;
    getWest: () => number;
  };
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  trigger: (event: string) => void;
}

function makeFakeMap(initial: FakeMapBoundsOpts): FakeMap {
  let bounds = initial;
  const listeners = new Map<string, Set<() => void>>();
  const map: FakeMap = {
    getBounds: () => ({
      getNorth: () => bounds.north,
      getSouth: () => bounds.south,
      getEast: () => bounds.east,
      getWest: () => bounds.west,
    }),
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(handler);
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    trigger: (event) => {
      for (const h of listeners.get(event) ?? []) h();
    },
  };
  // Allow callers to mutate bounds and re-trigger
  Object.defineProperty(map, "setBounds", {
    value: (b: FakeMapBoundsOpts) => {
      bounds = b;
    },
  });
  return map;
}

function makePairedAircraft(
  overrides: Partial<PairedAircraft> = {},
): PairedAircraft {
  return {
    hex: "ABC123",
    lat: 40,
    lon: -74,
    hasMessages: false,
    hasAlerts: false,
    messageCount: 0,
    alertCount: 0,
    decoderTypes: [],
    matchStrategy: "none",
    track: 90,
    ...overrides,
  };
}

/**
 * Set the map ref returned by useMap() and flush the bounds-tracking effect.
 * Run renders inside this helper so the map appears synchronously to the
 * first effect run.
 */
function renderWithMap(
  map: FakeMap | null,
  ui: React.ReactElement,
): ReturnType<typeof render> {
  useMapResult.current = map;
  return render(ui);
}

// requestAnimationFrame in JSDOM defers to next tick; flush synchronously
// for deterministic assertions.
function flushRAF(): void {
  // requestAnimationFrame uses setTimeout(_, 0) under JSDOM
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORLD_BOUNDS: FakeMapBoundsOpts = {
  north: 85,
  south: -85,
  east: 180,
  west: -180,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AircraftMarkers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    capturedMarkers.length = 0;
    capturedAnimatedSpriteProps.length = 0;
    useMapResult.current = null;

    // Reset stores
    useAppStore.setState({
      adsbAircraft: { now: Date.now() / 1000, aircraft: [] },
      messageGroups: new Map(),
      readMessageUids: new Set(),
    });

    // Force the simpler SVG branch (no sprite loading) to keep tests fast
    // and assertions clear.
    const current = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...current,
        map: {
          ...current.map,
          useSprites: false,
          markerSize: "medium",
          showOnlyAcars: false,
          showOnlyUnread: false,
          showOnlyMilitary: false,
          showOnlyInteresting: false,
          showOnlyPIA: false,
          showOnlyLADD: false,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Null / empty paths
  // -------------------------------------------------------------------------

  describe("empty-state rendering", () => {
    it("returns null when adsbAircraft is null", () => {
      useAppStore.setState({ adsbAircraft: null });
      const { container } = renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers />,
      );
      expect(container.querySelector('[data-testid="aircraft-marker"]')).toBe(
        null,
      );
    });

    it("renders no markers when viewportBounds is null (map not yet ready)", () => {
      renderWithMap(
        null,
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      // Without a map, viewportBounds stays null and the cull returns []
      expect(screen.queryAllByTestId("aircraft-marker")).toHaveLength(0);
    });

    it("renders no markers when aircraft array is empty", () => {
      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[]} />,
      );
      flushRAF();
      expect(screen.queryAllByTestId("aircraft-marker")).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  describe("marker rendering", () => {
    it("renders one Marker per visible aircraft at the correct lat/lon", () => {
      const aircraft = [
        makePairedAircraft({ hex: "AAA111", lat: 40, lon: -74 }),
        makePairedAircraft({ hex: "BBB222", lat: 51.5, lon: -0.1 }),
        makePairedAircraft({ hex: "CCC333", lat: 35.7, lon: 139.7 }),
      ];

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      const markers = screen.getAllByTestId("aircraft-marker");
      expect(markers).toHaveLength(3);

      const lats = markers.map((m) => Number(m.getAttribute("data-lat")));
      const lons = markers.map((m) => Number(m.getAttribute("data-lon")));
      expect(lats).toEqual(expect.arrayContaining([40, 51.5, 35.7]));
      expect(lons).toEqual(expect.arrayContaining([-74, -0.1, 139.7]));
    });

    it("skips aircraft missing lat or lon", () => {
      const aircraft = [
        makePairedAircraft({ hex: "AAA111", lat: 40, lon: -74 }),
        makePairedAircraft({
          hex: "NOLAT",
          lat: undefined,
          lon: -74,
        }),
        makePairedAircraft({
          hex: "NOLON",
          lat: 40,
          lon: undefined,
        }),
      ];

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      expect(screen.getAllByTestId("aircraft-marker")).toHaveLength(1);
    });

    it("renders an <img> fallback when useSprites is false", () => {
      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      // FEAT-MARKER-SIZE: the accessible name lives on the outer
      // .aircraft-marker-hit button (aria-label); the <img> inside the
      // decorative inner span is alt="" since it's no longer the
      // accessibility-tree entry point.
      const button = screen.getByRole("button", { name: /Aircraft ABC123/i });
      expect(button.querySelector("img")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // FEAT-MARKER-SIZE
  // -------------------------------------------------------------------------

  describe("marker size (FEAT-MARKER-SIZE)", () => {
    function setMarkerSize(size: "small" | "medium" | "large"): void {
      const current = useSettingsStore.getState().settings;
      useSettingsStore.setState({
        settings: {
          ...current,
          map: { ...current.map, markerSize: size },
        },
      });
    }

    beforeEach(() => {
      svgShapeToURI.mockClear();
    });

    afterEach(() => {
      getSprite.mockReset();
      getSpritePosition.mockReset();
      getCSSBackgroundSize.mockReset();
    });

    it("passes the unscaled factor (1.5x airframe scale) to svgShapeToURI at the default 'medium' setting", () => {
      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      // getBaseMarker is mocked to return scale=1.0; medium multiplier is 1,
      // so the final factor is 1.0 * 1.5 * 1 = 1.5.
      expect(svgShapeToURI).toHaveBeenCalledWith(
        "jet_swept",
        0.5,
        expect.closeTo(1.5, 10),
        "#ffffff",
      );
    });

    it("scales the svgShapeToURI factor down for 'small'", () => {
      setMarkerSize("small");
      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      // 1.0 * 1.5 * 0.8 (small multiplier) = 1.2
      expect(svgShapeToURI).toHaveBeenCalledWith(
        "jet_swept",
        0.5,
        expect.closeTo(1.2, 10),
        "#ffffff",
      );
    });

    it("scales the svgShapeToURI factor up for 'large'", () => {
      setMarkerSize("large");
      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      // 1.0 * 1.5 * 1.25 (large multiplier) = 1.875
      expect(svgShapeToURI).toHaveBeenCalledWith(
        "jet_swept",
        0.5,
        expect.closeTo(1.875, 10),
        "#ffffff",
      );
    });

    it("threads the same scale multiplier into the sprite-atlas lookup calls", () => {
      getSprite.mockReturnValue({
        spriteName: "boeing-737",
        matchType: "airframe",
      });
      getSpritePosition.mockReturnValue({
        x: 0,
        y: 0,
        width: 43.2,
        height: 43.2,
        anchor: { x: 0, y: 0 },
        scale: 1,
        shouldRotate: true,
      });
      getCSSBackgroundSize.mockReturnValue("345.6px 1468.8px");

      const current = useSettingsStore.getState().settings;
      useSettingsStore.setState({
        settings: {
          ...current,
          map: { ...current.map, useSprites: true, markerSize: "small" },
        },
      });

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      // base sprite scale 0.6 * "small" multiplier 0.8 = 0.48
      expect(getSpritePosition).toHaveBeenCalledWith(
        "boeing-737",
        0,
        expect.closeTo(0.48, 10),
      );
      expect(getCSSBackgroundSize).toHaveBeenCalledWith(
        expect.closeTo(0.48, 10),
      );
    });

    // Regression: AnimatedSprite.tsx (used for multi-frame sprites, e.g.
    // rotating-propeller aircraft) independently calls the spriteLoader and
    // needs its own `scale` prop threaded from AircraftMarkers.tsx — it was
    // initially wired into AnimatedSprite's own implementation but the
    // actual <AnimatedSprite scale={...}> prop at the JSX call site in
    // AircraftMarkers.tsx was forgotten, so every animated sprite silently
    // rendered at the default 0.6 scale regardless of the marker-size
    // setting while single-frame (static) sprites scaled correctly —
    // visually, animated aircraft (many light/prop aircraft) appeared
    // "stuck" at their normal size while jets and other static-sprite
    // aircraft grew/shrank with the setting.
    it("passes the same scale multiplier as a prop to AnimatedSprite for multi-frame sprites", () => {
      getSprite.mockReturnValue({
        spriteName: "animated-rotor",
        matchType: "airframe",
      });
      getSpritePosition.mockReturnValue({
        x: 0,
        y: 0,
        width: 43.2,
        height: 43.2,
        anchor: { x: 0, y: 0 },
        scale: 1,
        shouldRotate: true,
        frames: [0, 1, 2],
        frameTime: 100,
      });
      getCSSBackgroundSize.mockReturnValue("345.6px 1468.8px");

      const current = useSettingsStore.getState().settings;
      useSettingsStore.setState({
        settings: {
          ...current,
          map: { ...current.map, useSprites: true, markerSize: "large" },
        },
      });

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[makePairedAircraft()]} />,
      );
      flushRAF();

      expect(capturedAnimatedSpriteProps).toHaveLength(1);
      // base sprite scale 0.6 * "large" multiplier 1.25 = 0.75
      expect(capturedAnimatedSpriteProps[0].scale).toBeCloseTo(0.75, 10);
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe("map setting filters", () => {
    function setMapSetting(key: string, value: boolean): void {
      const current = useSettingsStore.getState().settings;
      useSettingsStore.setState({
        settings: {
          ...current,
          map: { ...current.map, [key]: value },
        },
      });
    }

    it("showOnlyAcars hides aircraft without messages", () => {
      const aircraft = [
        makePairedAircraft({ hex: "WITHMSG", hasMessages: true }),
        makePairedAircraft({ hex: "NOMSG", hasMessages: false }),
      ];
      setMapSetting("showOnlyAcars", true);

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      expect(screen.getAllByTestId("aircraft-marker")).toHaveLength(1);
    });

    it("showOnlyUnread hides aircraft whose messages are all read", () => {
      const readAircraft = makePairedAircraft({
        hex: "READ",
        hasMessages: true,
        matchedGroup: {
          // minimal MessageGroup shape — only `messages` (each w/ `uid`) is read
          identifiers: ["READ"],
          messages: [{ uid: "msg-read-1" }],
        } as unknown as PairedAircraft["matchedGroup"],
      });
      const unreadAircraft = makePairedAircraft({
        hex: "UNREAD",
        hasMessages: true,
        matchedGroup: {
          identifiers: ["UNREAD"],
          messages: [{ uid: "msg-unread-1" }],
        } as unknown as PairedAircraft["matchedGroup"],
      });

      useAppStore.setState({ readMessageUids: new Set(["msg-read-1"]) });
      setMapSetting("showOnlyUnread", true);

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[readAircraft, unreadAircraft]} />,
      );
      flushRAF();

      const markers = screen.getAllByTestId("aircraft-marker");
      expect(markers).toHaveLength(1);
    });

    it("dbFlags filters are additive (matches ANY enabled flag)", () => {
      // dbFlags bits: military=1, interesting=2, PIA=4, LADD=8
      const aircraft = [
        makePairedAircraft({ hex: "MIL", dbFlags: 1 }),
        makePairedAircraft({ hex: "INT", dbFlags: 2 }),
        makePairedAircraft({ hex: "PIA", dbFlags: 4 }),
        makePairedAircraft({ hex: "LADD", dbFlags: 8 }),
        makePairedAircraft({ hex: "PLAIN", dbFlags: 0 }),
      ];

      // Enable military OR LADD — should match MIL + LADD only
      setMapSetting("showOnlyMilitary", true);
      setMapSetting("showOnlyLADD", true);

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      expect(screen.getAllByTestId("aircraft-marker")).toHaveLength(2);
    });

    it("dbFlags filters exclude aircraft whose dbFlags is undefined", () => {
      const aircraft = [
        makePairedAircraft({ hex: "MIL", dbFlags: 1 }),
        makePairedAircraft({ hex: "NOFLAG", dbFlags: undefined }),
      ];
      setMapSetting("showOnlyMilitary", true);

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      expect(screen.getAllByTestId("aircraft-marker")).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Viewport culling
  // -------------------------------------------------------------------------

  describe("viewport culling", () => {
    it("culls aircraft outside the buffered viewport", () => {
      const aircraft = [
        // Within bounds
        makePairedAircraft({ hex: "INSIDE", lat: 40, lon: -74 }),
        // Far north of bounds
        makePairedAircraft({ hex: "OUTSIDE", lat: 80, lon: -74 }),
      ];

      // Tight bounds around NYC; +/- 10% buffer => ~+/-1deg around 40/-74
      renderWithMap(
        makeFakeMap({ north: 41, south: 39, east: -73, west: -75 }),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      expect(screen.getAllByTestId("aircraft-marker")).toHaveLength(1);
      const visible = screen.getByTestId("aircraft-marker");
      expect(Number(visible.getAttribute("data-lat"))).toBe(40);
    });

    it("handles antimeridian crossing (west > east)", () => {
      const aircraft = [
        // east of west=170 (i.e. 175 — inside wrap region)
        makePairedAircraft({ hex: "RIGHTOFWEST", lat: 0, lon: 175 }),
        // west of east=-170 (i.e. -175 — inside wrap region)
        makePairedAircraft({ hex: "LEFTOFEAST", lat: 0, lon: -175 }),
        // between -170..170 (NOT in the wrap region)
        makePairedAircraft({ hex: "MIDDLE", lat: 0, lon: 0 }),
      ];

      // Wrapping viewport: west=170, east=-170 — covers Pacific antimeridian
      renderWithMap(
        makeFakeMap({ north: 10, south: -10, east: -170, west: 170 }),
        <AircraftMarkers aircraft={aircraft} />,
      );
      flushRAF();

      const markers = screen.getAllByTestId("aircraft-marker");
      // Should see RIGHTOFWEST and LEFTOFEAST but not MIDDLE
      expect(markers).toHaveLength(2);
      const lons = markers
        .map((m) => Number(m.getAttribute("data-lon")))
        .sort();
      expect(lons).toEqual([-175, 175]);
    });
  });

  // -------------------------------------------------------------------------
  // onViewportBoundsChange callback
  // -------------------------------------------------------------------------

  describe("onViewportBoundsChange callback", () => {
    it("fires with the raw (unbuffered) bounds on initial render", () => {
      const onChange = vi.fn();
      renderWithMap(
        makeFakeMap({ north: 50, south: 30, east: 10, west: -10 }),
        <AircraftMarkers
          aircraft={[makePairedAircraft()]}
          onViewportBoundsChange={onChange}
        />,
      );
      flushRAF();

      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls.at(-1)?.[0] as ViewportBounds;
      expect(lastCall).toEqual({
        north: 50,
        south: 30,
        east: 10,
        west: -10,
      });
    });

    it("fires with null when the component unmounts", () => {
      const onChange = vi.fn();
      const { unmount } = renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers
          aircraft={[makePairedAircraft()]}
          onViewportBoundsChange={onChange}
        />,
      );
      flushRAF();
      onChange.mockClear();

      unmount();

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it("re-fires when the map emits a move event", () => {
      const onChange = vi.fn();
      const fakeMap = makeFakeMap({
        north: 50,
        south: 30,
        east: 10,
        west: -10,
      });
      renderWithMap(
        fakeMap,
        <AircraftMarkers
          aircraft={[makePairedAircraft()]}
          onViewportBoundsChange={onChange}
        />,
      );
      flushRAF();
      onChange.mockClear();

      // Update bounds and trigger a move event
      (
        fakeMap as unknown as { setBounds: (b: FakeMapBoundsOpts) => void }
      ).setBounds({ north: 60, south: 40, east: 20, west: 0 });
      act(() => {
        fakeMap.trigger("move");
      });
      flushRAF();

      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls.at(-1)?.[0] as ViewportBounds;
      expect(lastCall).toEqual({
        north: 60,
        south: 40,
        east: 20,
        west: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Click / context-menu interactions
  // -------------------------------------------------------------------------

  describe("marker interactions", () => {
    it("clicking a marker with matched messages opens the messages modal", () => {
      const aircraft = makePairedAircraft({
        hex: "CLICKME",
        hasMessages: true,
        matchedGroup: {
          identifiers: ["CLICKME"],
          messages: [{ uid: "m1" }],
        } as unknown as PairedAircraft["matchedGroup"],
      });

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[aircraft]} />,
      );
      flushRAF();

      const button = screen.getByRole("button", { name: /Aircraft CLICKME/i });
      fireEvent.click(button);

      expect(screen.queryByTestId("messages-modal-open")).toBeTruthy();
    });

    it("clicking a marker without messages does NOT open the modal", () => {
      const aircraft = makePairedAircraft({
        hex: "PLAIN",
        hasMessages: false,
      });

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[aircraft]} />,
      );
      flushRAF();

      const button = screen.getByRole("button", { name: /Aircraft PLAIN/i });
      fireEvent.click(button);

      expect(screen.queryByTestId("messages-modal-open")).toBe(null);
    });

    it("right-clicking a marker opens the context menu", () => {
      const aircraft = makePairedAircraft({ hex: "RIGHTC" });

      renderWithMap(
        makeFakeMap(WORLD_BOUNDS),
        <AircraftMarkers aircraft={[aircraft]} />,
      );
      flushRAF();

      const button = screen.getByRole("button", { name: /Aircraft RIGHTC/i });
      fireEvent.contextMenu(button);

      const menu = screen.getByTestId("context-menu");
      expect(menu.getAttribute("data-hex")).toBe("RIGHTC");
    });
  });
});

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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAircraftColor,
  getBaseMarker,
  shouldRotate,
  svgShapeToURI,
} from "../aircraftIcons";

// ---------------------------------------------------------------------------
// getBaseMarker
// ---------------------------------------------------------------------------

describe("getBaseMarker", () => {
  describe("type designator lookup (highest priority)", () => {
    it("returns airliner shape for B738 (Boeing 737-800)", () => {
      const result = getBaseMarker(undefined, "B738");
      expect(result.name).toBe("airliner");
    });

    it("returns a380 shape for A388", () => {
      const result = getBaseMarker(undefined, "A388");
      expect(result.name).toBe("a380");
    });

    it("returns a scale value for a known type designator", () => {
      const result = getBaseMarker(undefined, "B738");
      expect(typeof result.scale).toBe("number");
    });

    it("type designator overrides category when both provided", () => {
      // A7 category maps to "helicopter"; B738 type designator maps to "airliner"
      // The designator lookup should win when both are supplied
      const withDesignator = getBaseMarker("A7", "B738");
      const withoutDesignator = getBaseMarker("A7", undefined);
      // With designator: airliner; without: helicopter (A7 category)
      expect(withDesignator.name).toBe("airliner");
      expect(withoutDesignator.name).toBe("helicopter");
    });
  });

  describe("type description lookup", () => {
    it("returns helicopter shape for a 3-char description starting with H", () => {
      // The code requires typeDescription.length === 3.
      // "H1P" is not a known 3-char key, so it falls back to basicType = "H"
      // which maps to "helicopter" in TypeDescriptionIcons.
      const result = getBaseMarker(undefined, undefined, "H1P");
      expect(result.name).toBe("helicopter");
    });

    it("returns gyrocopter shape for a 3-char description starting with G", () => {
      // "G1P" falls back to basicType = "G" → "gyrocopter"
      const result = getBaseMarker(undefined, undefined, "G1P");
      expect(result.name).toBe("gyrocopter");
    });

    it("single-char typeDescription is ignored (length !== 3) — returns unknown", () => {
      // The code only processes typeDescription when length === 3.
      // Passing "H" alone skips the entire block and falls through to unknown.
      const result = getBaseMarker(undefined, undefined, "H");
      expect(result.name).toBe("unknown");
    });

    it("uses type+WTC variant when both are provided", () => {
      // L2J-M is a known combined key
      const result = getBaseMarker(undefined, undefined, "L2J", "M");
      expect(typeof result.name).toBe("string");
      expect(result.name.length).toBeGreaterThan(0);
    });

    it("falls back to base type without WTC when combined key is unknown", () => {
      // L2J without WTC should match the L2J description key
      const withoutWtc = getBaseMarker(undefined, undefined, "L2J");
      expect(typeof withoutWtc.name).toBe("string");
    });

    it("falls back to single-character type when 3-char description not found", () => {
      // "LXX" is not a known 3-char key; basicType = "L" → single-char fallback
      const result = getBaseMarker(undefined, undefined, "LXX");
      expect(typeof result.name).toBe("string");
      expect(result.name.length).toBeGreaterThan(0);
    });
  });

  describe("category lookup", () => {
    it("returns a shape for category A1 (light aircraft)", () => {
      const result = getBaseMarker("A1");
      expect(typeof result.name).toBe("string");
      expect(result.name.length).toBeGreaterThan(0);
    });

    it("returns a shape for category A3 (large aircraft)", () => {
      const result = getBaseMarker("A3");
      expect(typeof result.name).toBe("string");
    });

    it("returns glider shape for category B1 (glider/sailplane)", () => {
      const result = getBaseMarker("B1");
      expect(result.name).toBe("glider");
    });

    it("returns a shape for category C0 (ground vehicle — unknown)", () => {
      const result = getBaseMarker("C0");
      expect(typeof result.name).toBe("string");
    });
  });

  describe("ground altitude fallback", () => {
    it('returns ground_square when altitude is "ground" and nothing else matches', () => {
      const result = getBaseMarker(
        undefined,
        undefined,
        undefined,
        undefined,
        "ground",
      );
      expect(result.name).toBe("ground_square");
    });
  });

  describe("unknown fallback", () => {
    it("returns unknown shape when nothing matches", () => {
      const result = getBaseMarker();
      expect(result.name).toBe("unknown");
      expect(result.scale).toBe(1);
    });

    it("returns unknown for unrecognised type designator", () => {
      // ZZZZZ is not a real type designator
      const result = getBaseMarker(undefined, "ZZZZZ");
      expect(result.name).toBe("unknown");
    });

    it("returns unknown for unrecognised category", () => {
      const result = getBaseMarker("Z9");
      expect(result.name).toBe("unknown");
    });
  });
});

// ---------------------------------------------------------------------------
// svgShapeToURI
// ---------------------------------------------------------------------------

describe("svgShapeToURI", () => {
  it("returns a data URI for a known shape", () => {
    const result = svgShapeToURI("airliner");
    expect(result.svg).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("returns width and height numbers", () => {
    const result = svgShapeToURI("airliner");
    expect(typeof result.width).toBe("number");
    expect(typeof result.height).toBe("number");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("applies scale to width and height", () => {
    const base = svgShapeToURI("airliner", 0.5, 1.0);
    const scaled = svgShapeToURI("airliner", 0.5, 2.0);
    expect(scaled.width).toBe(base.width * 2);
    expect(scaled.height).toBe(base.height * 2);
  });

  it("falls back to the unknown shape for unrecognised shape names", () => {
    const result = svgShapeToURI("not_a_real_shape_xyz");
    // Should not throw; should produce a valid data URI
    expect(result.svg).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("encodes different colors into the SVG data", () => {
    const white = svgShapeToURI("airliner", 0.5, 1.0, "#ffffff");
    const red = svgShapeToURI("airliner", 0.5, 1.0, "#ff0000");
    // Different colors → different base64 payloads
    expect(white.svg).not.toBe(red.svg);
  });

  it("returns a valid base64-decodable payload containing svg tag", () => {
    const result = svgShapeToURI("airliner");
    const base64 = result.svg.replace("data:image/svg+xml;base64,", "");
    const decoded = atob(base64);
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("</svg>");
  });

  it("handles a shape that uses a pre-built svg string (ground_emergency)", () => {
    // ground_emergency is defined with a raw `svg` property rather than a path
    const result = svgShapeToURI("ground_emergency");
    expect(result.svg).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("handles a shape with accent paths (para)", () => {
    const result = svgShapeToURI("para");
    expect(result.svg).toMatch(/^data:image\/svg\+xml;base64,/);
    const decoded = atob(result.svg.replace("data:image/svg+xml;base64,", ""));
    // Should have multiple path elements (main + accent)
    const pathCount = (decoded.match(/<path/g) || []).length;
    expect(pathCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// getAircraftColor
// ---------------------------------------------------------------------------

describe("getAircraftColor", () => {
  // We mock getComputedStyle so the tests don't depend on a real CSS environment
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (prop: string) => {
        const map: Record<string, string> = {
          "--color-red": "#ff0000",
          "--color-green": "#00ff00",
          "--color-blue": "#0000ff",
          "--color-yellow": "#ffff00",
          "--color-peach": "#ffaa00",
          "--color-mauve": "#aa00ff",
          "--color-overlay1": "#888888",
          "--color-text": "#ffffff",
        };
        return map[prop] ?? "";
      },
    } as unknown as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("alert priority", () => {
    it("returns red when hasAlerts is true, regardless of other flags", () => {
      expect(getAircraftColor(true, true, 35000)).toBe("#ff0000");
      expect(getAircraftColor(true, false, "ground")).toBe("#ff0000");
      expect(getAircraftColor(true, false, undefined, true, "ACARS")).toBe(
        "#ff0000",
      );
    });
  });

  describe("decoder coloring", () => {
    it("returns blue for ACARS decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "ACARS")).toBe(
        "#0000ff",
      );
    });

    it("returns green for VDLM decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "VDLM")).toBe(
        "#00ff00",
      );
    });

    it("returns green for VDL-M2 decoder type (alias)", () => {
      expect(getAircraftColor(false, false, undefined, true, "VDL-M2")).toBe(
        "#00ff00",
      );
    });

    it("returns yellow for HFDL decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "HFDL")).toBe(
        "#ffff00",
      );
    });

    it("returns peach for IMSL decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "IMSL")).toBe(
        "#ffaa00",
      );
    });

    it("returns mauve for IRDM decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "IRDM")).toBe(
        "#aa00ff",
      );
    });

    it("is case-insensitive for decoder type", () => {
      expect(getAircraftColor(false, false, undefined, true, "acars")).toBe(
        "#0000ff",
      );
    });

    it("falls through decoder coloring when colorByDecoder is false", () => {
      // Even with a decoder type provided, colorByDecoder=false means use message state
      const result = getAircraftColor(false, true, undefined, false, "ACARS");
      expect(result).toBe("#00ff00"); // green = hasMessages
    });

    it("falls through decoder coloring when decoder type is empty string", () => {
      // colorByDecoder=true but no type → should not match any decoder case
      const result = getAircraftColor(false, true, undefined, true, "");
      expect(result).toBe("#00ff00"); // green = hasMessages
    });
  });

  describe("message state coloring", () => {
    it("returns green when hasMessages is true and no alerts/decoder override", () => {
      expect(getAircraftColor(false, true, 35000)).toBe("#00ff00");
    });
  });

  describe("ground coloring", () => {
    it('returns overlay1 when altitude is the string "ground"', () => {
      expect(getAircraftColor(false, false, "ground")).toBe("#888888");
    });

    it("returns overlay1 when altitude is at or below the default threshold (500)", () => {
      expect(getAircraftColor(false, false, 500)).toBe("#888888");
      expect(getAircraftColor(false, false, 0)).toBe("#888888");
      expect(getAircraftColor(false, false, 499)).toBe("#888888");
    });

    it("does NOT return overlay1 when altitude is above the threshold", () => {
      expect(getAircraftColor(false, false, 501)).toBe("#ffffff"); // text color
    });

    it("respects a custom ground threshold", () => {
      expect(getAircraftColor(false, false, 1000, false, undefined, 1000)).toBe(
        "#888888",
      );
      expect(getAircraftColor(false, false, 1001, false, undefined, 1000)).toBe(
        "#ffffff",
      );
    });
  });

  describe("default (airborne, no messages)", () => {
    it("returns text color when airborne and no messages", () => {
      expect(getAircraftColor(false, false, 35000)).toBe("#ffffff");
    });

    it("returns text color when altitude is undefined", () => {
      expect(getAircraftColor(false, false, undefined)).toBe("#ffffff");
    });
  });
});

// ---------------------------------------------------------------------------
// shouldRotate
// ---------------------------------------------------------------------------

describe("shouldRotate", () => {
  it("returns true for shapes that should rotate (airliner has no noRotate flag)", () => {
    expect(shouldRotate("airliner")).toBe(true);
  });

  it("returns false for shapes marked with noRotate (balloon)", () => {
    // 'balloon' has noRotate: true
    expect(shouldRotate("balloon")).toBe(false);
  });

  it("returns false for ground_square (noRotate: true)", () => {
    expect(shouldRotate("ground_square")).toBe(false);
  });

  it("returns true for helicopter (no noRotate flag)", () => {
    expect(shouldRotate("helicopter")).toBe(true);
  });

  it("returns true for an unknown shape (shape not found, noRotate is undefined → !undefined = true)", () => {
    expect(shouldRotate("completely_unknown_xyz")).toBe(true);
  });
});

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

import { describe, expect, it } from "vitest";
import type { ADSBAircraft, MessageGroup } from "../../types";
import {
  formatAltitude,
  formatGroundSpeed,
  formatHeading,
  getDisplayCallsign,
  type PairedAircraft,
  pairADSBWithACARSMessages,
} from "../aircraftPairing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAircraft(overrides: Partial<ADSBAircraft> = {}): ADSBAircraft {
  return {
    hex: "A12345",
    ...overrides,
  };
}

function makeGroup(
  identifiers: string[],
  overrides: Partial<MessageGroup> = {},
): MessageGroup {
  return {
    identifiers,
    has_alerts: false,
    num_alerts: 0,
    messages: [],
    lastUpdated: Date.now() / 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pairADSBWithACARSMessages
// ---------------------------------------------------------------------------

describe("pairADSBWithACARSMessages", () => {
  describe("matching strategies", () => {
    it("matches by hex (ICAO 24-bit address) — strategy 1", () => {
      const aircraft = [makeAircraft({ hex: "a12345" })]; // lowercase
      const groups = new Map([["A12345", makeGroup(["A12345"])]]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result).toHaveLength(1);
      expect(result[0].matchStrategy).toBe("hex");
      expect(result[0].hasMessages).toBe(false); // group has no messages
      expect(result[0].matchedGroup).toBeDefined();
    });

    it("matches by ICAO callsign (flight) — strategy 2, when hex not in any group", () => {
      const aircraft = [
        makeAircraft({ hex: "FFFFFF", flight: "UAL123 " }), // trailing space
      ];
      const groups = new Map([["UAL123", makeGroup(["UAL123"])]]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result).toHaveLength(1);
      expect(result[0].matchStrategy).toBe("flight");
      expect(result[0].flight).toBe("UAL123"); // trimmed
    });

    it("matches by tail/registration — strategy 3", () => {
      const aircraft = [
        makeAircraft({ hex: "FFFFFF", flight: "XYZ999", r: "N12345" }),
      ];
      // hex and flight not in groups, but tail is
      const groups = new Map([["N12345", makeGroup(["N12345"])]]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result).toHaveLength(1);
      expect(result[0].matchStrategy).toBe("tail");
      expect(result[0].tail).toBe("N12345");
    });

    it("hex takes priority over flight and tail matches", () => {
      const aircraft = [
        makeAircraft({ hex: "A12345", flight: "UAL123", r: "N12345" }),
      ];
      // all three identifiers map to different groups
      const groups = new Map<string, MessageGroup>([
        ["A12345", makeGroup(["A12345"])],
        ["UAL123", makeGroup(["UAL123"])],
        ["N12345", makeGroup(["N12345"])],
      ]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result[0].matchStrategy).toBe("hex");
      expect(result[0].matchedGroup).toEqual(groups.get("A12345"));
    });

    it("flight takes priority over tail when hex does not match", () => {
      const aircraft = [
        makeAircraft({ hex: "FFFFFF", flight: "UAL123", r: "N12345" }),
      ];
      const groups = new Map<string, MessageGroup>([
        ["UAL123", makeGroup(["UAL123"])],
        ["N12345", makeGroup(["N12345"])],
      ]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result[0].matchStrategy).toBe("flight");
      expect(result[0].matchedGroup).toEqual(groups.get("UAL123"));
    });

    it("returns strategy=none when nothing matches", () => {
      const aircraft = [makeAircraft({ hex: "FFFFFF", flight: "XYZ999" })];
      const groups = new Map([["A12345", makeGroup(["A12345"])]]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result[0].matchStrategy).toBe("none");
      expect(result[0].matchedGroup).toBeUndefined();
      expect(result[0].hasMessages).toBe(false);
    });
  });

  describe("PairedAircraft construction", () => {
    it("hasMessages is true when matched group contains messages", () => {
      const aircraft = [makeAircraft({ hex: "A12345" })];
      const group = makeGroup(["A12345"], {
        messages: [
          {
            uid: "msg-1",
            station_id: "TEST",
            text: "hello",
            timestamp: 1000,
            matched: false,
            matched_text: [],
          } as unknown as ReturnType<typeof makeGroup>["messages"][number],
        ],
      });
      const groups = new Map([["A12345", group]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.hasMessages).toBe(true);
      expect(paired.messageCount).toBe(1);
    });

    it("hasAlerts is true when matched group has alerts", () => {
      const aircraft = [makeAircraft({ hex: "A12345" })];
      const group = makeGroup(["A12345"], {
        has_alerts: true,
        num_alerts: 3,
        messages: [{} as never, {} as never, {} as never],
      });
      const groups = new Map([["A12345", group]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.hasAlerts).toBe(true);
      expect(paired.alertCount).toBe(3);
    });

    it("copies all ADS-B fields onto paired object", () => {
      const aircraft = [
        makeAircraft({
          hex: "A12345",
          flight: "UAL123",
          r: "N12345",
          lat: 40.71,
          lon: -74.0,
          alt_baro: 35000,
          gs: 450,
          track: 90,
          category: "A3",
          t: "B738",
          dbFlags: 1,
        }),
      ];
      const groups = new Map<string, MessageGroup>();

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.hex).toBe("A12345");
      expect(paired.flight).toBe("UAL123");
      expect(paired.tail).toBe("N12345");
      expect(paired.lat).toBe(40.71);
      expect(paired.lon).toBe(-74.0);
      expect(paired.alt_baro).toBe(35000);
      expect(paired.gs).toBe(450);
      expect(paired.track).toBe(90);
      expect(paired.category).toBe("A3");
      expect(paired.type).toBe("B738");
      expect(paired.dbFlags).toBe(1);
    });

    it("prefers `t` field over `type` field for aircraft type", () => {
      const aircraft = [
        makeAircraft({ hex: "A12345", t: "B738", type: "B737" }),
      ];
      const groups = new Map<string, MessageGroup>();

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.type).toBe("B738");
    });

    it("falls back to `type` field when `t` is absent", () => {
      const aircraft = [makeAircraft({ hex: "A12345", type: "B737" })];
      const groups = new Map<string, MessageGroup>();

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.type).toBe("B737");
    });

    it("returns hasMessages=false and messageCount=0 when no match", () => {
      const aircraft = [makeAircraft({ hex: "FFFFFF" })];
      const groups = new Map<string, MessageGroup>();

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.hasMessages).toBe(false);
      expect(paired.messageCount).toBe(0);
      expect(paired.hasAlerts).toBe(false);
      expect(paired.alertCount).toBe(0);
    });

    it("processes an empty aircraft array", () => {
      const result = pairADSBWithACARSMessages([], new Map());
      expect(result).toHaveLength(0);
    });

    it("processes multiple aircraft in one call", () => {
      const aircraft = [
        makeAircraft({ hex: "A11111", flight: "AAL100" }),
        makeAircraft({ hex: "B22222", flight: "DAL200" }),
        makeAircraft({ hex: "C33333" }),
      ];
      const groups = new Map<string, MessageGroup>([
        ["A11111", makeGroup(["A11111"])],
        ["DAL200", makeGroup(["DAL200"])],
      ]);

      const result = pairADSBWithACARSMessages(aircraft, groups);

      expect(result).toHaveLength(3);
      expect(result[0].matchStrategy).toBe("hex"); // A11111 matched
      expect(result[1].matchStrategy).toBe("flight"); // B22222 not matched by hex, DAL200 by flight
      expect(result[2].matchStrategy).toBe("none"); // C33333 unmatched
    });
  });

  describe("identifier normalisation", () => {
    it("normalises aircraft hex to uppercase before matching", () => {
      const aircraft = [makeAircraft({ hex: "a1b2c3" })];
      const groups = new Map([["A1B2C3", makeGroup(["A1B2C3"])]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.matchStrategy).toBe("hex");
    });

    it("normalises flight to uppercase and trims whitespace", () => {
      const aircraft = [makeAircraft({ hex: "FFFFFF", flight: " ual123 " })];
      const groups = new Map([["UAL123", makeGroup(["UAL123"])]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.matchStrategy).toBe("flight");
      expect(paired.flight).toBe("UAL123");
    });

    it("ignores empty/whitespace-only flight strings", () => {
      const aircraft = [makeAircraft({ hex: "FFFFFF", flight: "   " })];
      const groups = new Map([["   ", makeGroup(["   "])]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      // Whitespace-only flight must not match
      expect(paired.matchStrategy).toBe("none");
      expect(paired.flight).toBeUndefined();
    });

    it("ignores empty/whitespace-only tail strings", () => {
      const aircraft = [makeAircraft({ hex: "FFFFFF", r: "  " })];
      const groups = new Map([["  ", makeGroup(["  "])]]);

      const [paired] = pairADSBWithACARSMessages(aircraft, groups);

      expect(paired.matchStrategy).toBe("none");
      expect(paired.tail).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// getDisplayCallsign
// ---------------------------------------------------------------------------

describe("getDisplayCallsign", () => {
  const base: PairedAircraft = {
    hex: "a12345",
    hasMessages: false,
    hasAlerts: false,
    messageCount: 0,
    alertCount: 0,
    matchStrategy: "none",
  };

  it("returns flight when present", () => {
    expect(getDisplayCallsign({ ...base, flight: "UAL123" })).toBe("UAL123");
  });

  it("returns tail when flight is absent", () => {
    expect(getDisplayCallsign({ ...base, tail: "N12345" })).toBe("N12345");
  });

  it("returns uppercase hex when both flight and tail are absent", () => {
    expect(getDisplayCallsign(base)).toBe("A12345");
  });

  it("prefers flight over tail", () => {
    expect(
      getDisplayCallsign({ ...base, flight: "UAL123", tail: "N12345" }),
    ).toBe("UAL123");
  });
});

// ---------------------------------------------------------------------------
// formatAltitude
// ---------------------------------------------------------------------------

describe("formatAltitude", () => {
  it('returns "N/A" when altitude is undefined', () => {
    expect(formatAltitude(undefined)).toBe("N/A");
  });

  it('returns "N/A" when altitude is null', () => {
    // @ts-expect-error — testing runtime null guard
    expect(formatAltitude(null)).toBe("N/A");
  });

  it('returns "Ground" when altitude is the string "ground"', () => {
    expect(formatAltitude("ground")).toBe("Ground");
  });

  it('returns "Ground" when altitude is 0', () => {
    expect(formatAltitude(0)).toBe("Ground");
  });

  it("returns feet formatted with toLocaleString by default", () => {
    // 35000 feet → "35,000" (locale-dependent; we just assert it contains "35")
    const result = formatAltitude(35000);
    expect(result).toContain("35");
    expect(result).not.toContain("m");
  });

  it("converts feet to metres when unit is meters", () => {
    // 3281 ft ≈ 1000 m
    const result = formatAltitude(3281, "meters");
    // Should be close to 1000 m (within rounding)
    const num = Number.parseInt(result.replace(/,/g, ""), 10);
    expect(num).toBeGreaterThanOrEqual(999);
    expect(num).toBeLessThanOrEqual(1001);
  });

  it("rounds metres to nearest integer", () => {
    // 100 ft × 0.3048 = 30.48 → 30 m
    expect(formatAltitude(100, "meters")).toBe("30");
  });

  it("does not append a unit suffix in either mode", () => {
    expect(formatAltitude(10000, "feet")).not.toMatch(/ft|feet/i);
    expect(formatAltitude(10000, "meters")).not.toMatch(/m|meter/i);
  });
});

// ---------------------------------------------------------------------------
// formatGroundSpeed
// ---------------------------------------------------------------------------

describe("formatGroundSpeed", () => {
  it('returns "N/A" when speed is undefined', () => {
    expect(formatGroundSpeed(undefined)).toBe("N/A");
  });

  it('returns "N/A" when speed is null', () => {
    // @ts-expect-error — testing runtime null guard
    expect(formatGroundSpeed(null)).toBe("N/A");
  });

  it("returns rounded integer string for whole-number speed", () => {
    expect(formatGroundSpeed(450)).toBe("450");
  });

  it("rounds fractional speeds", () => {
    expect(formatGroundSpeed(449.7)).toBe("450");
    expect(formatGroundSpeed(449.2)).toBe("449");
  });

  it("handles zero speed", () => {
    expect(formatGroundSpeed(0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatHeading
// ---------------------------------------------------------------------------

describe("formatHeading", () => {
  it('returns "N/A" when heading is undefined', () => {
    expect(formatHeading(undefined)).toBe("N/A");
  });

  it('returns "N/A" when heading is null', () => {
    // @ts-expect-error — testing runtime null guard
    expect(formatHeading(null)).toBe("N/A");
  });

  it("appends degree symbol", () => {
    expect(formatHeading(90)).toBe("90°");
    expect(formatHeading(0)).toBe("0°");
    expect(formatHeading(359)).toBe("359°");
  });

  it("rounds fractional headings", () => {
    expect(formatHeading(90.7)).toBe("91°");
    expect(formatHeading(90.2)).toBe("90°");
  });

  it("handles 360 degrees", () => {
    expect(formatHeading(360)).toBe("360°");
  });
});

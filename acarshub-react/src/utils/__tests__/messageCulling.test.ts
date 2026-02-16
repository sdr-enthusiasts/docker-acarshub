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

import { beforeEach, describe, expect, it } from "vitest";
import type { ADSBData, MessageGroup } from "../../types";
import { cullMessageGroups, isGroupPairedWithADSB } from "../messageCulling";

describe("messageCulling", () => {
  describe("isGroupPairedWithADSB", () => {
    let mockAdsbData: ADSBData;

    beforeEach(() => {
      mockAdsbData = {
        now: Date.now() / 1000,
        aircraft: [
          {
            hex: "A12345",
            flight: "UAL123",
            r: "N12345",
            lat: 40.7128,
            lon: -74.006,
            alt_baro: 35000,
            gs: 450,
            track: 90,
          },
          {
            hex: "B67890",
            flight: "DAL456",
            r: "N67890",
            lat: 34.0522,
            lon: -118.2437,
            alt_baro: 38000,
            gs: 480,
            track: 270,
          },
          {
            hex: "C11111",
            // No flight or tail
            lat: 35.0,
            lon: -120.0,
            alt_baro: 5000,
            gs: 120,
            track: 180,
          },
        ],
      };
    });

    it("should return false when ADS-B data is null", () => {
      const group: MessageGroup = {
        identifiers: ["UAL123", "N12345", "A12345"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, null)).toBe(false);
    });

    it("should return false when ADS-B aircraft array is empty", () => {
      const group: MessageGroup = {
        identifiers: ["UAL123"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      const emptyAdsbData: ADSBData = {
        now: Date.now() / 1000,
        aircraft: [],
      };

      expect(isGroupPairedWithADSB(group, emptyAdsbData)).toBe(false);
    });

    it("should match by hex (case-insensitive)", () => {
      const group: MessageGroup = {
        identifiers: ["A12345"], // Uppercase (matches how identifiers are stored in real app)
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(true);
    });

    it("should match by ICAO callsign (flight)", () => {
      const group: MessageGroup = {
        identifiers: ["UAL123"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(true);
    });

    it("should match by tail/registration", () => {
      const group: MessageGroup = {
        identifiers: ["N12345"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(true);
    });

    it("should match when group has multiple identifiers (any match)", () => {
      const group: MessageGroup = {
        identifiers: ["UNKNOWN", "UAL123", "FOOBAR"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(true);
    });

    it("should not match when no identifiers match", () => {
      const group: MessageGroup = {
        identifiers: ["AAL999", "N99999", "Z99999"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(false);
    });

    it("should handle aircraft with only hex (no flight or tail)", () => {
      const group: MessageGroup = {
        identifiers: ["C11111"],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, mockAdsbData)).toBe(true);
    });

    it("should handle empty flight string gracefully", () => {
      const adsbDataWithEmptyFlight: ADSBData = {
        now: Date.now() / 1000,
        aircraft: [
          {
            hex: "A12345",
            flight: "   ", // Empty/whitespace
            lat: 40.0,
            lon: -74.0,
          },
        ],
      };

      const group: MessageGroup = {
        identifiers: ["   "], // Matching empty string
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: Date.now() / 1000,
      };

      expect(isGroupPairedWithADSB(group, adsbDataWithEmptyFlight)).toBe(false);
    });
  });

  describe("cullMessageGroups", () => {
    let mockAdsbData: ADSBData;

    beforeEach(() => {
      mockAdsbData = {
        now: Date.now() / 1000,
        aircraft: [
          {
            hex: "A12345",
            flight: "UAL123",
            r: "N12345",
            lat: 40.7128,
            lon: -74.006,
            alt_baro: 35000,
            gs: 450,
            track: 90,
          },
          {
            hex: "B67890",
            flight: "DAL456",
            lat: 34.0522,
            lon: -118.2437,
            alt_baro: 38000,
            gs: 480,
            track: 270,
          },
        ],
      };
    });

    it("should not cull when under the limit", () => {
      const messageGroups = new Map<string, MessageGroup>([
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
        [
          "DAL456",
          {
            identifiers: ["DAL456", "B67890"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 2000,
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 10, mockAdsbData);

      expect(result.size).toBe(2);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("DAL456")).toBe(true);
    });

    it("should keep all ADS-B-paired groups and remove oldest not-paired", () => {
      const messageGroups = new Map<string, MessageGroup>([
        // ADS-B-paired (should be kept)
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
        [
          "DAL456",
          {
            identifiers: ["DAL456", "B67890"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 2000,
          },
        ],
        // Not paired (candidates for culling)
        [
          "OLD1",
          {
            identifiers: ["OLD1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 500, // Oldest
          },
        ],
        [
          "OLD2",
          {
            identifiers: ["OLD2"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 800,
          },
        ],
        [
          "OLD3",
          {
            identifiers: ["OLD3"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1500, // Newest not-paired
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 3, mockAdsbData);

      // Should keep: UAL123, DAL456 (paired), and OLD3 (newest not-paired)
      expect(result.size).toBe(3);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("DAL456")).toBe(true);
      expect(result.has("OLD3")).toBe(true);

      // Should remove: OLD1 (oldest) and OLD2
      expect(result.has("OLD1")).toBe(false);
      expect(result.has("OLD2")).toBe(false);
    });

    it("should never remove ADS-B-paired groups even if old", () => {
      const messageGroups = new Map<string, MessageGroup>([
        // ADS-B-paired but very old (should still be kept)
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 100, // Very old
          },
        ],
        [
          "DAL456",
          {
            identifiers: ["DAL456", "B67890"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 200, // Very old
          },
        ],
        // Not paired but newer (should be removed)
        [
          "NEW1",
          {
            identifiers: ["NEW1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 5000, // Much newer
          },
        ],
        [
          "NEW2",
          {
            identifiers: ["NEW2"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 6000, // Much newer
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 2, mockAdsbData);

      // Should keep: UAL123, DAL456 (paired, rescued from culling)
      // Should also keep: NEW1, NEW2 (newest 2 groups within limit)
      // Total: 4 groups (exceeds limit because we never cull paired aircraft)
      expect(result.size).toBe(4);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("DAL456")).toBe(true);
      expect(result.has("NEW1")).toBe(true);
      expect(result.has("NEW2")).toBe(true);
    });

    it("should handle case when all groups are ADS-B-paired (exceed limit)", () => {
      const messageGroups = new Map<string, MessageGroup>([
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
        [
          "DAL456",
          {
            identifiers: ["DAL456", "B67890"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 2000,
          },
        ],
      ]);

      // Limit is 1, but we have 2 paired groups
      const result = cullMessageGroups(messageGroups, 1, mockAdsbData);

      // Should keep both (don't lose active aircraft data)
      expect(result.size).toBe(2);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("DAL456")).toBe(true);
    });

    it("should cull all groups when ADS-B is disabled (null)", () => {
      const messageGroups = new Map<string, MessageGroup>([
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 3000, // Newest
          },
        ],
        [
          "DAL456",
          {
            identifiers: ["DAL456"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 2000,
          },
        ],
        [
          "OLD1",
          {
            identifiers: ["OLD1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000, // Oldest
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 2, null);

      // Should keep newest 2 groups (UAL123, DAL456)
      expect(result.size).toBe(2);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("DAL456")).toBe(true);

      // Should remove oldest (OLD1)
      expect(result.has("OLD1")).toBe(false);
    });

    it("should handle empty message groups map", () => {
      const messageGroups = new Map<string, MessageGroup>();

      const result = cullMessageGroups(messageGroups, 10, mockAdsbData);

      expect(result.size).toBe(0);
    });

    it("should handle maxGroups of 0", () => {
      const messageGroups = new Map<string, MessageGroup>([
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 0, mockAdsbData);

      // Even with limit 0, keep paired groups (don't lose active aircraft)
      expect(result.size).toBe(1);
      expect(result.has("UAL123")).toBe(true);
    });

    it("should preserve groups with alerts when not-paired", () => {
      const messageGroups = new Map<string, MessageGroup>([
        // ADS-B-paired
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
        // Not paired but has alerts (newest)
        [
          "ALERT1",
          {
            identifiers: ["ALERT1"],
            has_alerts: true,
            num_alerts: 2,
            messages: [],
            lastUpdated: 5000,
          },
        ],
        // Not paired, no alerts (oldest)
        [
          "OLD1",
          {
            identifiers: ["OLD1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 500,
          },
        ],
      ]);

      const result = cullMessageGroups(messageGroups, 2, mockAdsbData);

      // Should keep: UAL123 (paired), ALERT1 (newest not-paired)
      expect(result.size).toBe(2);
      expect(result.has("UAL123")).toBe(true);
      expect(result.has("ALERT1")).toBe(true);

      // Should remove: OLD1 (oldest not-paired)
      expect(result.has("OLD1")).toBe(false);
    });

    it("should keep newest not-paired groups when some slots available", () => {
      const messageGroups = new Map<string, MessageGroup>([
        // ADS-B-paired (1 group)
        [
          "UAL123",
          {
            identifiers: ["UAL123", "A12345"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 1000,
          },
        ],
        // Not paired - various ages
        [
          "OLD1",
          {
            identifiers: ["OLD1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 500,
          },
        ],
        [
          "MID1",
          {
            identifiers: ["MID1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 2000,
          },
        ],
        [
          "NEW1",
          {
            identifiers: ["NEW1"],
            has_alerts: false,
            num_alerts: 0,
            messages: [],
            lastUpdated: 3000,
          },
        ],
      ]);

      // Limit 3: keep 1 paired + 2 newest not-paired
      const result = cullMessageGroups(messageGroups, 3, mockAdsbData);

      expect(result.size).toBe(3);
      expect(result.has("UAL123")).toBe(true); // Paired
      expect(result.has("NEW1")).toBe(true); // Newest not-paired
      expect(result.has("MID1")).toBe(true); // 2nd newest not-paired
      expect(result.has("OLD1")).toBe(false); // Oldest - removed
    });
  });
});

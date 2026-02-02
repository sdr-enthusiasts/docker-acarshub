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
import type { AcarsMsg, Terms } from "../../types";
import { applyAlertMatching, checkMessageForAlerts } from "../alertMatching";

describe("alertMatching", () => {
  // Helper function to create a basic message
  const createMessage = (overrides: Partial<AcarsMsg> = {}): AcarsMsg => ({
    uid: "test-uid-123",
    timestamp: Date.now() / 1000,
    station_id: "TEST-STATION",
    toaddr: "TEST",
    fromaddr: "TEST",
    depa: null,
    dsta: null,
    eta: null,
    gtout: null,
    gtin: null,
    wloff: null,
    wlin: null,
    lat: null,
    lon: null,
    alt: null,
    text: null,
    data: null,
    tail: null,
    flight: null,
    icao: null,
    freq: null,
    ack: null,
    mode: null,
    label: null,
    block_id: null,
    msgno: null,
    is_response: null,
    is_onground: null,
    error: null,
    level: null,
    end: null,
    has_alerts: false,
    num_alerts: 0,
    matched: false,
    matched_text: [],
    duplicates: "0",
    msgno_parts: null,
    libacars: null,
    decoded_msg: null,
    airline: null,
    iata_flight: null,
    icao_flight: null,
    decodedText: null,
    ...overrides,
  });

  // Helper function to create alert terms
  const createTerms = (terms: string[] = [], ignore: string[] = []): Terms => ({
    terms,
    ignore,
  });

  describe("checkMessageForAlerts", () => {
    describe("basic matching", () => {
      it("should return no match when no alert terms configured", () => {
        const message = createMessage({ text: "EMERGENCY" });
        const terms = createTerms([]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should return no match when message has no searchable text", () => {
        const message = createMessage({ text: null });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should match a term in message text", () => {
        const message = createMessage({ text: "EMERGENCY DESCENT" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match a term in message data", () => {
        const message = createMessage({ data: "EMERGENCY ALERT" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match a term in decoded_msg", () => {
        const message = createMessage({ decoded_msg: "EMERGENCY LANDING" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match multiple terms", () => {
        const message = createMessage({ text: "EMERGENCY MAYDAY DESCENT" });
        const terms = createTerms(["EMERGENCY", "MAYDAY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY", "MAYDAY"]);
      });

      it("should match only some of the configured terms", () => {
        const message = createMessage({ text: "EMERGENCY DESCENT" });
        const terms = createTerms(["EMERGENCY", "MAYDAY", "PAN"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });
    });

    describe("case insensitivity", () => {
      it("should match terms case-insensitively (lowercase text)", () => {
        const message = createMessage({ text: "emergency descent" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match terms case-insensitively (mixed case text)", () => {
        const message = createMessage({ text: "EmErGeNcY DeSCeNT" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match terms case-insensitively (lowercase term)", () => {
        const message = createMessage({ text: "EMERGENCY DESCENT" });
        const terms = createTerms(["emergency"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["emergency"]);
      });
    });

    describe("word boundary matching", () => {
      it("should match whole words only", () => {
        const message = createMessage({ text: "EMERGENCY RESPONSE" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should not match partial words", () => {
        const message = createMessage({ text: "NONEMERGENCY SITUATION" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should not match substring within word", () => {
        const message = createMessage({ text: "EMERGENCYPLAN" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should match at start of text", () => {
        const message = createMessage({ text: "EMERGENCY AT GATE" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match at end of text", () => {
        const message = createMessage({ text: "DECLARE EMERGENCY" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match with punctuation boundaries", () => {
        const message = createMessage({ text: "ALERT: EMERGENCY! CODE RED." });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match callsigns (alphanumeric with word boundaries)", () => {
        const message = createMessage({ text: "UAL123 REQUESTING PRIORITY" });
        const terms = createTerms(["UAL123"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["UAL123"]);
      });

      it("should match tail numbers (alphanumeric patterns)", () => {
        const message = createMessage({ text: "AIRCRAFT N12345 REPORTING" });
        const terms = createTerms(["N12345"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["N12345"]);
      });
    });

    describe("ignore terms", () => {
      it("should not match when ignore term also present", () => {
        const message = createMessage({ text: "EMERGENCY TEST DRILL" });
        const terms = createTerms(["EMERGENCY"], ["TEST"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should match when alert term present but ignore term not present", () => {
        const message = createMessage({ text: "EMERGENCY DESCENT" });
        const terms = createTerms(["EMERGENCY"], ["TEST"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should handle multiple ignore terms", () => {
        const message = createMessage({
          text: "EMERGENCY SIMULATION EXERCISE",
        });
        const terms = createTerms(["EMERGENCY"], ["TEST", "SIMULATION"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should apply ignore terms with word boundaries", () => {
        const message = createMessage({ text: "EMERGENCY TESTING123" });
        const terms = createTerms(["EMERGENCY"], ["TEST"]);

        // "TEST" should not match "TESTING123" due to word boundary
        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match some terms and ignore others", () => {
        const message = createMessage({ text: "EMERGENCY MAYDAY TEST DRILL" });
        const terms = createTerms(["EMERGENCY", "MAYDAY"], ["TEST"]);

        // Both alert terms present, but ignore term also present
        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should handle empty ignore array", () => {
        const message = createMessage({ text: "EMERGENCY DESCENT" });
        const terms = createTerms(["EMERGENCY"], []);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });
    });

    describe("decodedText field matching", () => {
      it("should match terms in decodedText label", () => {
        const message = createMessage({
          decodedText: {
            formatted: [
              { label: "Status", value: "OK" },
              { label: "EMERGENCY", value: "Active" },
            ],
            decoder: {
              decodeLevel: "full",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match terms in decodedText value", () => {
        const message = createMessage({
          decodedText: {
            formatted: [
              { label: "Status", value: "EMERGENCY" },
              { label: "Code", value: "7700" },
            ],
            decoder: {
              decodeLevel: "full",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should match terms across multiple decodedText items", () => {
        const message = createMessage({
          decodedText: {
            formatted: [
              { label: "Status", value: "MAYDAY" },
              { label: "Action", value: "EMERGENCY DESCENT" },
            ],
            decoder: {
              decodeLevel: "full",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["MAYDAY", "EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["MAYDAY", "EMERGENCY"]);
      });

      it("should handle decodedText with null labels and values", () => {
        const message = createMessage({
          decodedText: {
            formatted: [
              { label: null, value: "EMERGENCY" },
              { label: "Status", value: null },
            ],
            decoder: {
              decodeLevel: "partial",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should search both decodedText and text fields", () => {
        const message = createMessage({
          text: "MAYDAY CALL",
          decodedText: {
            formatted: [{ label: "Status", value: "EMERGENCY" }],
            decoder: {
              decodeLevel: "full",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["MAYDAY", "EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["MAYDAY", "EMERGENCY"]);
      });

      it("should handle empty decodedText formatted array", () => {
        const message = createMessage({
          decodedText: {
            formatted: [],
            decoder: {
              decodeLevel: "none",
              name: "test-decoder",
            },
          },
        });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });
    });

    describe("special characters and regex escaping", () => {
      it("should handle terms with dots", () => {
        const message = createMessage({ text: "CONTACT 121.5 MHZ" });
        const terms = createTerms(["121.5"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["121.5"]);
      });

      it("should handle terms with parentheses", () => {
        const message = createMessage({ text: "CODE EMERGENCY ACTIVE" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should handle terms with brackets", () => {
        const message = createMessage({ text: "STATUS ALERT RECEIVED" });
        const terms = createTerms(["ALERT"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["ALERT"]);
      });

      it("should handle terms with asterisks", () => {
        const message = createMessage({ text: "URGENT MESSAGE" });
        const terms = createTerms(["URGENT"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["URGENT"]);
      });

      it("should handle terms with plus signs", () => {
        const message = createMessage({ text: "TEMP PLUS45C ALERT" });
        const terms = createTerms(["PLUS45C"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["PLUS45C"]);
      });

      it("should handle terms with dollar signs", () => {
        const message = createMessage({ text: "COST 1000 EXCEEDED" });
        const terms = createTerms(["1000"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["1000"]);
      });

      it("should handle terms with hyphens", () => {
        const message = createMessage({ text: "CODE-RED EMERGENCY" });
        const terms = createTerms(["CODE-RED"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["CODE-RED"]);
      });
    });

    describe("edge cases", () => {
      it("should handle empty string text", () => {
        const message = createMessage({ text: "" });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should handle whitespace-only text", () => {
        const message = createMessage({ text: "   \t\n  " });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should handle very long text", () => {
        const longText = "NORMAL ".repeat(1000) + "EMERGENCY";
        const message = createMessage({ text: longText });
        const terms = createTerms(["EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should handle many alert terms", () => {
        const message = createMessage({ text: "EMERGENCY MAYDAY" });
        const manyTerms = Array.from({ length: 100 }, (_, i) => `TERM${i}`);
        manyTerms.push("EMERGENCY");
        const terms = createTerms(manyTerms);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["EMERGENCY"]);
      });

      it("should handle numbers in terms", () => {
        const message = createMessage({ text: "FLIGHT 7700 EMERGENCY" });
        const terms = createTerms(["7700"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["7700"]);
      });

      it("should handle duplicate terms in alert list", () => {
        const message = createMessage({ text: "EMERGENCY ALERT" });
        const terms = createTerms(["EMERGENCY", "EMERGENCY", "EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        // Should still only match once per unique term
        expect(result.matchedTerms).toEqual([
          "EMERGENCY",
          "EMERGENCY",
          "EMERGENCY",
        ]);
      });
    });

    describe("real-world scenarios", () => {
      it("should match aviation emergency callsigns", () => {
        const message = createMessage({ text: "UAL123 DECLARING EMERGENCY" });
        const terms = createTerms(["UAL123"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["UAL123"]);
      });

      it("should match aircraft registration numbers", () => {
        const message = createMessage({
          text: "N123AB REQUESTING EMERGENCY LANDING",
        });
        const terms = createTerms(["N123AB"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["N123AB"]);
      });

      it("should match ICAO hex codes", () => {
        const message = createMessage({ text: "A1B2C3 SQUAWKING 7700" });
        const terms = createTerms(["A1B2C3"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["A1B2C3"]);
      });

      it("should ignore test flights", () => {
        const message = createMessage({ text: "EMERGENCY DRILL TEST ONLY" });
        const terms = createTerms(["EMERGENCY"], ["TEST"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(false);
        expect(result.matchedTerms).toEqual([]);
      });

      it("should match medical emergencies", () => {
        const message = createMessage({
          text: "MEDICAL EMERGENCY ONBOARD REQUESTING PRIORITY",
        });
        const terms = createTerms(["MEDICAL EMERGENCY"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["MEDICAL EMERGENCY"]);
      });

      it("should match fuel emergency", () => {
        const message = createMessage({ text: "MINIMUM FUEL EMERGENCY" });
        const terms = createTerms(["FUEL EMERGENCY", "MINIMUM FUEL"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["FUEL EMERGENCY", "MINIMUM FUEL"]);
      });

      it("should match squawk codes", () => {
        const message = createMessage({ text: "SQUAWKING 7700 EMERGENCY" });
        const terms = createTerms(["7700"]);

        const result = checkMessageForAlerts(message, terms);

        expect(result.matched).toBe(true);
        expect(result.matchedTerms).toEqual(["7700"]);
      });
    });
  });

  describe("applyAlertMatching", () => {
    let message: AcarsMsg;

    beforeEach(() => {
      message = createMessage({ text: "EMERGENCY DESCENT" });
    });

    it("should mutate message with matched=true and matched_text array", () => {
      const terms = createTerms(["EMERGENCY"]);

      const result = applyAlertMatching(message, terms);

      expect(result).toBe(message); // Same object reference
      expect(result.matched).toBe(true);
      expect(result.matched_text).toEqual(["EMERGENCY"]);
    });

    it("should mutate message with matched=false when no match", () => {
      const terms = createTerms(["MAYDAY"]);

      const result = applyAlertMatching(message, terms);

      expect(result).toBe(message);
      expect(result.matched).toBe(false);
      expect(result.matched_text).toEqual([]);
    });

    it("should update matched_text with multiple matches", () => {
      const message = createMessage({ text: "EMERGENCY MAYDAY PAN PAN" });
      const terms = createTerms(["EMERGENCY", "MAYDAY", "PAN"]);

      const result = applyAlertMatching(message, terms);

      expect(result.matched).toBe(true);
      expect(result.matched_text).toEqual(["EMERGENCY", "MAYDAY", "PAN"]);
    });

    it("should respect ignore terms", () => {
      const message = createMessage({ text: "EMERGENCY TEST DRILL" });
      const terms = createTerms(["EMERGENCY"], ["TEST"]);

      const result = applyAlertMatching(message, terms);

      expect(result.matched).toBe(false);
      expect(result.matched_text).toEqual([]);
    });

    it("should handle messages with existing matched fields", () => {
      const message = createMessage({
        text: "MAYDAY CALL",
        matched: false,
        matched_text: [],
      });
      const terms = createTerms(["MAYDAY"]);

      const result = applyAlertMatching(message, terms);

      expect(result.matched).toBe(true);
      expect(result.matched_text).toEqual(["MAYDAY"]);
    });

    it("should overwrite previous match results", () => {
      const message = createMessage({
        text: "NORMAL MESSAGE",
        matched: true,
        matched_text: ["EMERGENCY"],
      });
      const terms = createTerms(["EMERGENCY"]);

      const result = applyAlertMatching(message, terms);

      // Should clear previous match since text doesn't contain EMERGENCY
      expect(result.matched).toBe(false);
      expect(result.matched_text).toEqual([]);
    });
  });
});

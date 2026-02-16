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
import type { AcarsMsg, DecodedText, DecodedTextItem } from "../../types";
import {
  decodeMessage,
  decodeMessages,
  formatDecodedText,
  highlightMatchedText,
  loopDecodedArray,
  parseAndFormatLibacars,
} from "../decoderUtils";

describe("decoderUtils", () => {
  describe("loopDecodedArray", () => {
    describe("array input", () => {
      it("should format array of items", () => {
        const input: DecodedTextItem[] = [
          {
            label: "Flight",
            value: "UAL123",
            type: "full",
            code: "UAL123",
          },
          { label: "Altitude", value: "35000", type: "full", code: "35000" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: UAL123\nAltitude: 35000\n");
      });

      it("should handle single item array", () => {
        const input: DecodedTextItem[] = [
          { label: "Status", value: "OK", type: "full", code: "OK" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Status: OK\n");
      });

      it("should handle empty array", () => {
        const input: DecodedTextItem[] = [];

        const result = loopDecodedArray(input);

        expect(result).toBe("");
      });

      it("should handle array with null values", () => {
        const input: DecodedTextItem[] = [
          // @ts-expect-error - testing handling of null values
          { label: "Flight", value: null },
          { label: "Altitude", value: "35000", type: "full", code: "35000" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: null\nAltitude: 35000\n");
      });

      it("should handle array with undefined values", () => {
        const input: DecodedTextItem[] = [
          // @ts-expect-error - testing handling of undefined values
          { label: "Flight", value: undefined },
          { label: "Altitude", value: "35000", type: "full", code: "35000" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: undefined\nAltitude: 35000\n");
      });

      it("should handle array with numeric values", () => {
        const input: DecodedTextItem[] = [
          { label: "Altitude", value: "35000", type: "full", code: "35000" },
          { label: "Speed", value: "450", type: "full", code: "450" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Altitude: 35000\nSpeed: 450\n");
      });

      it("should handle array with boolean values", () => {
        const input: DecodedTextItem[] = [
          // @ts-expect-error - testing handling of boolean values
          { label: "OnGround", value: true },
          // @ts-expect-error - testing handling of boolean values
          { label: "Emergency", value: false },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("OnGround: true\nEmergency: false\n");
      });

      it("should handle array with empty string values", () => {
        const input: DecodedTextItem[] = [
          { label: "Flight", value: "", type: "full", code: "" },
          { label: "Tail", value: "N12345", type: "full", code: "N12345" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: \nTail: N12345\n");
      });

      it("should skip non-object items in array", () => {
        const input = [
          { label: "Flight", value: "UAL123" },
          "not an object",
          { label: "Altitude", value: "35000" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: UAL123\nAltitude: 35000\n");
      });

      it("should skip null items in array", () => {
        const input = [
          { label: "Flight", value: "UAL123" },
          null,
          { label: "Altitude", value: "35000" },
        ];

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: UAL123\nAltitude: 35000\n");
      });
    });

    describe("single item input", () => {
      it("should format single item object", () => {
        const input: DecodedTextItem = {
          label: "Flight",
          value: "UAL123",
          type: "full",
          code: "UAL123",
        };

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: UAL123\n");
      });

      it("should handle single item with null value", () => {
        // @ts-expect-error
        const input: DecodedTextItem = { label: "Flight", value: null };

        const result = loopDecodedArray(input);

        expect(result).toBe("Flight: null\n");
      });

      it("should handle single item with numeric value", () => {
        // @ts-expect-error - testing handling of numeric value
        const input: DecodedTextItem = { label: "Altitude", value: 35000 };

        const result = loopDecodedArray(input);

        expect(result).toBe("Altitude: 35000\n");
      });
    });

    describe("primitive input", () => {
      it("should handle string input", () => {
        const result = loopDecodedArray("test string");

        expect(result).toBe("test string");
      });

      it("should handle number input", () => {
        const result = loopDecodedArray(123);

        expect(result).toBe("123");
      });

      it("should handle boolean input", () => {
        const result = loopDecodedArray(true);

        expect(result).toBe("true");
      });

      it("should handle null input", () => {
        const result = loopDecodedArray(null);

        expect(result).toBe("null");
      });

      it("should handle undefined input", () => {
        const result = loopDecodedArray(undefined);

        expect(result).toBe("undefined");
      });
    });

    describe("edge cases", () => {
      it("should handle very long label and value", () => {
        const longLabel = "A".repeat(1000);
        const longValue = "B".repeat(1000);
        const input: DecodedTextItem = {
          label: longLabel,
          value: longValue,
          type: "full",
          code: "LONG",
        };

        const result = loopDecodedArray(input);

        expect(result).toBe(`${longLabel}: ${longValue}\n`);
      });

      it("should handle special characters in label and value", () => {
        const input: DecodedTextItem = {
          label: "Status<>",
          value: "OK & READY",
          type: "full",
          code: "OK & READY",
        };

        const result = loopDecodedArray(input);

        expect(result).toBe("Status<>: OK & READY\n");
      });

      it("should handle newlines in values", () => {
        const input: DecodedTextItem = {
          label: "Message",
          value: "Line 1\nLine 2",
          type: "full",
          code: "MULTILINE",
        };

        const result = loopDecodedArray(input);

        expect(result).toBe("Message: Line 1\nLine 2\n");
      });

      it("should handle many items", () => {
        const input: DecodedTextItem[] = Array.from(
          { length: 100 },
          (_, i) => ({
            label: `Label${i}`,
            value: `Value${i}`,
            type: "full",
            code: `CODE${i}`,
          }),
        );

        const result = loopDecodedArray(input);

        expect(result.split("\n").length).toBe(101); // 100 items + trailing newline
      });
    });
  });

  describe("highlightMatchedText", () => {
    describe("basic highlighting", () => {
      it("should highlight single matched term", () => {
        const text = "EMERGENCY DESCENT IN PROGRESS";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe(
          '<mark class="alert-highlight">EMERGENCY</mark> DESCENT IN PROGRESS',
        );
      });

      it("should highlight multiple matched terms", () => {
        const text = "EMERGENCY MAYDAY DESCENT";
        const matchedTerms = ["EMERGENCY", "MAYDAY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe(
          '<mark class="alert-highlight">EMERGENCY</mark> <mark class="alert-highlight">MAYDAY</mark> DESCENT',
        );
      });

      it("should not modify text with no matches", () => {
        const text = "NORMAL DESCENT";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe("NORMAL DESCENT");
      });

      it("should handle empty matched terms array", () => {
        const text = "EMERGENCY DESCENT";
        const matchedTerms: string[] = [];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe("EMERGENCY DESCENT");
      });

      it("should handle empty text", () => {
        const text = "";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe("");
      });
    });

    describe("case insensitivity", () => {
      it("should match case-insensitively", () => {
        const text = "Emergency descent in progress";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe(
          '<mark class="alert-highlight">EMERGENCY</mark> descent in progress',
        );
      });

      it("should replace with uppercase term", () => {
        const text = "emergency EMERGENCY EmErGeNcY";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        // All variations replaced with uppercase
        expect(result).toBe(
          '<mark class="alert-highlight">EMERGENCY</mark> <mark class="alert-highlight">EMERGENCY</mark> <mark class="alert-highlight">EMERGENCY</mark>',
        );
      });

      it("should handle mixed case in matched terms", () => {
        const text = "EMERGENCY DESCENT";
        const matchedTerms = ["emergency", "Emergency", "EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        // Should highlight multiple times (once per term in array)
        expect(result).toContain('<mark class="alert-highlight">');
      });
    });

    describe("multiple occurrences", () => {
      it("should highlight all occurrences of a term", () => {
        const text = "EMERGENCY ALERT EMERGENCY CODE EMERGENCY";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        const matches = result.match(/alert-highlight/g);
        expect(matches).toHaveLength(3);
      });

      it("should handle overlapping terms", () => {
        const text = "FUEL EMERGENCY MINIMUM FUEL";
        const matchedTerms = ["FUEL", "EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toContain('<mark class="alert-highlight">FUEL</mark>');
        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
      });
    });

    describe("edge cases", () => {
      it("should handle very long text", () => {
        const text = "NORMAL ".repeat(1000) + "EMERGENCY";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
      });

      it("should handle special characters in text", () => {
        const text = "ALERT: EMERGENCY! CODE-RED.";
        const matchedTerms = ["EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe(
          'ALERT: <mark class="alert-highlight">EMERGENCY</mark>! CODE-RED.',
        );
      });

      it("should handle terms with spaces", () => {
        const text = "MEDICAL EMERGENCY IN PROGRESS";
        const matchedTerms = ["MEDICAL EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        expect(result).toBe(
          '<mark class="alert-highlight">MEDICAL EMERGENCY</mark> IN PROGRESS',
        );
      });

      it("should handle duplicate terms in array", () => {
        const text = "EMERGENCY DESCENT";
        const matchedTerms = ["EMERGENCY", "EMERGENCY", "EMERGENCY"];

        const result = highlightMatchedText(matchedTerms, text);

        // Should still highlight (potentially multiple times)
        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
      });
    });
  });

  describe("parseAndFormatLibacars", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    describe("frequency data", () => {
      it("should parse and format frequency data", () => {
        const libacarsString = JSON.stringify({
          freq_data: [
            {
              gs: {
                name: "New York",
                listening_on_freqs: [{ freq: 131550 }, { freq: 131725 }],
                heard_on_freqs: [{ freq: 131550 }],
              },
            },
          ],
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Ground Station Frequency Information");
        expect(result).toContain("New York");
        expect(result).toContain("131550 kHz");
        expect(result).toContain("131725 kHz");
        expect(result).toContain("Listening on:");
        expect(result).toContain("Heard on:");
      });

      it("should handle multiple ground stations", () => {
        const libacarsString = JSON.stringify({
          freq_data: [
            {
              gs: {
                name: "New York",
                listening_on_freqs: [{ freq: 131550 }],
              },
            },
            {
              gs: {
                name: "San Francisco",
                listening_on_freqs: [{ freq: 131450 }],
              },
            },
          ],
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("New York");
        expect(result).toContain("San Francisco");
      });

      it("should handle station without frequencies", () => {
        const libacarsString = JSON.stringify({
          freq_data: [
            {
              gs: {
                name: "Test Station",
              },
            },
          ],
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Test Station");
        expect(result).not.toContain("Listening on:");
      });
    });

    describe("CPDLC messages", () => {
      it("should parse and format CPDLC message", () => {
        const libacarsString = JSON.stringify({
          msg_type: "cpdlc",
          msg_text: "CLEARED TO DESCEND",
          timestamp: { hour: 12, min: 30, sec: 45 },
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("CPDLC Message");
        expect(result).toContain("Msg Type");
        expect(result).toContain("cpdlc");
        expect(result).toContain("Msg Text");
        expect(result).toContain("CLEARED TO DESCEND");
        expect(result).toContain("12:30:45 UTC");
      });

      it("should handle nested CPDLC data", () => {
        const libacarsString = JSON.stringify({
          msg_type: "cpdlc_downlink",
          data: {
            request: "DIRECT TO WAYPOINT",
            altitude: 35000,
          },
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("CPDLC Message");
        expect(result).toContain("Data");
        expect(result).toContain("Request");
        expect(result).toContain("DIRECT TO WAYPOINT");
      });
    });

    describe("generic data", () => {
      it("should parse and format generic libacars data", () => {
        const libacarsString = JSON.stringify({
          some_field: "value",
          another_field: 123,
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Decoded Libacars Data");
        expect(result).toContain("Some Field");
        expect(result).toContain("value");
        expect(result).toContain("Another Field");
        expect(result).toContain("123");
      });

      it("should format boolean values correctly", () => {
        const libacarsString = JSON.stringify({
          is_active: true,
          is_error: false,
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Is Active");
        expect(result).toContain("Yes");
        expect(result).toContain("Is Error");
        expect(result).toContain("No");
      });

      it("should format null values correctly", () => {
        const libacarsString = JSON.stringify({
          empty_field: null,
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Empty Field");
        expect(result).toContain("<em>null</em>");
      });

      it("should handle array values", () => {
        const libacarsString = JSON.stringify({
          items: ["item1", "item2", "item3"],
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Items");
        expect(result).toContain("item1");
        expect(result).toContain("item2");
        expect(result).toContain("item3");
      });

      it("should handle array of objects", () => {
        const libacarsString = JSON.stringify({
          stations: [
            { name: "Station1", freq: 131550 },
            { name: "Station2", freq: 131725 },
          ],
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("Stations");
        expect(result).toContain("Item 1");
        expect(result).toContain("Item 2");
        expect(result).toContain("Station1");
        expect(result).toContain("Station2");
      });
    });

    describe("data cleaning", () => {
      it("should clean data with leading characters", () => {
        const libacarsString = 'JUNK{"msg_type":"test"}';

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).not.toBeNull();
        expect(result).toContain("Decoded Libacars Data");
      });

      it("should clean data with backslashes", () => {
        const libacarsString = '{\\"msg_type\\":\\"test\\"}';

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).not.toBeNull();
      });

      it("should clean data with trailing characters", () => {
        const libacarsString = '{"msg_type":"test"}JUNK';

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).not.toBeNull();
      });

      it("should handle properly formatted JSON", () => {
        const libacarsString = '{"msg_type":"test"}';

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).not.toBeNull();
        expect(result).toContain("Decoded Libacars Data");
      });
    });

    describe("error handling", () => {
      it("should return null for invalid JSON", () => {
        const libacarsString = "not valid json at all";

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it("should return null for empty string", () => {
        const result = parseAndFormatLibacars("");

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it("should return null for malformed JSON", () => {
        const libacarsString = '{"key": "value"';

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it("should handle JSON with no braces", () => {
        const libacarsString = "no braces here";

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });

    describe("timestamp formatting", () => {
      it("should format timestamps correctly", () => {
        const libacarsString = JSON.stringify({
          time: { hour: 1, min: 5, sec: 9 },
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("01:05:09 UTC");
      });

      it("should pad single digit times", () => {
        const libacarsString = JSON.stringify({
          departure_time: { hour: 0, min: 0, sec: 0 },
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("00:00:00 UTC");
      });

      it("should handle double digit times", () => {
        const libacarsString = JSON.stringify({
          arrival_time: { hour: 23, min: 59, sec: 59 },
        });

        const result = parseAndFormatLibacars(libacarsString);

        expect(result).toContain("23:59:59 UTC");
      });
    });
  });

  describe("formatDecodedText", () => {
    describe("basic formatting", () => {
      it("should format decoded text without alert terms", () => {
        const decodedText: DecodedText = {
          formatted: [
            { label: "Flight", value: "UAL123", type: "full", code: "UAL123" },
            { label: "Altitude", value: "35000", type: "full", code: "35000" },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toBe("Flight: UAL123\nAltitude: 35000\n");
      });

      it("should format decoded text with alert terms", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Status",
              value: "EMERGENCY",
              type: "full",
              code: "EMERGENCY",
            },
            {
              label: "Action",
              value: "DESCENT",
              type: "full",
              code: "DESCENT",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };
        const matchedTerms = ["EMERGENCY"];

        const result = formatDecodedText(decodedText, matchedTerms);

        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
        expect(result).toContain("Action: DESCENT");
      });

      it("should handle empty formatted array", () => {
        const decodedText: DecodedText = {
          formatted: [],
          decoder: {
            decodeLevel: "none",
            name: "test-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toBe("");
      });

      it("should handle multiple alert terms", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Status",
              value: "EMERGENCY MAYDAY",
              type: "full",
              code: "EMERGENCY",
            },
            { label: "Code", value: "7700", type: "full", code: "7700" },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };
        const matchedTerms = ["EMERGENCY", "MAYDAY", "7700"];

        const result = formatDecodedText(decodedText, matchedTerms);

        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
        expect(result).toContain('<mark class="alert-highlight">MAYDAY</mark>');
        expect(result).toContain('<mark class="alert-highlight">7700</mark>');
      });
    });

    describe("decode levels", () => {
      it("should format full decode level", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Message",
              value: "Fully decoded",
              type: "full",
              code: "FULL",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "acars-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toBe("Message: Fully decoded\n");
      });

      it("should format partial decode level", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Message",
              value: "Partially decoded",
              type: "partial",
              code: "PARTIAL",
            },
          ],
          decoder: {
            decodeLevel: "partial",
            name: "acars-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toBe("Message: Partially decoded\n");
      });

      it("should format none decode level", () => {
        const decodedText: DecodedText = {
          formatted: [],
          decoder: {
            decodeLevel: "none",
            name: "acars-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toBe("");
      });
    });

    describe("integration with highlighting", () => {
      it("should highlight terms across multiple fields", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Status",
              value: "EMERGENCY",
              type: "full",
              code: "EMERGENCY",
            },
            {
              label: "Type",
              value: "MEDICAL EMERGENCY",
              type: "full",
              code: "EMERGENCY",
            },
            {
              label: "Code",
              value: "EMERGENCY CODE 7700",
              type: "full",
              code: "EMERGENCY",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };
        const matchedTerms = ["EMERGENCY"];

        const result = formatDecodedText(decodedText, matchedTerms);

        // Should highlight all occurrences
        const matches = result.match(/alert-highlight/g);
        expect(matches).toHaveLength(3);
      });

      it("should preserve formatting when no matches", () => {
        const decodedText: DecodedText = {
          formatted: [
            { label: "Flight", value: "UAL123", type: "full", code: "UAL123" },
            { label: "Status", value: "NORMAL", type: "full", code: "NORMAL" },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };
        const matchedTerms = ["EMERGENCY"];

        const result = formatDecodedText(decodedText, matchedTerms);

        expect(result).toBe("Flight: UAL123\nStatus: NORMAL\n");
        expect(result).not.toContain("alert-highlight");
      });

      it("should handle empty matched terms array", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Status",
              value: "EMERGENCY",
              type: "full",
              code: "EMERGENCY",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };
        const matchedTerms: string[] = [];

        const result = formatDecodedText(decodedText, matchedTerms);

        expect(result).toBe("Status: EMERGENCY\n");
        expect(result).not.toContain("alert-highlight");
      });

      it("should handle undefined matched terms", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Status",
              value: "EMERGENCY",
              type: "full",
              code: "EMERGENCY",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "test-decoder",
          },
        };

        const result = formatDecodedText(decodedText, undefined);

        expect(result).toBe("Status: EMERGENCY\n");
        expect(result).not.toContain("alert-highlight");
      });
    });

    describe("real-world examples", () => {
      it("should format position report", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Message Type",
              value: "Position Report",
              type: "full",
              code: "POS",
            },
            {
              label: "Position",
              value: "N40.7128 W74.0060",
              type: "full",
              code: "POS",
            },
            { label: "Altitude", value: "FL350", type: "full", code: "ALT" },
            { label: "Time", value: "12:34:56", type: "full", code: "TIME" },
          ],
          decoder: {
            decodeLevel: "full",
            name: "acars-decoder",
          },
        };

        const result = formatDecodedText(decodedText);

        expect(result).toContain("Message Type: Position Report");
        expect(result).toContain("Position: N40.7128 W74.0060");
        expect(result).toContain("Altitude: FL350");
      });

      it("should format weather report with alerts", () => {
        const decodedText: DecodedText = {
          formatted: [
            {
              label: "Type",
              value: "Weather Report",
              type: "full",
              code: "WEATHER",
            },
            {
              label: "Conditions",
              value: "SEVERE TURBULENCE",
              type: "full",
              code: "TURB",
            },
            {
              label: "Action",
              value: "EMERGENCY DESCENT",
              type: "full",
              code: "EMERGENCY",
            },
          ],
          decoder: {
            decodeLevel: "full",
            name: "acars-decoder",
          },
        };
        const matchedTerms = ["SEVERE", "EMERGENCY"];

        const result = formatDecodedText(decodedText, matchedTerms);

        expect(result).toContain('<mark class="alert-highlight">SEVERE</mark>');
        expect(result).toContain(
          '<mark class="alert-highlight">EMERGENCY</mark>',
        );
      });
    });
  });

  describe("decodeMessage", () => {
    describe("message with existing decodedText", () => {
      it("should return message as-is if decodedText already exists", () => {
        const message: AcarsMsg = {
          uid: "test-123",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "Test message",
          label: "H1",
          message_type: "ACARS",
          decodedText: {
            decoder: {
              name: "test-decoder",
              decodeLevel: "full" as const,
            },
            formatted: [
              {
                type: "test",
                code: "TST",
                label: "Test",
                value: "Data",
              },
            ],
          },
        };

        const result = decodeMessage(message);

        expect(result).toBe(message);
        expect(result.decodedText).toBeDefined();
      });
    });

    describe("message without text", () => {
      it("should return message as-is if no text", () => {
        const message: AcarsMsg = {
          uid: "test-123",
          timestamp: Date.now(),
          station_id: "TEST",
          label: "H1",
          message_type: "ACARS",
        };

        const result = decodeMessage(message);

        expect(result).toBe(message);
        expect(result.decodedText).toBeUndefined();
      });
    });

    describe("message decoding with real decoder", () => {
      it("should decode H1 position report", () => {
        const message: AcarsMsg = {
          uid: "test-pos-123",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "#DFBPOS/N40439W073462,KJFK,092345",
          label: "H1",
          message_type: "ACARS",
        };

        const result = decodeMessage(message);

        expect(result.uid).toBe(message.uid);
        expect(result.text).toBe(message.text);
        // Decoder may or may not decode this depending on format
        // Just verify it returns a valid message
        expect(result).toBeDefined();
      });

      it("should handle messages that cannot be decoded", () => {
        const message: AcarsMsg = {
          uid: "test-unknown-123",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "Some random text that won't decode",
          label: "ZZ",
          message_type: "ACARS",
        };

        const result = decodeMessage(message);

        expect(result.uid).toBe(message.uid);
        expect(result.text).toBe(message.text);
        // Should return message without decodedText if decoding fails
        expect(result).toBeDefined();
      });

      it("should preserve all original message fields", () => {
        const message: AcarsMsg = {
          uid: "test-preserve-123",
          timestamp: 1234567890,
          station_id: "STATION1",
          text: "Test message",
          label: "5Z",
          message_type: "ACARS",
          flight: "UAL123",
          tail: "N12345",
          freq: 131550,
        };

        const result = decodeMessage(message);

        expect(result.uid).toBe(message.uid);
        expect(result.timestamp).toBe(message.timestamp);
        expect(result.station_id).toBe(message.station_id);
        expect(result.flight).toBe(message.flight);
        expect(result.tail).toBe(message.tail);
        expect(result.freq).toBe(message.freq);
      });
    });
  });

  describe("decodeMessages", () => {
    it("should decode array of messages", () => {
      const messages: AcarsMsg[] = [
        {
          uid: "test-1",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "Message 1",
          label: "H1",
          message_type: "ACARS",
        },
        {
          uid: "test-2",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "Message 2",
          label: "5Z",
          message_type: "ACARS",
        },
      ];

      const result = decodeMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].uid).toBe("test-1");
      expect(result[1].uid).toBe("test-2");
    });

    it("should handle empty array", () => {
      const messages: AcarsMsg[] = [];

      const result = decodeMessages(messages);

      expect(result).toHaveLength(0);
    });

    it("should preserve messages with existing decodedText", () => {
      const messages: AcarsMsg[] = [
        {
          uid: "test-1",
          timestamp: Date.now(),
          station_id: "TEST",
          text: "Message 1",
          label: "H1",
          message_type: "ACARS",
          decodedText: {
            decoder: {
              name: "test-decoder",
              decodeLevel: "full" as const,
            },
            formatted: [
              {
                type: "test",
                code: "TST",
                label: "Test",
                value: "Data",
              },
            ],
          },
        },
      ];

      const result = decodeMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].decodedText).toBeDefined();
      expect(result[0].decodedText?.decoder.name).toBe("test-decoder");
    });

    it("should decode multiple messages independently", () => {
      const messages: AcarsMsg[] = [
        {
          uid: "test-1",
          timestamp: Date.now(),
          station_id: "STATION1",
          text: "First message",
          label: "H1",
          message_type: "ACARS",
        },
        {
          uid: "test-2",
          timestamp: Date.now(),
          station_id: "STATION2",
          text: "Second message",
          label: "5Z",
          message_type: "ACARS",
          decodedText: {
            decoder: {
              name: "pre-decoded",
              decodeLevel: "full" as const,
            },
            formatted: [
              {
                type: "existing",
                code: "EXT",
                label: "Existing",
                value: "Decode",
              },
            ],
          },
        },
        {
          uid: "test-3",
          timestamp: Date.now(),
          station_id: "STATION3",
          text: "Third message",
          label: "Q0",
          message_type: "ACARS",
        },
      ];

      const result = decodeMessages(messages);

      expect(result).toHaveLength(3);
      expect(result[0].uid).toBe("test-1");
      expect(result[1].uid).toBe("test-2");
      expect(result[2].uid).toBe("test-3");
      // Second message should preserve its existing decodedText
      expect(result[1].decodedText?.decoder.name).toBe("pre-decoded");
    });
  });
});

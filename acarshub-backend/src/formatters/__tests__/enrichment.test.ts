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

import { beforeAll, describe, expect, it } from "vitest";
import { getConfig, initializeConfig } from "../../config.js";
import { enrichMessage, enrichMessages } from "../enrichment.js";

/**
 * Test Setup: Load configuration data
 *
 * Enrichment functions require:
 * - Airlines database (for flight IATA->ICAO conversion)
 * - Ground stations (for toaddr/fromaddr decoding)
 * - Message labels (for label_type lookup)
 *
 * These are loaded from files in rootfs/webapp/data/
 */
beforeAll(async () => {
  await initializeConfig();
});

describe("Message Enrichment", () => {
  describe("enrichMessage", () => {
    describe("Field Name Conversions", () => {
      it("converts messageType to message_type", () => {
        const message = {
          uid: "test-123",
          messageType: "ACARS",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("message_type", "ACARS");
        expect(result).not.toHaveProperty("messageType");
      });

      it("converts stationId to station_id", () => {
        const message = {
          uid: "test-123",
          stationId: "KZLA",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("station_id", "KZLA");
        expect(result).not.toHaveProperty("stationId");
      });

      it("converts msg_text to text", () => {
        const message = {
          uid: "test-123",
          msg_text: "Test message",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("text", "Test message");
        expect(result).not.toHaveProperty("msg_text");
      });

      it("converts time to timestamp", () => {
        const message = {
          uid: "test-123",
          time: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("timestamp", 1234567890);
        expect(result).not.toHaveProperty("time");
      });

      it("converts blockId to block_id", () => {
        const message = {
          uid: "test-123",
          blockId: "A1",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("block_id", "A1");
        expect(result).not.toHaveProperty("blockId");
      });

      it("converts isResponse to is_response", () => {
        const message = {
          uid: "test-123",
          isResponse: "1",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("is_response", "1");
        expect(result).not.toHaveProperty("isResponse");
      });

      it("converts isOnground to is_onground", () => {
        const message = {
          uid: "test-123",
          isOnground: "1",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("is_onground", "1");
        expect(result).not.toHaveProperty("isOnground");
      });

      it("converts aircraftId to aircraft_id", () => {
        const message = {
          uid: "test-123",
          aircraftId: "abc-123",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("aircraft_id", "abc-123");
        expect(result).not.toHaveProperty("aircraftId");
      });

      it("converts all camelCase fields in one message", () => {
        const message = {
          uid: "test-123",
          messageType: "VDL-M2",
          stationId: "KZLA",
          msg_text: "Test message",
          time: 1234567890,
          blockId: "A1",
          isResponse: "0",
          isOnground: "1",
          aircraftId: "abc-123",
        };

        const result = enrichMessage(message);

        // Check converted fields exist
        expect(result).toHaveProperty("message_type", "VDL-M2");
        expect(result).toHaveProperty("station_id", "KZLA");
        expect(result).toHaveProperty("text", "Test message");
        expect(result).toHaveProperty("timestamp", 1234567890);
        expect(result).toHaveProperty("block_id", "A1");
        expect(result).toHaveProperty("is_response", "0");
        expect(result).toHaveProperty("is_onground", "1");
        expect(result).toHaveProperty("aircraft_id", "abc-123");

        // Check old fields don't exist
        expect(result).not.toHaveProperty("messageType");
        expect(result).not.toHaveProperty("stationId");
        expect(result).not.toHaveProperty("msg_text");
        expect(result).not.toHaveProperty("time");
        expect(result).not.toHaveProperty("blockId");
        expect(result).not.toHaveProperty("isResponse");
        expect(result).not.toHaveProperty("isOnground");
        expect(result).not.toHaveProperty("aircraftId");
      });
    });

    describe("Protected Fields", () => {
      it("preserves uid even if null", () => {
        const message = {
          uid: null,
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("uid");
      });

      it("preserves message_type even if empty", () => {
        const message = {
          uid: "test-123",
          message_type: "",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("message_type", "");
      });

      it("preserves text even if empty (needed for decoder)", () => {
        const message = {
          uid: "test-123",
          text: "",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("text", "");
      });

      it("preserves alert metadata fields", () => {
        const message = {
          uid: "test-123",
          matched: true,
          matched_text: ["alert1"],
          matched_icao: null,
          matched_tail: [],
          matched_flight: undefined,
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("matched", true);
        expect(result).toHaveProperty("matched_text");
        expect(result).toHaveProperty("matched_icao");
        expect(result).toHaveProperty("matched_tail");
        expect(result).toHaveProperty("matched_flight");
      });
    });

    describe("Null/Empty Field Cleanup", () => {
      it("removes null fields except protected ones", () => {
        const message = {
          uid: "test-123",
          flight: null,
          tail: null,
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("uid");
        expect(result).toHaveProperty("timestamp");
        expect(result).not.toHaveProperty("flight");
        expect(result).not.toHaveProperty("tail");
      });

      it("removes empty string fields except protected ones", () => {
        const message = {
          uid: "test-123",
          flight: "",
          tail: "",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("uid");
        expect(result).toHaveProperty("timestamp");
        expect(result).not.toHaveProperty("flight");
        expect(result).not.toHaveProperty("tail");
      });

      it("removes undefined fields except protected ones", () => {
        const message = {
          uid: "test-123",
          flight: undefined,
          tail: undefined,
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("uid");
        expect(result).toHaveProperty("timestamp");
        expect(result).not.toHaveProperty("flight");
        expect(result).not.toHaveProperty("tail");
      });
    });

    describe("ICAO Enrichment", () => {
      it("converts numeric ICAO to hex string", () => {
        const message = {
          uid: "test-123",
          icao: 11269896,
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("icao_hex", "ABF708");
      });

      it("converts 6-char hex string to uppercase", () => {
        const message = {
          uid: "test-123",
          icao: "abf308",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("icao_hex", "ABF308");
      });

      it("converts decimal string to hex", () => {
        const message = {
          uid: "test-123",
          icao: "11269896",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("icao_hex", "ABF708");
      });

      it("preserves already uppercase hex string", () => {
        const message = {
          uid: "test-123",
          icao: "ABF308",
          timestamp: 1234567890,
        };

        const result = enrichMessage(message);

        expect(result).toHaveProperty("icao_hex", "ABF308");
      });
    });

    describe("Database Search Result Compatibility", () => {
      it("converts Drizzle query result to frontend format", () => {
        // Simulate a result from Drizzle ORM (camelCase)
        const dbResult = {
          id: 123,
          uid: "test-123",
          messageType: "ACARS",
          time: 1234567890,
          stationId: "KZLA",
          toaddr: "AKLAX",
          fromaddr: "AKLAX",
          depa: "KLAX",
          dsta: "KSFO",
          text: "Test message",
          tail: "N12345",
          flight: "UAL123",
          icao: "ABF308",
          freq: "131.550",
          label: "H1",
          blockId: "A1",
          msgno: "M01A",
          isResponse: "0",
          isOnground: "1",
          error: "0",
        };

        const result = enrichMessage(dbResult);

        // Frontend expects snake_case for these fields
        expect(result).toHaveProperty("message_type", "ACARS");
        expect(result).toHaveProperty("timestamp", 1234567890);
        expect(result).toHaveProperty("station_id", "KZLA");
        expect(result).toHaveProperty("block_id", "A1");
        expect(result).toHaveProperty("is_response", "0");
        expect(result).toHaveProperty("is_onground", "1");

        // Drizzle camelCase should be gone
        expect(result).not.toHaveProperty("messageType");
        expect(result).not.toHaveProperty("time");
        expect(result).not.toHaveProperty("stationId");
        expect(result).not.toHaveProperty("blockId");
        expect(result).not.toHaveProperty("isResponse");
        expect(result).not.toHaveProperty("isOnground");

        // Fields that don't need conversion
        expect(result).toHaveProperty("tail", "N12345");
        expect(result).toHaveProperty("flight", "UAL123");
        expect(result).toHaveProperty("label", "H1");
      });
    });
  });

  describe("enrichMessages", () => {
    it("enriches multiple messages in batch", () => {
      const messages = [
        {
          uid: "test-1",
          messageType: "ACARS",
          time: 1234567890,
          stationId: "KZLA",
        },
        {
          uid: "test-2",
          messageType: "VDL-M2",
          time: 1234567891,
          stationId: "KJFK",
        },
      ];

      const results = enrichMessages(messages);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty("message_type", "ACARS");
      expect(results[0]).toHaveProperty("timestamp", 1234567890);
      expect(results[0]).toHaveProperty("station_id", "KZLA");
      expect(results[1]).toHaveProperty("message_type", "VDL-M2");
      expect(results[1]).toHaveProperty("timestamp", 1234567891);
      expect(results[1]).toHaveProperty("station_id", "KJFK");
    });

    it("returns empty array for empty input", () => {
      const results = enrichMessages([]);

      expect(results).toEqual([]);
    });
  });

  describe("Flight Enrichment", () => {
    it("verifies airlines are loaded from config", () => {
      const config = getConfig();
      const airlineCount = Object.keys(config.airlines).length;

      // Should have loaded airlines.json successfully
      expect(airlineCount).toBeGreaterThan(0);
    });

    it("enriches flight with airline info (IATA->ICAO)", () => {
      const message = {
        uid: "test-123",
        flight: "UAL123", // United Airlines IATA code
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      // Should extract airline info from config
      expect(result).toHaveProperty("flight", "UAL123");
      expect(result).toHaveProperty("flight_number", "123");

      // If airlines.json loaded successfully, should have airline info
      const config = getConfig();
      if (Object.keys(config.airlines).length > 0) {
        // UAL is IATA code, should be converted to ICAO (UAL)
        expect(result).toHaveProperty("iata_flight");
        expect(result).toHaveProperty("icao_flight");
      }
    });

    it("handles flight without matching airline", () => {
      const message = {
        uid: "test-123",
        flight: "XYZ999", // Non-existent airline
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      expect(result).toHaveProperty("flight", "XYZ999");
      // Should still parse flight number even without airline match
      expect(result).toHaveProperty("flight_number", "999");
    });

    it("skips enrichment for invalid flight formats", () => {
      const message = {
        uid: "test-123",
        flight: "INVALID", // No digits
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      expect(result).toHaveProperty("flight", "INVALID");
      // No flight_number, airline, etc. should be added
      expect(result).not.toHaveProperty("flight_number");
      expect(result).not.toHaveProperty("airline");
    });
  });

  describe("Label Enrichment", () => {
    it("adds label_type for known labels", () => {
      const message = {
        uid: "test-123",
        label: "H1",
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      expect(result).toHaveProperty("label", "H1");
      expect(result).toHaveProperty("label_type");

      // label_type must be a string (frontend calls .trim() on it)
      expect(typeof result.label_type).toBe("string");
    });

    it("sets label_type to 'Unknown Message Label' for unknown labels", () => {
      const message = {
        uid: "test-123",
        label: "ZZ",
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      expect(result).toHaveProperty("label", "ZZ");
      expect(result).toHaveProperty("label_type", "Unknown Message Label");
    });

    it("handles missing label field gracefully", () => {
      const message = {
        uid: "test-123",
        timestamp: 1234567890,
      };

      const result = enrichMessage(message);

      // Should not add label_type if label is missing
      expect(result).not.toHaveProperty("label_type");
    });
  });

  describe("Decoder Enrichment (decodedText)", () => {
    /**
     * Canonical decodable message used across several tests.
     *
     * label "SQ" / "POSICAO/..." is a Ground Station Squitter message that
     * @airframes/acars-decoder decodes to decodeLevel "full" via the
     * "label-sq" decoder.  Verified with the library directly:
     *
     *   new MessageDecoder().decode({ label: "SQ", text: "POSICAO/N4515.4W07329.8/ALTITUD/35000" })
     *   // → { decoded: true, decoder: { name: "label-sq", decodeLevel: "full" }, ... }
     *
     * Using a concrete, stable message means the positive-path tests are
     * unconditional and will fail if the decoder integration ever breaks.
     */
    const DECODABLE = {
      label: "SQ",
      text: "POSICAO/N4515.4W07329.8/ALTITUD/35000",
    } as const;

    it("does not add decodedText when message has no text", () => {
      const message = {
        uid: "test-123",
        timestamp: 1234567890,
        label: "H1",
      };

      const result = enrichMessage(message);

      expect(result).not.toHaveProperty("decodedText");
    });

    it("does not add decodedText when text is empty string", () => {
      const message = {
        uid: "test-123",
        timestamp: 1234567890,
        label: "H1",
        text: "",
      };

      const result = enrichMessage(message);

      expect(result).not.toHaveProperty("decodedText");
    });

    it("does not add decodedText for a message that cannot be decoded", () => {
      const message = {
        uid: "test-123",
        timestamp: 1234567890,
        label: "ZZ",
        text: "RANDOM UNDECODABLE TEXT THAT MATCHES NO PATTERN ZZ99",
      };

      const result = enrichMessage(message);

      expect(result.decodedText).toBeUndefined();
    });

    it("populates decodedText for a known-decodable message", () => {
      const message = {
        uid: "test-sq-decode",
        timestamp: 1234567890,
        ...DECODABLE,
      };

      const result = enrichMessage(message);

      expect(result.decodedText).toBeDefined();
    });

    it("populates decodedText with decodeLevel 'full' for a fully-decoded message", () => {
      const message = {
        uid: "test-sq-level",
        timestamp: 1234567890,
        ...DECODABLE,
      };

      const result = enrichMessage(message);

      expect(result.decodedText?.decoder.decodeLevel).toBe("full");
    });

    it("populates decodedText.decoder.name with the decoder that handled the message", () => {
      const message = {
        uid: "test-sq-name",
        timestamp: 1234567890,
        ...DECODABLE,
      };

      const result = enrichMessage(message);

      expect(typeof result.decodedText?.decoder.name).toBe("string");
      expect(result.decodedText?.decoder.name?.length).toBeGreaterThan(0);
    });

    it("populates decodedText.formatted as a non-empty array of {label, value} items", () => {
      const message = {
        uid: "test-sq-formatted",
        timestamp: 1234567890,
        ...DECODABLE,
      };

      const result = enrichMessage(message);

      expect(Array.isArray(result.decodedText?.formatted)).toBe(true);
      expect(result.decodedText?.formatted.length).toBeGreaterThan(0);

      for (const item of result.decodedText?.formatted ?? []) {
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
      }
    });

    it("always prepends a Description item as the first formatted entry", () => {
      // enrichDecodedText always inserts { label: "Description", value: result.formatted.description }
      // as the first item so the frontend can show a human-readable summary.
      const message = {
        uid: "test-sq-description",
        timestamp: 1234567890,
        ...DECODABLE,
      };

      const result = enrichMessage(message);

      const first = result.decodedText?.formatted[0];
      expect(first?.label).toBe("Description");
      expect(typeof first?.value).toBe("string");
      expect(first?.value.length).toBeGreaterThan(0);
    });

    it("preserves existing decodedText without re-decoding (idempotent)", () => {
      // If a message already has decodedText (e.g. re-enrichment of a cached
      // message), the existing value must be kept as-is and the decoder must
      // not run again.
      const existing = {
        decoder: { decodeLevel: "full" as const, name: "cached-decoder" },
        formatted: [{ label: "Cached", value: "result" }],
      };
      const message = {
        uid: "test-idempotent",
        timestamp: 1234567890,
        ...DECODABLE,
        decodedText: existing,
      };

      const result = enrichMessage(message);

      // Must be the same object reference - not a re-decoded copy
      expect(result.decodedText).toBe(existing);
      expect(result.decodedText?.decoder.name).toBe("cached-decoder");
      expect(result.decodedText?.formatted).toHaveLength(1);
    });

    it("does not throw when the decoder encounters unexpected text", () => {
      // Guard against the decoder library throwing on malformed input
      const message = {
        uid: "test-no-throw",
        timestamp: 1234567890,
        label: "H1",
        text: "\x00\x01\x02\xFF binary garbage \n\r\t",
      };

      expect(() => enrichMessage(message)).not.toThrow();
    });
  });
});

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

/**
 * Message Enrichment Module
 *
 * Matches Python acarshub_helpers.update_keys() function
 * Transforms database messages into frontend-ready format:
 * - Converts msg_text → text, time → timestamp
 * - Removes null/empty fields (except protected keys)
 * - Adds derived fields (icao_hex, toaddr_decoded, airline, etc.)
 */

import type { AcarsMsg, DecodedText } from "@acarshub/types";
import { MessageDecoder } from "@airframes/acars-decoder";
import { getConfig } from "../config.js";
import { lookupGroundstation, lookupLabel } from "../db/index.js";
import { indexDecodedMessage } from "../services/decoded-search-index.js";
import { buildIndexInput } from "../services/decoder-index-input.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("formatters:enrichment");

/**
 * Singleton ACARS Message Decoder instance
 * Initialized once and reused for all message enrichment
 */
const acarsDecoder = new MessageDecoder();
logger.debug("ACARS message decoder initialized in enrichment pipeline");

/**
 * `@airframes/acars-decoder` does not export its `DecodeResult` interface
 * (only `MessageDecoder`/`IcaoDecoder` — see the package's `.d.ts`), so this
 * derives the exact same shape from the decoder instance already
 * constructed above instead of hand-duplicating the interface.
 */
type DecodeResult = ReturnType<typeof acarsDecoder.decode>;

/**
 * Protected keys that should never be deleted, even if null/empty
 */
const PROTECTED_KEYS = new Set([
  "uid",
  "matched",
  "matched_text",
  "matched_icao",
  "matched_tail",
  "matched_flight",
  "text",
  "timestamp",
  "message_type",
  "station_id",
]);

/**
 * Where the message being enriched came from.
 *
 * `enrichMessage()` serves two completely different callers: the live ingest
 * pipeline, and every read path that loads rows back out of `messages`
 * (search results, ring-buffer warm-up, alert lookups). Both decode for
 * display — decode-on-read is deliberate and cheap, 0.00836 ms, see
 * agent-docs/V4.3.md "Open Question 7" — but only ingest may write the
 * decoder search index.
 *
 * This is a required parameter and a named pair of states rather than an
 * inferred property or a boolean flag. It was previously inferred as
 * `if ("id" in message) return;` — the absence of a field meaning "this is
 * fresh ingest". That was correct at the time and invisible to the test
 * suite in both directions: attaching `id` at the ingest site silently
 * stopped all indexing with 1,424 tests still green, and losing the check
 * made every Search-page request issue a write transaction. A required
 * parameter turns either mistake into a compile error.
 */
export type MessageSource = "ingest" | "database";

/**
 * Enrich a message for frontend consumption
 *
 * Matches Python update_keys() behavior:
 * 1. Convert field names (msg_text → text, time → timestamp)
 * 2. Remove null/empty fields (except protected keys)
 * 3. Add derived fields (icao_hex, airline, toaddr_decoded, etc.)
 *
 * @param message - Raw message from database or decoder
 * @param source - Whether this is live ingest or a row read back from the
 *                 database. Only `"ingest"` writes the decoder search index.
 * @returns Enriched message ready for Socket.IO emission
 */
export function enrichMessage(
  message: Record<string, unknown>,
  source: MessageSource,
): AcarsMsg {
  // Create a shallow copy to avoid mutating original
  const enriched = { ...message };

  if (!("uid" in enriched) && "id" in enriched) {
    enriched.uid = String(enriched.id);
  }

  // FIRST: Convert field names before cleanup
  // Database column: msg_text -> Frontend: text
  if ("msg_text" in enriched && enriched.msg_text !== undefined) {
    logger.trace("Converting msg_text to text", { uid: enriched.uid });
    enriched.text = enriched.msg_text;
    delete enriched.msg_text;
  }

  // Database column: msg_time -> Frontend: timestamp
  if ("time" in enriched && enriched.time !== undefined) {
    enriched.timestamp = enriched.time;
    delete enriched.time;
  }

  // Drizzle camelCase: messageType -> Frontend: message_type
  if ("messageType" in enriched && enriched.messageType !== undefined) {
    logger.trace("Converting messageType to message_type", {
      uid: enriched.uid,
    });
    enriched.message_type = enriched.messageType;
    delete enriched.messageType;
  }

  // Drizzle camelCase: stationId -> Frontend: station_id
  if ("stationId" in enriched && enriched.stationId !== undefined) {
    enriched.station_id = enriched.stationId;
    delete enriched.stationId;
  }

  // Drizzle camelCase: blockId -> Frontend: block_id
  if ("blockId" in enriched && enriched.blockId !== undefined) {
    enriched.block_id = enriched.blockId;
    delete enriched.blockId;
  }

  // Drizzle camelCase: isResponse -> Frontend: is_response
  if ("isResponse" in enriched && enriched.isResponse !== undefined) {
    enriched.is_response = enriched.isResponse;
    delete enriched.isResponse;
  }

  // Drizzle camelCase: isOnground -> Frontend: is_onground
  if ("isOnground" in enriched && enriched.isOnground !== undefined) {
    enriched.is_onground = enriched.isOnground;
    delete enriched.isOnground;
  }

  // Drizzle camelCase: aircraftId -> Frontend: aircraft_id
  if ("aircraftId" in enriched && enriched.aircraftId !== undefined) {
    enriched.aircraft_id = enriched.aircraftId;
    delete enriched.aircraftId;
  }

  // SECOND: Clean up null/empty values (except protected keys)
  const keysToDelete: string[] = [];
  for (const [key, value] of Object.entries(enriched)) {
    if (
      !PROTECTED_KEYS.has(key) &&
      (value === null || value === undefined || value === "")
    ) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    delete enriched[key];
  }

  // THIRD: Add derived fields
  enrichIcaoFields(enriched);
  enrichFlightFields(enriched);
  enrichAddressFields(enriched);
  enrichLabelField(enriched);
  enrichDecodedText(enriched, source);

  // Type assertion: enriched now has all required fields from database + derived fields
  return enriched as unknown as AcarsMsg;
}

/**
 * Decode ACARS message text using @airframes/acars-decoder
 *
 * Populates the decodedText field if the message can be decoded.
 * Only runs if the message has a text field and does not already have decodedText.
 */
function enrichDecodedText(
  message: Record<string, unknown>,
  source: MessageSource,
): void {
  // Skip if already decoded (e.g. re-enrichment of a cached message)
  if (message.decodedText !== undefined) {
    return;
  }

  const text = message.text;
  if (!text || typeof text !== "string") {
    return;
  }

  const label = typeof message.label === "string" ? message.label : "";

  try {
    const result = acarsDecoder.decode({ text, label });

    if (result.decoded === true) {
      logger.trace("Successfully decoded message text", {
        uid: message.uid,
        decoderName: result.decoder.name,
        decodeLevel: result.decoder.decodeLevel,
        itemCount: result.formatted.items.length,
      });

      const decodedText: DecodedText = {
        decoder: {
          decodeLevel: result.decoder.decodeLevel as
            | "full"
            | "partial"
            | "none",
          name: result.decoder.name,
        },
        formatted: [
          { label: "Description", value: result.formatted.description },
          ...result.formatted.items.map((item) => ({
            label: item.label,
            value: item.value,
          })),
          ...(result.remaining.text
            ? [{ label: "Remaining Text", value: result.remaining.text }]
            : []),
        ],
      };

      message.decodedText = decodedText;

      // Populate the compact decoder search index (v4.3 Phase 3) from this
      // same decode — see indexDecodedMessageAtIngest() for why this is
      // gated to fresh ingest only, and getInstalledDecoderVersion() for why
      // the version cannot come from `result` itself.
      indexDecodedMessageAtIngest(message, result, source);
    } else {
      logger.trace("Message text not decodable", {
        uid: message.uid,
        label,
      });
    }
  } catch (error) {
    logger.warn("Error decoding message text - skipping decodedText", {
      uid: message.uid,
      label,
      textPreview: text.substring(0, 50),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Populate the v4.3 decoder search index (`decoded_messages` /
 * `decoder_variant` / `decoded_field`) for a message that just decoded, but
 * ONLY on the live ingest path.
 *
 * Read paths (search results, ring-buffer warm-up, alert lookups) re-decode
 * for display, which is deliberate and cheap, but must not write the index:
 * it would issue a write transaction on every Search-page request, and a
 * message already indexed at its original ingest learns nothing from being
 * re-decoded during a later read. A message ingested before this feature
 * existed is correctly left unindexed here — backfilling that is Phase 4's
 * job, not this read path's.
 *
 * The caller declares which it is via `source`; see MessageSource for why
 * that is a required parameter rather than something inferred from the
 * message's shape.
 */
function indexDecodedMessageAtIngest(
  message: Record<string, unknown>,
  result: DecodeResult,
  source: MessageSource,
): void {
  if (source !== "ingest") {
    return;
  }

  const uid = message.uid;
  if (typeof uid !== "string") {
    return;
  }

  const messageId = Number(uid);
  // A non-positive uid is the unsaved-message placeholder (DB_SAVEALL off +
  // empty message — see insert.ts's unsaved-message counter). There is no
  // messages.id for the index to reference, and the row policy is "no row
  // for a message with no decoder output OR no message row at all".
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return;
  }

  try {
    indexDecodedMessage(buildIndexInput(messageId, result));
  } catch (error) {
    // Loud failure inside indexDecodedMessage() (e.g. the 126-bit field
    // space exhausted) must not fail message ingestion — log and continue.
    // See agent-docs/V4.3.md Phase 3 deliverables.
    logger.error(
      "Failed to write decoder search index row — ingestion continues",
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

/**
 * Enrich ICAO-related fields
 *
 * Converts ICAO to icao_hex format (6-character uppercase hex string)
 */
function enrichIcaoFields(message: Record<string, unknown>): void {
  if (
    !("icao" in message) ||
    message.icao === null ||
    message.icao === undefined
  ) {
    return;
  }

  const icaoValue = message.icao;

  if (typeof icaoValue === "string") {
    if (icaoValue.length > 6) {
      // It's a decimal string - convert to hex
      try {
        const icaoInt = Number.parseInt(icaoValue, 10);
        message.icao_hex = icaoInt.toString(16).toUpperCase().padStart(6, "0");
      } catch {
        // Not a valid number - use as-is (probably already hex)
        message.icao_hex = icaoValue.toUpperCase().padStart(6, "0");
      }
      logger.warn(
        `icao string but longer than 6 chars, converting to hex ${icaoValue} -> ${message.icao_hex}`,
      );
    } else if (icaoValue.length < 6) {
      message.icao_hex = icaoValue.toUpperCase().padStart(6, "0");
      logger.warn(
        `icao string shorter than 6 chars, zero padding ${icaoValue} -> ${message.icao_hex}`,
      );
    } else {
      message.icao_hex = icaoValue.toUpperCase();
      //logger.warn(`icao already hex converting string to hex ${icaoValue} -> ${message.icao_hex}`);
    }
  } else if (typeof icaoValue === "number") {
    // Numeric ICAO - convert to 6-character hex string
    message.icao_hex = icaoValue.toString(16).toUpperCase().padStart(6, "0");
    logger.warn(
      `number type for message.icao, conversion: ${icaoValue} -> ${message.icao_hex}`,
    );
  } else {
    // Unknown type - convert to string and uppercase
    message.icao_hex = String(icaoValue).toUpperCase();
    logger.warn(
      `unknown type for message.icao, conversion: ${icaoValue} -> ${message.icao_hex}`,
    );
  }
}

/**
 * Enrich flight-related fields
 *
 * Extracts airline, IATA flight, ICAO flight, and flight number
 */
function enrichFlightFields(message: Record<string, unknown>): void {
  if (!("flight" in message) || typeof message.flight !== "string") {
    return;
  }

  const flight = message.flight.trim();
  if (!flight) {
    return;
  }

  const flightInfo = extractFlightInfo(flight);
  if (flightInfo) {
    message.airline = flightInfo.airline;
    message.iata_flight = flightInfo.iataFlight;
    message.icao_flight = flightInfo.icaoFlight;
    message.flight_number = flightInfo.flightNumber;
  }
}

/**
 * Extract flight information from callsign
 *
 * Matches Python flight_finder() behavior
 */
function extractFlightInfo(callsign: string): {
  airline: string | null;
  iataFlight: string | null;
  icaoFlight: string | null;
  flightNumber: string | null;
} | null {
  const config = getConfig();

  // Extract airline code and flight number
  // Format: AAL123, UAL456, etc. (3-4 letter code + digits)
  const match = callsign.match(/^([A-Z]{2,4})(\d+)$/);
  if (!match) {
    return null;
  }

  const [, airlineCode, flightNum] = match;

  // Look up airline info
  let airline: string | null = null;
  let iataCode: string | null = null;
  let icaoCode: string | null = null;

  // Check IATA overrides first
  if (airlineCode in config.iataOverrides) {
    const override = config.iataOverrides[airlineCode];
    airline = override.name;
    iataCode = airlineCode;
    icaoCode = override.icao;
  }
  // Check airlines database by IATA code
  else if (airlineCode in config.airlines) {
    const airlineInfo = config.airlines[airlineCode];
    airline = airlineInfo.NAME;
    iataCode = airlineCode;
    icaoCode = airlineInfo.ICAO;
  }
  // Check if it's an ICAO code
  else {
    // Search airlines by ICAO code
    for (const [iata, info] of Object.entries(config.airlines)) {
      if (info.ICAO === airlineCode) {
        airline = info.NAME;
        iataCode = iata;
        icaoCode = airlineCode;
        break;
      }
    }
  }

  return {
    airline,
    iataFlight: iataCode ? `${iataCode}${flightNum}` : null,
    icaoFlight: icaoCode ? `${icaoCode}${flightNum}` : null,
    flightNumber: flightNum,
  };
}

/**
 * Enrich address fields (toaddr, fromaddr)
 *
 * Adds hex format and decoded ground station names
 */
function enrichAddressFields(message: Record<string, unknown>): void {
  // Enrich toaddr
  if (
    "toaddr" in message &&
    message.toaddr !== null &&
    message.toaddr !== undefined
  ) {
    logger.trace("Enriching toaddr", {
      uid: message.uid,
      toaddr: message.toaddr,
      type: typeof message.toaddr,
    });

    const toaddrHex = tryFormatAsHex(message.toaddr, "toaddr");
    if (toaddrHex) {
      message.toaddr_hex = toaddrHex;

      const groundStation = lookupGroundstation(toaddrHex);
      logger.trace("Ground station lookup", {
        uid: message.uid,
        hex: toaddrHex,
        found: groundStation !== null,
      });

      if (groundStation) {
        message.toaddr_decoded = `${groundStation.name} (${groundStation.icao})`;
      }
    }
  }

  // Enrich fromaddr
  if (
    "fromaddr" in message &&
    message.fromaddr !== null &&
    message.fromaddr !== undefined
  ) {
    logger.trace("Enriching fromaddr", {
      uid: message.uid,
      fromaddr: message.fromaddr,
      type: typeof message.fromaddr,
    });

    const fromaddrHex = tryFormatAsHex(message.fromaddr, "fromaddr");
    if (fromaddrHex) {
      message.fromaddr_hex = fromaddrHex;

      const groundStation = lookupGroundstation(fromaddrHex);
      logger.trace("Ground station lookup", {
        uid: message.uid,
        hex: fromaddrHex,
        found: groundStation !== null,
      });

      if (groundStation) {
        message.fromaddr_decoded = `${groundStation.name} (${groundStation.icao})`;
      }
    }
  }
}

/**
 * Enrich label field
 *
 * Adds label_type with human-readable description
 */
function enrichLabelField(message: Record<string, unknown>): void {
  if (!("label" in message) || typeof message.label !== "string") {
    return;
  }

  const labelType = lookupLabel(message.label);
  message.label_type = labelType ?? "Unknown Message Label";
}

/**
 * Try to format value as hex string
 *
 * Matches Python try_format_as_int() behavior
 */
function tryFormatAsHex(value: unknown, fieldName: string): string | null {
  try {
    if (typeof value === "number") {
      const hex = value.toString(16).toUpperCase();
      logger.trace("Converted number to hex", {
        field: fieldName,
        input: value,
        output: hex,
      });
      return hex;
    }

    if (typeof value === "string") {
      // Try parsing as decimal number first
      const num = Number.parseInt(value, 10);
      if (!Number.isNaN(num)) {
        const hex = num.toString(16).toUpperCase();
        logger.trace("Converted string to hex", {
          field: fieldName,
          input: value,
          parsed: num,
          output: hex,
        });
        return hex;
      }
    }

    logger.warn("Unable to convert to hex, using 0", {
      field: fieldName,
      value,
      valueType: typeof value,
    });
    return "0";
  } catch (error) {
    logger.warn("Error formatting as hex", {
      field: fieldName,
      value,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Enrich multiple messages in batch
 *
 * More efficient than enriching one at a time
 */
export function enrichMessages(
  messages: Record<string, unknown>[],
  source: MessageSource,
): AcarsMsg[] {
  return messages.map((msg) => enrichMessage(msg, source));
}

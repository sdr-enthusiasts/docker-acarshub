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

import type { AcarsMsg } from "@acarshub/types";
import { getConfig } from "../config.js";
import { lookupGroundstation, lookupLabel } from "../db/index.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("enrichment");

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
 * Enrich a message for frontend consumption
 *
 * Matches Python update_keys() behavior:
 * 1. Convert field names (msg_text → text, time → timestamp)
 * 2. Remove null/empty fields (except protected keys)
 * 3. Add derived fields (icao_hex, airline, toaddr_decoded, etc.)
 *
 * @param message - Raw message from database or decoder
 * @returns Enriched message ready for Socket.IO emission
 */
export function enrichMessage(message: Record<string, unknown>): AcarsMsg {
  // Create a shallow copy to avoid mutating original
  const enriched = { ...message };

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

  // Type assertion: enriched now has all required fields from database + derived fields
  return enriched as unknown as AcarsMsg;
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
    // Already a string - check if it's hex or decimal
    // ICAO hex addresses contain A-F characters (e.g., "ABCD", "ABF308")
    // Pure decimal strings (e.g., "11269896") should be converted to hex
    const hasHexChars = /[A-Fa-f]/.test(icaoValue);
    const isAllHex = /^[0-9A-Fa-f]+$/.test(icaoValue);

    if (hasHexChars && isAllHex) {
      // Contains A-F, so it's definitely hex - uppercase and pad to 6 characters
      message.icao_hex = icaoValue.toUpperCase().padStart(6, "0");
    } else {
      // It's a decimal string - convert to hex
      try {
        const icaoInt = Number.parseInt(icaoValue, 10);
        message.icao_hex = icaoInt.toString(16).toUpperCase().padStart(6, "0");
      } catch {
        // Not a valid number - use as-is (probably already hex)
        message.icao_hex = icaoValue.toUpperCase().padStart(6, "0");
      }
    }
  } else if (typeof icaoValue === "number") {
    // Numeric ICAO - convert to 6-character hex string
    message.icao_hex = icaoValue.toString(16).toUpperCase().padStart(6, "0");
  } else {
    // Unknown type - convert to string and uppercase
    message.icao_hex = String(icaoValue).toUpperCase();
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
    logger.debug("Enriching toaddr", {
      uid: message.uid,
      toaddr: message.toaddr,
      type: typeof message.toaddr,
    });

    const toaddrHex = tryFormatAsHex(message.toaddr, "toaddr");
    if (toaddrHex) {
      message.toaddr_hex = toaddrHex;

      const groundStation = lookupGroundstation(toaddrHex);
      logger.debug("Ground station lookup", {
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
    logger.debug("Enriching fromaddr", {
      uid: message.uid,
      fromaddr: message.fromaddr,
      type: typeof message.fromaddr,
    });

    const fromaddrHex = tryFormatAsHex(message.fromaddr, "fromaddr");
    if (fromaddrHex) {
      message.fromaddr_hex = fromaddrHex;

      const groundStation = lookupGroundstation(fromaddrHex);
      logger.debug("Ground station lookup", {
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
): AcarsMsg[] {
  return messages.map((msg) => enrichMessage(msg));
}

/**
 * Database helper functions for ACARS Hub
 *
 * This module implements helper functions matching Python acarshub_database.py:
 * - is_message_not_empty(): Validate if message has meaningful content
 * - update_frequencies(): Update frequency count tables per decoder
 * - lookup_groundstation(): Get ground station info by ID
 * - lookup_label(): Get label decoder info
 * - get_message_label_json(): Get label metadata JSON
 * - find_airline_code_from_iata(): Lookup airline by IATA code
 * - find_airline_code_from_icao(): Lookup airline by ICAO code
 */

import { eq, sql } from "drizzle-orm";
import {
  airlines,
  groundStations,
  iataOverrides,
  messageLabels,
} from "../config.js";
import { createLogger } from "../utils/logger.js";
import { getDatabase } from "./client.js";
import {
  freqsAcars,
  freqsHfdl,
  freqsImsl,
  freqsIrdm,
  freqsVdlm2,
  messagesCount,
  messagesCountDropped,
} from "./schema.js";

const logger = createLogger("db:helpers");

/**
 * Check if a message contains meaningful content
 *
 * Equivalent to Python is_message_not_empty() function.
 *
 * A message is considered "not empty" if it has:
 * - Text content (msg_text field)
 * - Label information
 * - Flight number
 * - Tail number
 * - Departure or destination airport
 * - Libacars decoded data
 *
 * @param message Message object (from JSON)
 * @returns true if message has content, false if empty
 */
export function isMessageNotEmpty(message: {
  text?: string | null;
  label?: string | null;
  flight?: string | null;
  tail?: string | null;
  depa?: string | null;
  dsta?: string | null;
  libacars?: string | null;
}): boolean {
  // Check if text field has content
  if (message.text && message.text.trim() !== "") {
    return true;
  }

  // Check if label is present
  if (message.label && message.label.trim() !== "") {
    return true;
  }

  // Check if flight number is present
  if (message.flight && message.flight.trim() !== "") {
    return true;
  }

  // Check if tail number is present
  if (message.tail && message.tail.trim() !== "") {
    return true;
  }

  // Check if departure airport is present
  if (message.depa && message.depa.trim() !== "") {
    return true;
  }

  // Check if destination airport is present
  if (message.dsta && message.dsta.trim() !== "") {
    return true;
  }

  // Check if libacars decoded data is present
  if (message.libacars && message.libacars.trim() !== "") {
    return true;
  }

  // Message is empty
  return false;
}

/**
 * Update frequency count tables per decoder
 *
 * Equivalent to Python update_frequencies() function.
 *
 * Maps message_type to appropriate freqs_* table and increments count.
 *
 * @param freq Frequency string (e.g., "131.550", "136.975")
 * @param messageType Message type (ACARS, VDLM2, HFDL, IMSL, IRDM)
 */
export function updateFrequencies(freq: string, messageType: string): void {
  const db = getDatabase();

  // Map message_type to appropriate frequency table
  const freqTableMap: Record<
    string,
    | typeof freqsAcars
    | typeof freqsVdlm2
    | typeof freqsHfdl
    | typeof freqsImsl
    | typeof freqsIrdm
  > = {
    ACARS: freqsAcars,
    "VDL-M2": freqsVdlm2,
    VDLM2: freqsVdlm2, // Alternative spelling
    HFDL: freqsHfdl,
    IMSL: freqsImsl,
    IRDM: freqsIrdm,
  };

  const freqTable = freqTableMap[messageType];

  if (!freqTable) {
    logger.warn(`Unknown message_type for frequency: ${messageType}`);
    return;
  }

  try {
    // Check if frequency already exists
    const existing = db
      .select()
      .from(freqTable)
      .where(eq(freqTable.freq, freq))
      .get();

    if (existing) {
      // Increment existing count
      db.update(freqTable)
        .set({ count: sql`${freqTable.count} + 1` })
        .where(eq(freqTable.freq, freq))
        .run();
    } else {
      // Insert new frequency with count = 1
      db.insert(freqTable).values({ freq, count: 1 }).run();
    }
  } catch (error) {
    logger.error("Failed to update frequency", {
      freq,
      messageType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Look up ground station by ID
 *
 * Equivalent to Python lookup_groundstation() function.
 *
 * @param stationId Ground station ID
 * @returns Ground station info or null if not found
 */
export function lookupGroundstation(stationId: string): {
  icao: string;
  name: string;
} | null {
  return groundStations[stationId] || null;
}

/**
 * Look up message label decoder info
 *
 * Equivalent to Python lookup_label() function.
 *
 * @param label ACARS label (e.g., "H1", "SA", "Q0")
 * @returns Label name string or null if not found
 */
export function lookupLabel(label: string): string | null {
  const labelData = messageLabels[label];
  if (!labelData || typeof labelData !== "object") {
    return null;
  }

  // metadata.json structure: { "H1": { "name": "Label Name", "label": "H1" } }
  const labelObj = labelData as { name?: string };
  return labelObj.name || null;
}

/**
 * Get message label metadata as JSON
 *
 * Equivalent to Python get_message_label_json() function.
 *
 * @param label ACARS label
 * @returns Label metadata JSON or null
 */
export function getMessageLabelJson(label: string): string | null {
  const labelData = lookupLabel(label);
  if (!labelData) {
    return null;
  }

  try {
    return JSON.stringify(labelData);
  } catch (error) {
    logger.error("Failed to stringify label data", { label, error });
    return null;
  }
}

/**
 * Find airline code from IATA code
 *
 * Equivalent to Python find_airline_code_from_iata() function.
 *
 * Checks overrides first, then falls back to airlines database.
 *
 * @param iataCode IATA airline code (e.g., "UA", "AA", "DL")
 * @returns Airline info or unknown airline
 */
export function findAirlineCodeFromIata(iataCode: string): {
  icao: string;
  name: string;
} {
  // Check overrides first
  if (iataCode in iataOverrides) {
    return iataOverrides[iataCode];
  }

  // Check airlines database
  if (iataCode in airlines) {
    return {
      icao: airlines[iataCode].ICAO,
      name: airlines[iataCode].NAME,
    };
  }

  // Return unknown airline
  return {
    icao: iataCode,
    name: "Unknown Airline",
  };
}

/**
 * Find airline code from ICAO code
 *
 * Equivalent to Python find_airline_code_from_icao() function.
 *
 * Searches through airlines database to find matching ICAO code.
 *
 * @param icaoCode ICAO airline code (e.g., "UAL", "AAL", "DAL")
 * @returns Airline info or unknown airline
 */
export function findAirlineCodeFromIcao(icaoCode: string): {
  iata: string;
  name: string;
} {
  // Search through airlines database for matching ICAO
  for (const [iata, airline] of Object.entries(airlines)) {
    if (airline.ICAO === icaoCode) {
      return {
        iata,
        name: airline.NAME,
      };
    }
  }

  // Return unknown airline
  return {
    iata: icaoCode,
    name: "UNKNOWN AIRLINE",
  };
}

/**
 * Get error and message statistics from database
 *
 * Equivalent to Python get_errors() function.
 *
 * Returns full statistics matching Python format:
 * - non_empty_total: Total non-empty messages
 * - non_empty_errors: Non-empty messages with errors
 * - empty_total: Total empty messages (dropped)
 * - empty_errors: Empty messages with errors
 *
 * @returns Error and message statistics
 */
export function getErrors(): {
  non_empty_total: number;
  non_empty_errors: number;
  empty_total: number;
  empty_errors: number;
} {
  const db = getDatabase();

  try {
    // Get logged message counts
    const count = db.select().from(messagesCount).get();

    // Get non-logged (empty) message counts
    const nonlogged = db.select().from(messagesCountDropped).get();

    return {
      non_empty_total: count?.total ?? 0,
      non_empty_errors: count?.errors ?? 0,
      empty_total: nonlogged?.nonloggedGood ?? 0,
      empty_errors: nonlogged?.nonloggedErrors ?? 0,
    };
  } catch (error) {
    logger.error("Failed to get error statistics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      non_empty_total: 0,
      non_empty_errors: 0,
      empty_total: 0,
      empty_errors: 0,
    };
  }
}

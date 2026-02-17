/**
 * Message transformation utilities for ACARS Hub database
 *
 * This module implements message transformation functions matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - create_db_safe_params(): Transform raw JSON to database-safe parameters
 * - add_message_from_json(): Main entry point for message ingestion
 *
 * Key transformations:
 * - Field name mapping (timestamp → time, data → text)
 * - Frequency normalization (pad to 7 decimals)
 * - libacars JSON stringification
 * - Default empty strings for NOT NULL constraints
 * - Type coercion and validation
 */

import { createLogger } from "../../utils/logger.js";
import { getBackupDatabase, hasBackupDatabase } from "../client.js";
import type { NewMessage } from "../schema.js";
import { messages } from "../schema.js";
import { type AlertMetadata, addMessage } from "./messages.js";

const logger = createLogger("db:transform");

/**
 * Raw message from JSON (from acarsdec, vdlm2dec, dumphfdl, etc.)
 */
export interface RawMessage {
  timestamp?: number;
  station_id?: string;
  toaddr?: string;
  fromaddr?: string;
  depa?: string;
  dsta?: string;
  eta?: string;
  gtout?: string;
  gtin?: string;
  wloff?: string;
  wlin?: string;
  lat?: string | number;
  lon?: string | number;
  alt?: string | number;
  text?: string;
  data?: string; // Alternative field name for text
  tail?: string;
  flight?: string;
  icao?: string;
  freq?: string | number;
  ack?: string;
  mode?: string;
  label?: string;
  block_id?: string;
  msgno?: string;
  is_response?: string | boolean;
  is_onground?: string | boolean;
  error?: number;
  libacars?: unknown;
  level?: string | number;
  // Fields to skip
  channel?: string | number;
  end?: string | number;
  assstat?: unknown;
  app?: unknown;
  // Allow any other fields
  [key: string]: unknown;
}

/**
 * Transform raw JSON message to database-safe parameters
 *
 * Equivalent to Python create_db_safe_params() function.
 *
 * This function:
 * 1. Maps field names (timestamp → time, data → text)
 * 2. Normalizes frequencies to 7 decimal places
 * 3. Stringifies libacars JSON objects
 * 4. Converts all fields to strings (for NOT NULL constraints)
 * 5. Sets empty string as default for missing fields
 * 6. Logs unidentified keys for debugging
 *
 * @param messageFromJson Raw message object from decoder
 * @returns Database-safe message parameters
 */
export function createDbSafeParams(
  messageFromJson: RawMessage,
): Omit<NewMessage, "id" | "uid"> {
  const params: Omit<NewMessage, "id" | "uid"> = {
    messageType: "", // Set by caller
    time: 0,
    stationId: "",
    toaddr: "",
    fromaddr: "",
    depa: "",
    dsta: "",
    eta: "",
    gtout: "",
    gtin: "",
    wloff: "",
    wlin: "",
    lat: "",
    lon: "",
    alt: "",
    text: "",
    tail: "",
    flight: "",
    icao: "",
    freq: "",
    ack: "",
    mode: "",
    label: "",
    blockId: "",
    msgno: "",
    isResponse: "",
    isOnground: "",
    error: "",
    libacars: "",
    level: "",
  };

  // Track which keys we've processed to identify unrecognized fields
  const processedKeys = new Set<string>();

  for (const [index, value] of Object.entries(messageFromJson)) {
    processedKeys.add(index);

    switch (index) {
      case "timestamp":
        params.time = typeof value === "number" ? value : 0;
        break;

      case "station_id":
        params.stationId = String(value ?? "");
        break;

      case "toaddr":
        params.toaddr = String(value ?? "");
        break;

      case "fromaddr":
        params.fromaddr = String(value ?? "");
        break;

      case "depa":
        params.depa = String(value ?? "");
        break;

      case "dsta":
        params.dsta = String(value ?? "");
        break;

      case "eta":
        params.eta = String(value ?? "");
        break;

      case "gtout":
        params.gtout = String(value ?? "");
        break;

      case "gtin":
        params.gtin = String(value ?? "");
        break;

      case "wloff":
        params.wloff = String(value ?? "");
        break;

      case "wlin":
        params.wlin = String(value ?? "");
        break;

      case "lat":
        params.lat = String(value ?? "");
        break;

      case "lon":
        params.lon = String(value ?? "");
        break;

      case "alt":
        params.alt = String(value ?? "");
        break;

      case "text":
        params.text = String(value ?? "");
        break;

      case "data":
        // Alternative field name for text
        params.text = String(value ?? "");
        break;

      case "tail":
        params.tail = String(value ?? "");
        break;

      case "flight":
        params.flight = String(value ?? "");
        break;

      case "icao":
        params.icao = String(value ?? "");
        break;

      case "freq":
        // Normalize frequency to 7 characters (pad with zeros)
        if (value !== null && value !== undefined) {
          const freqStr = String(value);
          params.freq = freqStr.padEnd(7, "0");
        }
        break;

      case "ack":
        params.ack = String(value ?? "");
        break;

      case "mode":
        params.mode = String(value ?? "");
        break;

      case "label":
        params.label = String(value ?? "");
        break;

      case "block_id":
        params.blockId = String(value ?? "");
        break;

      case "msgno":
        params.msgno = String(value ?? "");
        break;

      case "is_response":
        params.isResponse = String(value ?? "");
        break;

      case "is_onground":
        params.isOnground = String(value ?? "");
        break;

      case "error":
        params.error = String(value ?? "");
        break;

      case "libacars":
        // Stringify JSON objects
        try {
          if (value !== null && value !== undefined) {
            params.libacars =
              typeof value === "string" ? value : JSON.stringify(value);
          }
        } catch (error) {
          logger.error("Failed to stringify libacars", {
            error: error instanceof Error ? error.message : String(error),
          });
          params.libacars = "";
        }
        break;

      case "level":
        params.level = String(value ?? "");
        break;

      // Skip these fields (not stored in database)
      case "channel":
      case "end":
      case "assstat":
      case "app":
        // Intentionally skip
        break;

      default:
        // Unidentified key - log for debugging
        logger.debug("Unidentified key in message", {
          key: index,
          value,
        });
        break;
    }
  }

  return params;
}

/**
 * Add a message from raw JSON
 *
 * Equivalent to Python add_message_from_json() function.
 *
 * This is the main entry point for message ingestion. It:
 * 1. Transforms raw JSON to database-safe parameters
 * 2. Calls addMessage() to insert with alert matching
 * 3. Handles backup database writes (if configured)
 * 4. Returns alert metadata for Socket.IO emission
 *
 * @param messageType Message type (ACARS, VDL-M2, HFDL, IMSL, IRDM)
 * @param messageFromJson Raw message from decoder
 * @returns Alert metadata with matched terms
 */
export function addMessageFromJson(
  messageType: string,
  messageFromJson: RawMessage,
): AlertMetadata {
  try {
    // Transform raw JSON to database-safe parameters
    const params = createDbSafeParams(messageFromJson);

    // Set message type
    params.messageType = messageType;

    // Add message to primary database with alert matching
    const alertMetadata = addMessage(params, messageFromJson);

    // Write to backup database if configured
    // Uses same UID as primary database (already in alertMetadata)
    if (hasBackupDatabase()) {
      try {
        const backupDb = getBackupDatabase();
        if (backupDb) {
          logger.debug("Writing message to backup database", {
            uid: alertMetadata.uid,
          });

          // Insert message with same UID to backup database
          backupDb
            .insert(messages)
            .values({
              ...params,
              uid: alertMetadata.uid,
            })
            .run();
        }
      } catch (error) {
        logger.error("Failed to write to backup database", {
          error: error instanceof Error ? error.message : String(error),
          uid: alertMetadata.uid,
        });
        // Don't fail the entire operation if backup write fails
      }
    }

    return alertMetadata;
  } catch (error) {
    logger.error("Failed to add message from JSON", {
      error: error instanceof Error ? error.message : String(error),
      messageType,
    });

    // Return empty alert metadata on error
    return {
      uid: "",
      matched: false,
      matched_text: [],
      matched_icao: [],
      matched_tail: [],
      matched_flight: [],
    };
  }
}

/**
 * Normalize frequency string to 7 characters
 *
 * Helper function used by createDbSafeParams().
 * Pads frequency with zeros to ensure consistent length.
 *
 * Examples:
 * - "131.55" → "131.550"
 * - "136.975" → "136.975"
 * - "131" → "1310000"
 *
 * @param freq Frequency string or number
 * @returns Normalized frequency string (7 chars)
 */
export function normalizeFrequency(freq: string | number): string {
  const freqStr = String(freq);
  return freqStr.padEnd(7, "0");
}

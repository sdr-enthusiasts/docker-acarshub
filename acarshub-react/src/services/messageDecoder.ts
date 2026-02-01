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

import type { MessageDecoder as MessageDecoderType } from "@airframes/acars-decoder";
import { MessageDecoder } from "@airframes/acars-decoder";
import type { AcarsMsg, DecodedText } from "../types";
import { createLogger } from "../utils/logger";

const logger = createLogger("decoder");

/**
 * Fields to check for duplicate detection
 * These fields must all match for a message to be considered a duplicate
 */
const DUPLICATE_CHECK_FIELDS: Array<keyof AcarsMsg> = [
  "text",
  "data",
  "libacars",
  "dsta",
  "depa",
  "eta",
  "gtout",
  "gtin",
  "wloff",
  "wlin",
  "lat",
  "lon",
  "alt",
];

/**
 * Result of duplicate detection
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  isMultiPart: boolean;
  matchedMessage?: AcarsMsg;
}

/**
 * Singleton ACARS Message Decoder Instance
 * Uses @airframes/acars-decoder to decode ACARS message text
 */
class AcarsMessageDecoder {
  private decoder: MessageDecoderType;

  constructor() {
    this.decoder = new MessageDecoder();
    logger.debug("ACARS Message Decoder initialized");
  }

  /**
   * Attempt to decode an ACARS message
   * @param message - ACARS message with text field
   * @returns Message with decodedText field added if decoding was successful
   */
  public decode(message: AcarsMsg): AcarsMsg {
    // Only attempt to decode if message has text
    if (!message.text) {
      logger.trace("Skipping decode - no text field", {
        uid: message.uid,
        label: message.label,
      });
      return message;
    }

    logger.trace("Attempting to decode message", {
      uid: message.uid,
      label: message.label,
      textLength: message.text.length,
    });

    try {
      // The decoder requires a Message object with text: string (not optional)
      const messageForDecoder = {
        text: message.text,
        label: message.label,
        // sublabel is not in our AcarsMsg type but could be added if needed
      };

      // The decoder.decode() returns a DecodeResult with structure:
      // {
      //   decoded: boolean,
      //   decoder: { name: string, type: string, decodeLevel: string },
      //   formatted: { description: string, items: [...] },
      //   raw: any,
      //   remaining: { text?: string }
      // }
      const result = this.decoder.decode(messageForDecoder);

      logger.trace("Decode result", {
        uid: message.uid,
        decoded: result.decoded,
        decoderName: result.decoder.name,
        decodeLevel: result.decoder.decodeLevel,
      });

      // Only add decodedText if decoding was successful
      if (result.decoded === true) {
        logger.debug("Successfully decoded message", {
          uid: message.uid,
          decoderName: result.decoder.name,
          decodeLevel: result.decoder.decodeLevel,
          itemCount: result.formatted.items.length,
        });

        // Convert the DecodeResult to our DecodedText format
        const decodedText: DecodedText = {
          decoder: {
            decodeLevel: result.decoder.decodeLevel as
              | "full"
              | "partial"
              | "none",
            name: result.decoder.name,
          },
          // Store the formatted structure as-is (matches our DecodedTextItem flexible type)
          formatted: result.formatted.items.map((item) => ({
            label: item.label,
            value: item.value,
            type: item.type,
            code: item.code,
          })),
        };

        return {
          ...message,
          decodedText,
        };
      }

      logger.trace("Message not decoded (no decoder matched)", {
        uid: message.uid,
        label: message.label,
      });

      return message;
    } catch (error) {
      logger.error(
        "Decoder error - message will be returned without decoding",
        {
          uid: message.uid,
          label: message.label,
          text: message.text?.substring(0, 50),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      return message;
    }
  }

  /**
   * Reset the decoder instance (if needed for testing or reinitialization)
   */
  public reset(): void {
    logger.info("Resetting ACARS Message Decoder");
    this.decoder = new MessageDecoder();
  }
}

/**
 * Check if a new message is a duplicate of an existing message
 * by comparing all fields in DUPLICATE_CHECK_FIELDS
 *
 * @param existingMessage - Existing message in the system
 * @param newMessage - New incoming message
 * @returns true if all fields match (duplicate)
 */
export function checkForDuplicate(
  existingMessage: AcarsMsg,
  newMessage: AcarsMsg,
): boolean {
  logger.trace("Checking for duplicate message", {
    existingUid: existingMessage.uid,
    newUid: newMessage.uid,
  });

  const isDuplicate = DUPLICATE_CHECK_FIELDS.every((field) => {
    const existingValue = existingMessage[field];
    const newValue = newMessage[field];

    // Both undefined/null = match
    if (
      (existingValue === undefined || existingValue === null) &&
      (newValue === undefined || newValue === null)
    ) {
      return true;
    }

    // One undefined/null, other has value = no match
    if (
      (existingValue === undefined || existingValue === null) !==
      (newValue === undefined || newValue === null)
    ) {
      return false;
    }

    // Both have values - compare them
    return existingValue === newValue;
  });

  if (isDuplicate) {
    logger.debug("Duplicate message detected", {
      existingUid: existingMessage.uid,
      newUid: newMessage.uid,
    });
  }

  return isDuplicate;
}

/**
 * Check if two messages are part of a multi-part message sequence
 *
 * @param existingMessage - Existing message in the system
 * @param newMessage - New incoming message
 * @returns true if messages are part of the same multi-part sequence
 */
export function isMultiPartMessage(
  existingMessage: AcarsMsg,
  newMessage: AcarsMsg,
): boolean {
  logger.trace("Checking if messages are multi-part", {
    existingUid: existingMessage.uid,
    existingMsgno: existingMessage.msgno,
    newUid: newMessage.uid,
    newMsgno: newMessage.msgno,
  });

  // Must have same station_id (keep ACARS/VDLM separate)
  if (existingMessage.station_id !== newMessage.station_id) {
    return false;
  }

  // Must have msgno field
  if (!newMessage.msgno || !existingMessage.msgno) {
    return false;
  }

  // Timestamp must be within 8 seconds
  const timeDiff = newMessage.timestamp - existingMessage.timestamp;
  if (timeDiff >= 8.0) {
    logger.trace("Messages too far apart in time", {
      timeDiff,
      threshold: 8.0,
    });
    return false;
  }

  const newMsgno = newMessage.msgno;
  const existingMsgno = existingMessage.msgno;

  // Check for AzzA pattern (e.g., A00A, A01A, A02A)
  // First and fourth characters match
  if (
    newMsgno.charAt(0) === existingMsgno.charAt(0) &&
    newMsgno.charAt(3) === existingMsgno.charAt(3)
  ) {
    logger.debug("Multi-part message detected (AzzA pattern)", {
      existingMsgno,
      newMsgno,
    });
    return true;
  }

  // Check for AAAz pattern (e.g., AAA1, AAA2, AAA3)
  // First three characters match
  if (newMsgno.substring(0, 3) === existingMsgno.substring(0, 3)) {
    logger.debug("Multi-part message detected (AAAz pattern)", {
      existingMsgno,
      newMsgno,
    });
    return true;
  }

  return false;
}

/**
 * Parse msgno_parts string to check if a msgno already exists
 *
 * @param msgno_parts - String like "M01A M02A" or "M01Ax2 M02A"
 * @param msgno - Message number to check for
 * @returns Object with exists flag and updated parts string
 */
export function checkMultiPartDuplicate(
  msgno_parts: string,
  msgno: string,
): { exists: boolean; updatedParts: string } {
  const parts = msgno_parts.split(" ");
  let exists = false;
  let updatedParts = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partMsgno = part.substring(0, 4);

    if (partMsgno === msgno) {
      // Found a duplicate
      exists = true;

      if (part.length === 4) {
        // First duplicate - add "x2"
        const newPart = `${part}x2`;
        updatedParts += i === 0 ? newPart : ` ${newPart}`;
      } else {
        // Subsequent duplicate - increment counter
        const count = Number.parseInt(part.substring(5), 10) + 1;
        const newPart = `${partMsgno}x${count}`;
        updatedParts += i === 0 ? newPart : ` ${newPart}`;
      }
    } else {
      // Not a duplicate - keep as-is
      updatedParts += i === 0 ? part : ` ${part}`;
    }
  }

  return { exists, updatedParts };
}

/**
 * Merge multi-part messages
 * Appends text and updates msgno_parts
 *
 * @param existingMessage - Existing parent message
 * @param newMessage - New message part to merge
 * @param decoder - MessageDecoder instance for re-decoding
 * @returns Updated message with merged content
 */
export function mergeMultiPartMessage(
  existingMessage: AcarsMsg,
  newMessage: AcarsMsg,
  decoder: AcarsMessageDecoder,
): AcarsMsg {
  logger.debug("Merging multi-part messages", {
    existingUid: existingMessage.uid,
    existingMsgno: existingMessage.msgno,
    existingParts: existingMessage.msgno_parts,
    newUid: newMessage.uid,
    newMsgno: newMessage.msgno,
  });

  const updated = { ...existingMessage };

  // Update timestamp to newest message
  updated.timestamp = newMessage.timestamp;

  // Merge text fields
  if (updated.text && newMessage.text) {
    // Both have text - append
    updated.text += newMessage.text;
  } else if (newMessage.text) {
    // Only new message has text - set it
    updated.text = newMessage.text;
  }

  // Update msgno_parts
  if (updated.msgno_parts) {
    // Already has parts - append new msgno
    updated.msgno_parts += ` ${newMessage.msgno}`;
  } else if (updated.msgno && newMessage.msgno) {
    // First multi-part - create parts string
    updated.msgno_parts = `${updated.msgno} ${newMessage.msgno}`;
  }

  // Re-decode the merged text
  if (updated.text) {
    logger.debug("Re-decoding merged multi-part message", {
      uid: updated.uid,
      textLength: updated.text.length,
      parts: updated.msgno_parts,
    });
    const decoded = decoder.decode(updated);
    if (decoded.decodedText) {
      updated.decodedText = decoded.decodedText;
    }
  }

  logger.info("Multi-part message merged successfully", {
    uid: updated.uid,
    parts: updated.msgno_parts,
    textLength: updated.text?.length || 0,
  });

  return updated;
}

/**
 * Singleton instance of the ACARS message decoder
 * Export a single instance to be used throughout the application
 */
export const messageDecoder = new AcarsMessageDecoder();

logger.info("Message decoder module loaded");

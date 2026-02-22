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

import type { AcarsMsg } from "../types";
import { createLogger } from "../utils/logger";

const logger = createLogger("messageDecoder");

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
 * Appends text and updates msgno_parts.
 *
 * Because the backend now handles all ACARS decoding, the merged message's
 * decodedText is derived by combining the formatted items of both parts.
 * This is a best-effort representation; the backend will produce accurate
 * decodedText for each individual part as it arrives.
 *
 * @param existingMessage - Existing parent message
 * @param newMessage - New message part to merge
 * @returns Updated message with merged content
 */
export function mergeMultiPartMessage(
  existingMessage: AcarsMsg,
  newMessage: AcarsMsg,
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

  // Merge decodedText: combine formatted items from both parts when both are decoded.
  // The new part's decodedText (if any) is appended after a separator so both
  // parts' decoded content remains visible.
  if (existingMessage.decodedText && newMessage.decodedText) {
    updated.decodedText = {
      decoder: existingMessage.decodedText.decoder,
      formatted: [
        ...existingMessage.decodedText.formatted,
        { label: "---", value: `Part: ${newMessage.msgno ?? ""}` },
        ...newMessage.decodedText.formatted,
      ],
    };
  } else if (newMessage.decodedText) {
    // Only the new part decoded - use its decodedText
    updated.decodedText = newMessage.decodedText;
  }
  // else: keep existing decodedText (or undefined) unchanged

  logger.info("Multi-part message merged successfully", {
    uid: updated.uid,
    parts: updated.msgno_parts,
    textLength: updated.text?.length || 0,
  });

  return updated;
}

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

import type { AcarsMsg, Terms } from "../types";
import { createLogger } from "./logger";

const logger = createLogger("alerts");

/**
 * Check if a message matches any alert terms
 *
 * This implements client-side alert matching since the backend doesn't
 * send matched=true flags with messages. We search the message text
 * for alert terms using word boundary matching (same as backend).
 *
 * @param message - ACARS message to check
 * @param alertTerms - Alert terms configuration from backend
 * @returns Object with matched flag and array of matched terms
 */
export function checkMessageForAlerts(
  message: AcarsMsg,
  alertTerms: Terms,
): {
  matched: boolean;
  matchedTerms: string[];
  matchedIcao: string[];
  matchedTail: string[];
  matchedFlight: string[];
} {
  const matchedTerms: string[] = [];
  const matchedIcao: string[] = [];
  const matchedTail: string[] = [];
  const matchedFlight: string[] = [];

  // If no alert terms configured, return no match
  if (!alertTerms.terms || alertTerms.terms.length === 0) {
    logger.trace("No alert terms configured, skipping alert check");
    return {
      matched: false,
      matchedTerms: [],
      matchedIcao: [],
      matchedTail: [],
      matchedFlight: [],
    };
  }

  // Get searchable text from message (check all text fields)
  // Extract text from decodedText field (label and value pairs from acars-decoder)
  let decodedTextContent = "";
  if (message.decodedText?.formatted) {
    decodedTextContent = message.decodedText.formatted
      .map((item) => `${item.label || ""} ${item.value || ""}`)
      .join(" ");
  }

  const searchableText = [
    message.text || "",
    message.data || "",
    message.decoded_msg || "",
    decodedTextContent,
  ]
    .join(" ")
    .toUpperCase();

  // Check each alert term in text (terms are already uppercase from backend)
  // Only check text if there is searchable text available
  if (searchableText.trim()) {
    for (const term of alertTerms.terms) {
      const upperTerm = term.toUpperCase();

      // Use word boundary regex matching (same as backend)
      // \b ensures we match whole words only
      const regex = new RegExp(`\\b${escapeRegex(upperTerm)}\\b`, "i");

      if (regex.test(searchableText)) {
        // Term matched! Now check if it should be ignored
        let shouldIgnore = false;

        for (const ignoreTerm of alertTerms.ignore || []) {
          const upperIgnoreTerm = ignoreTerm.toUpperCase();
          const ignoreRegex = new RegExp(
            `\\b${escapeRegex(upperIgnoreTerm)}\\b`,
            "i",
          );

          if (ignoreRegex.test(searchableText)) {
            shouldIgnore = true;
            break;
          }
        }

        if (!shouldIgnore) {
          matchedTerms.push(term);
          logger.debug("Alert term matched", {
            uid: message.uid,
            term,
            wasIgnored: false,
          });
        } else {
          logger.trace("Alert term matched but ignored", {
            uid: message.uid,
            term,
          });
        }
      }
    }
  }

  // Check ICAO hex field (supports full and partial matching)
  const icaoHex = message.icao_hex || message.icao;
  if (icaoHex !== null && icaoHex !== undefined && icaoHex !== "") {
    const icaoUpper =
      typeof icaoHex === "string"
        ? icaoHex.toUpperCase()
        : icaoHex.toString(16).toUpperCase().padStart(6, "0");

    for (const term of alertTerms.terms) {
      const upperTerm = term.toUpperCase();

      // Support both full match and partial prefix match
      if (icaoUpper === upperTerm || icaoUpper.startsWith(upperTerm)) {
        // Check if it should be ignored
        let shouldIgnore = false;

        for (const ignoreTerm of alertTerms.ignore || []) {
          const upperIgnoreTerm = ignoreTerm.toUpperCase();
          if (
            icaoUpper === upperIgnoreTerm ||
            icaoUpper.startsWith(upperIgnoreTerm)
          ) {
            shouldIgnore = true;
            break;
          }
        }

        if (!shouldIgnore && !matchedIcao.includes(term)) {
          matchedIcao.push(term);
          logger.debug("Alert term matched ICAO", {
            uid: message.uid,
            term,
            icao: icaoUpper,
          });
        }
      }
    }
  }

  // Check tail number field (supports full and partial matching)
  if (
    message.tail !== null &&
    message.tail !== undefined &&
    message.tail !== ""
  ) {
    const tailUpper = message.tail.toUpperCase();

    for (const term of alertTerms.terms) {
      const upperTerm = term.toUpperCase();

      // Support both full match and partial prefix match
      if (tailUpper === upperTerm || tailUpper.startsWith(upperTerm)) {
        // Check if it should be ignored
        let shouldIgnore = false;

        for (const ignoreTerm of alertTerms.ignore || []) {
          const upperIgnoreTerm = ignoreTerm.toUpperCase();
          if (
            tailUpper === upperIgnoreTerm ||
            tailUpper.startsWith(upperIgnoreTerm)
          ) {
            shouldIgnore = true;
            break;
          }
        }

        if (!shouldIgnore && !matchedTail.includes(term)) {
          matchedTail.push(term);
          logger.debug("Alert term matched tail", {
            uid: message.uid,
            term,
            tail: tailUpper,
          });
        }
      }
    }
  }

  // Check flight number fields (supports full and partial matching)
  const flightNumber = message.icao_flight || message.flight;
  if (
    flightNumber !== null &&
    flightNumber !== undefined &&
    flightNumber !== ""
  ) {
    const flightUpper = flightNumber.toUpperCase();

    for (const term of alertTerms.terms) {
      const upperTerm = term.toUpperCase();

      // Support both full match and partial prefix match
      if (flightUpper === upperTerm || flightUpper.startsWith(upperTerm)) {
        // Check if it should be ignored
        let shouldIgnore = false;

        for (const ignoreTerm of alertTerms.ignore || []) {
          const upperIgnoreTerm = ignoreTerm.toUpperCase();
          if (
            flightUpper === upperIgnoreTerm ||
            flightUpper.startsWith(upperIgnoreTerm)
          ) {
            shouldIgnore = true;
            break;
          }
        }

        if (!shouldIgnore && !matchedFlight.includes(term)) {
          matchedFlight.push(term);
          logger.debug("Alert term matched flight", {
            uid: message.uid,
            term,
            flight: flightUpper,
          });
        }
      }
    }
  }

  const totalMatches =
    matchedTerms.length +
    matchedIcao.length +
    matchedTail.length +
    matchedFlight.length;

  return {
    matched: totalMatches > 0,
    matchedTerms,
    matchedIcao,
    matchedTail,
    matchedFlight,
  };
}

/**
 * Escape special regex characters in a string
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply alert matching to a message and update its matched fields
 * This mutates the message object to add matched and matched_text fields
 *
 * @param message - ACARS message to update
 * @param alertTerms - Alert terms configuration
 * @returns The same message object with matched fields updated
 */
export function applyAlertMatching(
  message: AcarsMsg,
  alertTerms: Terms,
): AcarsMsg {
  const { matched, matchedTerms, matchedIcao, matchedTail, matchedFlight } =
    checkMessageForAlerts(message, alertTerms);

  message.matched = matched;
  message.matched_text = matchedTerms;
  message.matched_icao = matchedIcao;
  message.matched_tail = matchedTail;
  message.matched_flight = matchedFlight;

  if (matched) {
    logger.info("Alert match applied to message", {
      uid: message.uid,
      matchedTerms,
      matchedIcao,
      matchedTail,
      matchedFlight,
    });
  }

  return message;
}

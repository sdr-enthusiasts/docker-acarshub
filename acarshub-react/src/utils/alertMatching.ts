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
): { matched: boolean; matchedTerms: string[] } {
  const matchedTerms: string[] = [];

  // If no alert terms configured or message has no text, return no match
  if (!alertTerms.terms || alertTerms.terms.length === 0) {
    return { matched: false, matchedTerms: [] };
  }

  // Get searchable text from message (check all text fields)
  const searchableText = [
    message.text || "",
    message.data || "",
    message.decoded_msg || "",
  ]
    .join(" ")
    .toUpperCase();

  // If no searchable text, return no match
  if (!searchableText.trim()) {
    return { matched: false, matchedTerms: [] };
  }

  // Check each alert term (terms are already uppercase from backend)
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
      }
    }
  }

  return {
    matched: matchedTerms.length > 0,
    matchedTerms,
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
  const { matched, matchedTerms } = checkMessageForAlerts(message, alertTerms);

  message.matched = matched;
  message.matched_text = matchedTerms;

  return message;
}

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

import type {
  DecodedText,
  DecodedTextItem,
  LibacarsData,
  LibacarsFrequencyData,
} from "../types";

/**
 * Process decodedText.formatted array to generate formatted output
 * @param input - DecodedTextItem or array of items from @airframes/acars-decoder
 * @returns Formatted string output
 */
export function loopDecodedArray(
  input: DecodedTextItem | DecodedTextItem[] | unknown,
): string {
  let output = "";

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "object" && item !== null) {
        const decodedItem = item as DecodedTextItem;
        // Format as "Label: Value"
        output += `${decodedItem.label}: ${decodedItem.value}\n`;
      }
    }
    return output;
  }

  if (typeof input !== "object" || input === null) {
    return String(input);
  }

  const item = input as DecodedTextItem;
  // Single item: format as "Label: Value"
  output += `${item.label}: ${item.value}\n`;

  return output;
}

/**
 * Highlight matched alert terms in text
 * @param matchedTerms - Array of terms to highlight
 * @param text - Text to search and highlight in
 * @returns Text with matched terms wrapped in <mark> tags
 */
export function highlightMatchedText(
  matchedTerms: string[],
  text: string,
): string {
  let result = text;

  for (const term of matchedTerms) {
    const upperTerm = term.toUpperCase();
    // Use a case-insensitive replace
    const regex = new RegExp(upperTerm, "gi");
    result = result.replace(
      regex,
      `<mark class="alert-highlight">${upperTerm}</mark>`,
    );
  }

  return result;
}

/**
 * Format a single libacars value recursively
 * @param key - Property key
 * @param value - Property value
 * @param indent - Indentation level
 * @returns Formatted HTML string
 */
function formatLibacarsValue(key: string, value: unknown, indent = 0): string {
  let html = "";
  const indentPx = indent * 20;

  // Format key as Title Case
  const formattedKey = key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (value === null || value === undefined) {
    html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong> <em>null</em></div>`;
  } else if (typeof value === "boolean") {
    html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong> ${value ? "Yes" : "No"}</div>`;
  } else if (typeof value === "number" || typeof value === "string") {
    html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong> ${value}</div>`;
  } else if (Array.isArray(value)) {
    html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong></div>`;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "object" && item !== null) {
        html += `<div style="margin-left: ${(indent + 1) * 20}px;"><em>Item ${i + 1}:</em></div>`;
        for (const [subKey, subValue] of Object.entries(item)) {
          html += formatLibacarsValue(subKey, subValue, indent + 2);
        }
      } else {
        html += `<div style="margin-left: ${(indent + 1) * 20}px;">• ${item}</div>`;
      }
    }
  } else if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // Special handling for timestamp objects
    if (
      typeof obj.hour === "number" &&
      typeof obj.min === "number" &&
      typeof obj.sec === "number"
    ) {
      const hour = String(obj.hour).padStart(2, "0");
      const min = String(obj.min).padStart(2, "0");
      const sec = String(obj.sec).padStart(2, "0");
      html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong> ${hour}:${min}:${sec} UTC</div>`;
    } else {
      html += `<div style="margin-left: ${indentPx}px;"><strong>${formattedKey}:</strong></div>`;
      for (const [subKey, subValue] of Object.entries(obj)) {
        html += formatLibacarsValue(subKey, subValue, indent + 1);
      }
    }
  }

  return html;
}

/**
 * Format libacars frequency data
 * @param data - Frequency data object
 * @returns Formatted HTML string
 */
function formatLibacarsFrequencyData(data: LibacarsFrequencyData): string {
  let html = '<div class="libacars-freq-data">';
  html += "<strong>Ground Station Frequency Information:</strong><br>";

  if (data.freq_data && Array.isArray(data.freq_data)) {
    for (const station of data.freq_data) {
      if (station.gs?.name) {
        html += '<div style="margin-left: 20px; margin-top: 10px;">';
        html += `<strong>${station.gs.name}</strong>`;

        if (
          station.gs.listening_on_freqs &&
          station.gs.listening_on_freqs.length > 0
        ) {
          html += '<br><span style="margin-left: 20px;">Listening on: ';
          const freqs = station.gs.listening_on_freqs
            .map((f) => `${f.freq} kHz`)
            .join(", ");
          html += `${freqs}</span>`;
        }

        if (station.gs.heard_on_freqs && station.gs.heard_on_freqs.length > 0) {
          html += '<br><span style="margin-left: 20px;">Heard on: ';
          const heard = station.gs.heard_on_freqs
            .map((f) => `${f.freq} kHz`)
            .join(", ");
          html += `${heard}</span>`;
        }

        html += "</div>";
      }
    }
  }

  html += "</div>";
  return html;
}

/**
 * Format libacars CPDLC message
 * @param data - CPDLC data object
 * @returns Formatted HTML string
 */
function formatLibacarsCPDLC(data: LibacarsData): string {
  let html = '<div class="libacars-cpdlc">';
  html += "<strong>CPDLC Message:</strong><br>";

  for (const [key, value] of Object.entries(data)) {
    html += formatLibacarsValue(key, value, 1);
  }

  html += "</div>";
  return html;
}

/**
 * Format generic libacars data
 * @param data - Generic libacars data object
 * @returns Formatted HTML string
 */
function formatLibacarsGeneric(data: LibacarsData): string {
  let html = '<div class="libacars-generic">';
  html += "<strong>Decoded Libacars Data:</strong><br>";

  for (const [key, value] of Object.entries(data)) {
    html += formatLibacarsValue(key, value, 1);
  }

  html += "</div>";
  return html;
}

/**
 * Parse and format libacars JSON string
 * @param libacarsString - Raw libacars JSON string from backend
 * @returns Formatted HTML string or null if parsing fails
 */
export function parseAndFormatLibacars(libacarsString: string): string | null {
  try {
    // Clean the libacars string (same as legacy implementation)
    let data = libacarsString;

    // Remove all characters before the first {
    data = data.substring(data.indexOf("{"));
    // Replace all \\ with nothing
    data = data.replace(/\\/g, "");
    // Replace "' with nothing
    data = data.replace(/"'/g, "");
    // Replace '\n\s' with nothing
    data = data.replace(/'\n\s'/g, "");
    // Ensure the last character is }, if not, remove everything after the last }
    data = data.substring(0, data.lastIndexOf("}") + 1);

    const parsedData = JSON.parse(data) as LibacarsData;

    // Determine the type of libacars message and format accordingly
    const freqData = parsedData as LibacarsFrequencyData;
    if (freqData.freq_data) {
      return formatLibacarsFrequencyData(freqData);
    }

    const msgType = (parsedData as { msg_type?: string }).msg_type;
    if (msgType?.includes("cpdlc")) {
      return formatLibacarsCPDLC(parsedData);
    }

    // Generic formatter for unknown types
    return formatLibacarsGeneric(parsedData);
  } catch (error) {
    console.error("Error parsing libacars data:", error);
    return null;
  }
}

/**
 * Format decoded text from @airframes/acars-decoder
 * @param decodedText - DecodedText object
 * @param matchedTerms - Optional array of alert terms to highlight
 * @returns Formatted string output
 */
export function formatDecodedText(
  decodedText: DecodedText,
  matchedTerms?: string[],
): string {
  const formatted = loopDecodedArray(decodedText.formatted);

  if (matchedTerms && matchedTerms.length > 0) {
    return highlightMatchedText(matchedTerms, formatted);
  }

  return formatted;
}

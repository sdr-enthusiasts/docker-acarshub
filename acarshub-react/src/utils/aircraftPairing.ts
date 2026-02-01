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

import type { ADSBAircraft, AltitudeUnit, MessageGroup } from "../types";

/**
 * ADS-B Aircraft with Paired ACARS Data
 * Extended aircraft object with matched ACARS message group
 */
export interface PairedAircraft {
  // ADS-B data
  hex: string;
  flight?: string; // ICAO callsign from ADS-B
  tail?: string; // Registration/tail from ADS-B (via 'r' field)
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number; // Ground speed
  track?: number; // Heading
  category?: string; // Aircraft category (string in ADSBAircraft)
  type?: string; // Aircraft type code (from 't' or 'type' field)

  // ACARS pairing data
  hasMessages: boolean;
  hasAlerts: boolean;
  messageCount: number;
  alertCount: number;
  matchedGroup?: MessageGroup;
  matchStrategy?: "hex" | "flight" | "tail" | "none";
}

/**
 * Match keys extracted from ADS-B aircraft
 * Used for pairing with ACARS message groups
 */
interface ADSBMatchKeys {
  hex: string; // Always present (primary key)
  flight?: string; // ICAO callsign (if available)
  tail?: string; // Registration/tail (if available)
}

/**
 * Extract match keys from ADS-B aircraft data
 * Normalizes and extracts all possible identifiers for matching
 */
function extractADSBMatchKeys(aircraft: ADSBAircraft): ADSBMatchKeys {
  const keys: ADSBMatchKeys = {
    hex: aircraft.hex.toUpperCase().trim(),
  };

  // Extract ICAO callsign (from 'flight' field)
  // Remove trailing spaces and normalize
  if (aircraft.flight) {
    const flight = aircraft.flight.trim();
    if (flight.length > 0) {
      keys.flight = flight.toUpperCase();
    }
  }

  // Extract tail/registration (from 'r' field)
  if (aircraft.r) {
    const tail = aircraft.r.trim();
    if (tail.length > 0) {
      keys.tail = tail.toUpperCase();
    }
  }

  return keys;
}

/**
 * Find ACARS message group for an ADS-B aircraft
 * Tries multiple matching strategies in priority order:
 * 1. Hex (ICAO 24-bit address) - most reliable
 * 2. ICAO callsign (flight number)
 * 3. Tail/registration
 */
function findMessageGroup(
  adsbKeys: ADSBMatchKeys,
  messageGroups: Map<string, MessageGroup>,
): { group?: MessageGroup; strategy: "hex" | "flight" | "tail" | "none" } {
  // Strategy 1: Match by hex (ICAO 24-bit address)
  // This is the most reliable match since hex is unique per aircraft
  for (const [, group] of messageGroups) {
    if (group.identifiers.includes(adsbKeys.hex)) {
      return { group, strategy: "hex" };
    }
  }

  // Strategy 2: Match by ICAO callsign (flight number)
  // Less reliable than hex but still good for active flights
  if (adsbKeys.flight) {
    for (const [, group] of messageGroups) {
      if (group.identifiers.includes(adsbKeys.flight)) {
        return { group, strategy: "flight" };
      }
    }
  }

  // Strategy 3: Match by tail/registration
  // Useful when hex or callsign don't match (different ACARS format)
  if (adsbKeys.tail) {
    for (const [, group] of messageGroups) {
      if (group.identifiers.includes(adsbKeys.tail)) {
        return { group, strategy: "tail" };
      }
    }
  }

  // No match found
  return { strategy: "none" };
}

/**
 * Pair ADS-B aircraft with ACARS message groups
 * Returns enriched aircraft data with ACARS information
 *
 * Matching priority:
 * 1. ICAO hex (most reliable)
 * 2. ICAO callsign/flight number
 * 3. Tail/registration
 */
export function pairADSBWithACARSMessages(
  adsbAircraft: ADSBAircraft[],
  messageGroups: Map<string, MessageGroup>,
): PairedAircraft[] {
  return adsbAircraft.map((aircraft) => {
    // Extract all possible match keys from ADS-B data
    const adsbKeys = extractADSBMatchKeys(aircraft);

    // Try to find matching ACARS message group
    const { group, strategy } = findMessageGroup(adsbKeys, messageGroups);

    // Build paired aircraft object
    const paired: PairedAircraft = {
      hex: aircraft.hex,
      flight: adsbKeys.flight,
      tail: adsbKeys.tail,
      lat: aircraft.lat,
      lon: aircraft.lon,
      alt_baro: aircraft.alt_baro,
      gs: aircraft.gs,
      track: aircraft.track,
      category: aircraft.category,
      type: aircraft.t || aircraft.type, // 't' field contains aircraft type
      hasMessages: group !== undefined && group.messages.length > 0,
      hasAlerts: group?.has_alerts || false,
      messageCount: group?.messages.length || 0,
      alertCount: group?.num_alerts || 0,
      matchedGroup: group,
      matchStrategy: strategy,
    };

    return paired;
  });
}

/**
 * Get display callsign for aircraft
 * Priority: ICAO callsign > tail > hex
 */
export function getDisplayCallsign(aircraft: PairedAircraft): string {
  if (aircraft.flight) {
    return aircraft.flight;
  }
  if (aircraft.tail) {
    return aircraft.tail;
  }
  return aircraft.hex.toUpperCase();
}

/**
 * Get locale-aware spelling for meters/metres
 * US and few others use "meters", most of world uses "metres"
 */
function getMetersSpelling(locale?: string): string {
  const detectedLocale = locale || navigator.language || "en-US";
  // US, Liberia, Myanmar use "meters"
  const usesMeters =
    detectedLocale.startsWith("en-US") ||
    detectedLocale.startsWith("en-LR") ||
    detectedLocale.startsWith("my");
  return usesMeters ? "meters" : "metres";
}

/**
 * Format altitude for display
 * Supports feet/meters with locale-aware spelling
 */
export function formatAltitude(
  altBaro?: number,
  unit: AltitudeUnit = "feet",
  locale?: string,
): string {
  if (altBaro === undefined || altBaro === null) {
    return "N/A";
  }

  if (altBaro === 0) {
    return "Ground";
  }

  if (unit === "meters") {
    // Convert feet to meters (1 ft = 0.3048 m)
    const meters = Math.round(altBaro * 0.3048);
    const spelling = getMetersSpelling(locale);
    return `${meters.toLocaleString()} ${spelling}`;
  }

  // Default: feet
  return `${altBaro.toLocaleString()} ft`;
}

/**
 * Format ground speed for display
 * Returns speed in knots
 */
export function formatGroundSpeed(gs?: number): string {
  if (gs === undefined || gs === null) {
    return "N/A";
  }
  return `${Math.round(gs)} kts`;
}

/**
 * Format heading/track for display
 * Returns heading in degrees
 */
export function formatHeading(track?: number): string {
  if (track === undefined || track === null) {
    return "N/A";
  }
  return `${Math.round(track)}°`;
}

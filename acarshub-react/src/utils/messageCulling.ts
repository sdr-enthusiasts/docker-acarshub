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

import type { ADSBData, MessageGroup } from "../types";
import { storeLogger } from "./logger";

/**
 * Check if a message group is paired with an active ADS-B aircraft
 *
 * Matching strategies (in priority order):
 * 1. Hex (ICAO 24-bit address) - most reliable
 * 2. ICAO callsign (flight number)
 * 3. Tail/registration
 *
 * @param group - Message group to check
 * @param adsbData - Current ADS-B aircraft data (null if ADS-B disabled)
 * @returns true if group is paired with an active ADS-B aircraft
 */
export function isGroupPairedWithADSB(
  group: MessageGroup,
  adsbData: ADSBData | null,
): boolean {
  // If ADS-B is disabled or no data available, no pairing possible
  if (!adsbData || !adsbData.aircraft || adsbData.aircraft.length === 0) {
    return false;
  }

  // Check if any of the group's identifiers match an active ADS-B aircraft
  for (const aircraft of adsbData.aircraft) {
    // Strategy 1: Match by hex (ICAO 24-bit address)
    const aircraftHex = aircraft.hex.toUpperCase().trim();
    if (group.identifiers.includes(aircraftHex)) {
      storeLogger.trace(
        "Message group paired with ADS-B aircraft (hex match)",
        {
          groupId: group.identifiers[0],
          aircraftHex,
        },
      );
      return true;
    }

    // Strategy 2: Match by ICAO callsign (flight number)
    if (aircraft.flight) {
      const aircraftFlight = aircraft.flight.trim().toUpperCase();
      if (
        aircraftFlight.length > 0 &&
        group.identifiers.includes(aircraftFlight)
      ) {
        storeLogger.trace(
          "Message group paired with ADS-B aircraft (flight match)",
          {
            groupId: group.identifiers[0],
            aircraftFlight,
          },
        );
        return true;
      }
    }

    // Strategy 3: Match by tail/registration
    if (aircraft.r) {
      const aircraftTail = aircraft.r.trim().toUpperCase();
      if (aircraftTail.length > 0 && group.identifiers.includes(aircraftTail)) {
        storeLogger.trace(
          "Message group paired with ADS-B aircraft (tail match)",
          {
            groupId: group.identifiers[0],
            aircraftTail,
          },
        );
        return true;
      }
    }
  }

  return false;
}

/**
 * Cull old message groups to stay within memory limits
 *
 * Strategy:
 * 1. Separate groups into ADS-B-paired and not-paired
 * 2. NEVER cull ADS-B-paired groups (active aircraft)
 * 3. Only cull from not-paired groups (inactive aircraft)
 * 4. Sort not-paired groups by lastUpdated (oldest first)
 * 5. Remove oldest not-paired groups until we're at the limit
 *
 * @param messageGroups - Current message groups
 * @param maxGroups - Maximum number of groups to keep
 * @param adsbData - Current ADS-B aircraft data (null if ADS-B disabled)
 * @returns Culled message groups map
 */
export function cullMessageGroups(
  messageGroups: Map<string, MessageGroup>,
  maxGroups: number,
  adsbData: ADSBData | null,
): Map<string, MessageGroup> {
  // If we're under the limit, no culling needed
  if (messageGroups.size <= maxGroups) {
    return messageGroups;
  }

  storeLogger.debug("Starting message group culling", {
    currentGroups: messageGroups.size,
    maxGroups,
    adsbEnabled: !!adsbData,
    adsbAircraftCount: adsbData?.aircraft?.length || 0,
  });

  // Separate groups into ADS-B-paired and not-paired
  const pairedGroups: [string, MessageGroup][] = [];
  const notPairedGroups: [string, MessageGroup][] = [];

  for (const [key, group] of messageGroups) {
    if (isGroupPairedWithADSB(group, adsbData)) {
      pairedGroups.push([key, group]);
    } else {
      notPairedGroups.push([key, group]);
    }
  }

  storeLogger.debug("Categorized message groups for culling", {
    pairedCount: pairedGroups.length,
    notPairedCount: notPairedGroups.length,
  });

  // If all paired groups fit within limit, keep all paired + some not-paired
  if (pairedGroups.length <= maxGroups) {
    // Sort not-paired groups by lastUpdated (oldest first)
    notPairedGroups.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);

    // Determine how many not-paired groups we can keep
    const notPairedToKeepCount = maxGroups - pairedGroups.length;

    // Keep newest not-paired groups (handle slice(-0) edge case)
    const notPairedToKeep =
      notPairedToKeepCount > 0
        ? notPairedGroups.slice(-notPairedToKeepCount)
        : [];

    // Build new map with paired + kept not-paired
    const culledMap = new Map<string, MessageGroup>();
    for (const [key, group] of pairedGroups) {
      culledMap.set(key, group);
    }
    for (const [key, group] of notPairedToKeep) {
      culledMap.set(key, group);
    }

    const removedCount = notPairedGroups.length - notPairedToKeep.length;
    if (removedCount > 0) {
      storeLogger.info("Culled message groups (kept all ADS-B-paired)", {
        removedCount,
        keptPaired: pairedGroups.length,
        keptNotPaired: notPairedToKeep.length,
        totalKept: culledMap.size,
      });
    }

    return culledMap;
  }

  // All message groups are ADSB paired. This is valid.

  return messageGroups;
}

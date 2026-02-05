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
 * 1. Sort all groups by lastUpdated (oldest first)
 * 2. Keep all groups within maxGroups limit (newest groups)
 * 3. Only consider groups beyond maxGroups for culling
 * 4. NEVER cull ADS-B-paired groups (active aircraft)
 * 5. Cull only non-paired groups from the overflow set
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

  // Sort all message groups by lastUpdated (oldest first)
  const sortedGroups = Array.from(messageGroups.entries()).sort(
    (a, b) => a[1].lastUpdated - b[1].lastUpdated,
  );

  // Split into groups to keep (newest) and candidates for culling (oldest)
  const groupsToKeep = sortedGroups.slice(-maxGroups); // Keep newest maxGroups
  const candidatesForCulling = sortedGroups.slice(0, -maxGroups); // Oldest groups

  storeLogger.debug("Split groups for culling", {
    toKeep: groupsToKeep.length,
    candidates: candidatesForCulling.length,
  });

  // Build result map starting with all groups we're keeping
  const culledMap = new Map<string, MessageGroup>();
  for (const [key, group] of groupsToKeep) {
    culledMap.set(key, group);
  }

  // From candidates, also keep any that are ADS-B-paired (never cull active aircraft)
  let rescuedCount = 0;
  for (const [key, group] of candidatesForCulling) {
    if (isGroupPairedWithADSB(group, adsbData)) {
      culledMap.set(key, group);
      rescuedCount++;
      storeLogger.trace("Rescued ADS-B-paired group from culling", {
        groupId: group.identifiers[0],
      });
    }
  }

  const removedCount = candidatesForCulling.length - rescuedCount;
  if (removedCount > 0) {
    storeLogger.info("Culled message groups", {
      removedCount,
      rescuedPaired: rescuedCount,
      totalKept: culledMap.size,
    });
  }

  return culledMap;
}

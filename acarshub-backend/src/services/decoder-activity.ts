// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Effective decoder-type enablement.
 *
 * A decoder type is enabled when its ENABLE_* config flag is set, OR when it
 * has been activated at runtime because an xng envelope of that carrier type
 * arrived.  Runtime activation lasts until process restart.  Every runtime
 * display / stats gate reads `isDecoderEnabled()` so a user running only
 * ENABLE_XNG still sees the carrier types xng is feeding.
 */

import type { Decoders } from "@acarshub/types";
import { getConfig } from "../config.js";
import { getHeyWhatsThatUrl } from "./heywhatsthat.js";
import type { MessageType } from "./listener-types.js";

/**
 * Types known to be effectively enabled.  Holds runtime-activated types and,
 * as a fast path for markDecoderActive(), config-enabled types already seen.
 */
const knownEnabled = new Set<MessageType>();

function isConfigEnabled(type: MessageType): boolean {
  const config = getConfig();
  switch (type) {
    case "ACARS":
      return config.enableAcars;
    case "VDLM2":
      return config.enableVdlm;
    case "HFDL":
      return config.enableHfdl;
    case "IMSL":
      return config.enableImsl;
    case "IRDM":
      return config.enableIrdm;
  }
}

/**
 * Effective enabled state: config flag OR runtime-activated.
 */
export function isDecoderEnabled(type: MessageType): boolean {
  return knownEnabled.has(type) || isConfigEnabled(type);
}

/**
 * Record that a message of `type` was received.
 *
 * Returns true only when the type was not already effectively enabled —
 * i.e. this call made it newly visible and callers should refresh clients.
 */
export function markDecoderActive(type: MessageType): boolean {
  if (knownEnabled.has(type)) {
    return false;
  }
  const wasConfigEnabled = isConfigEnabled(type);
  knownEnabled.add(type);
  return !wasConfigEnabled;
}

/**
 * Clear all runtime activation state.  Test-only.
 */
export function resetDecoderActivity(): void {
  knownEnabled.clear();
}

/**
 * Build the `features_enabled` payload sent to clients on connect and
 * re-broadcast when a decoder type is activated at runtime.
 */
export function buildDecoderFeatures(): Decoders {
  const config = getConfig();
  return {
    acars: isDecoderEnabled("ACARS"),
    vdlm: isDecoderEnabled("VDLM2"),
    hfdl: isDecoderEnabled("HFDL"),
    imsl: isDecoderEnabled("IMSL"),
    irdm: isDecoderEnabled("IRDM"),
    allow_remote_updates: config.allowRemoteUpdates,
    adsb: {
      enabled: config.enableAdsb,
      lat: config.adsbLat,
      lon: config.adsbLon,
      range_rings: config.enableRangeRings,
      heywhatsthat_url: getHeyWhatsThatUrl(),
    },
  };
}

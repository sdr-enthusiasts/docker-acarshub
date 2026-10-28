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

/**
 * xng envelope ingest helpers.
 *
 * xng emits one JSON envelope per decoded message regardless of the air
 * interface it came from.  The hub listens for these on a dedicated `XNG`
 * listener, then re-labels each envelope to the existing `MessageType` of its
 * carrier (by envelope `mode`) BEFORE it enters the message queue.  That keeps
 * every downstream consumer (stats, DB, socket emission) unaware that xng
 * exists — an xng VDL2 message is just a VDLM2 message.
 */

import type { ListenerType, MessageType } from "../services/listener-types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("formatters:xng");

export interface XngSignal {
  rssi_db?: number;
  snr_db?: number;
  noise_db?: number;
  freq_skew_hz?: number;
}

export interface XngDecode {
  crc_ok: boolean;
  fec_corrected?: number;
  errors?: number;
}

export interface XngBody {
  type: string;
  [key: string]: unknown;
}

export interface XngSource {
  station: { id: string; ident: string };
  app: { name: string; version: string };
  sdr?: unknown;
  channel?: unknown;
}

export interface XngEnvelope {
  mode: string;
  /** RFC3339 timestamp */
  timestamp: string;
  frequency_hz: number;
  signal: XngSignal;
  decode: XngDecode;
  body: XngBody;
  raw?: string;
  source: XngSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural guard for an xng envelope.  Checks only the fields routing
 * depends on; per-body validation belongs to the formatter.
 */
export function isXngEnvelope(data: unknown): data is XngEnvelope {
  if (!isRecord(data)) {
    return false;
  }
  if (
    typeof data.frequency_hz !== "number" ||
    typeof data.mode !== "string" ||
    typeof data.timestamp !== "string"
  ) {
    return false;
  }
  if (!isRecord(data.body) || typeof data.body.type !== "string") {
    return false;
  }
  if (!isRecord(data.source) || !isRecord(data.source.app)) {
    return false;
  }
  return data.source.app.name === "xng";
}

/**
 * Map an xng envelope `mode` to the hub `MessageType` it is stored and
 * counted as.  Returns `null` for modes the hub does not handle (e.g. AIS,
 * ADS-B), which are dropped at ingest.
 */
export function xngCarrierType(mode: string): MessageType | null {
  switch (mode) {
    case "acars_poa":
      return "ACARS";
    case "vdl2":
      return "VDLM2";
    case "hfdl":
      return "HFDL";
    case "aero_l":
    case "aero_c":
      return "IMSL";
    case "iridium":
      return "IRDM";
    default:
      return null;
  }
}

/**
 * Route a listener message into the message queue.
 *
 * Non-XNG listener types pass through unchanged.  XNG payloads are validated
 * and re-labelled to their carrier type; invalid envelopes and unhandled
 * modes are dropped.
 */
export function routeListenerMessage(
  type: ListenerType,
  data: unknown,
  push: (type: MessageType, data: unknown) => void,
): void {
  if (type !== "XNG") {
    push(type, data);
    return;
  }

  if (!isXngEnvelope(data)) {
    logger.debug("Dropping XNG payload that is not a valid xng envelope");
    return;
  }

  const carrier = xngCarrierType(data.mode);
  if (carrier === null) {
    logger.trace("xng mode not handled", { mode: data.mode });
    return;
  }

  push(carrier, data);
}

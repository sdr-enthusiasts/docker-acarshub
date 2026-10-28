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

export type AvlcAddressKind =
  "aircraft" | "ground_icao" | "ground_delegated" | "all_stations" | "reserved";

export interface AvlcAddress {
  /** 24-bit specific address, 6 uppercase hex digits. */
  addr: string;
  kind: AvlcAddressKind;
}

export interface AvlcAddresses {
  dst: AvlcAddress;
  src: AvlcAddress;
}

// (octet index, first address bit, bit count) per ETSI EN 301 841-2 §5.2.
const AVLC_ADDRESS_GROUPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 22, 6],
  [1, 15, 7],
  [2, 8, 7],
  [3, 1, 7],
];

function avlcAddressKind(typeBits: number): AvlcAddressKind {
  switch (typeBits) {
    case 0b001:
      return "aircraft";
    case 0b100:
      return "ground_icao";
    case 0b101:
      return "ground_delegated";
    case 0b111:
      return "all_stations";
    default:
      return "reserved";
  }
}

/** Port of xng-mode-vdl2 `avlc::parse_address` (4 address octets). */
function parseAvlcAddress(octets: readonly number[]): AvlcAddress {
  // da[1..27]; bit (8-k) of an octet carries da(base+k).
  const da = new Array<number>(28).fill(0);
  for (const [oct, base, count] of AVLC_ADDRESS_GROUPS) {
    const b = octets[oct] ?? 0;
    for (let k = 0; k < count; k++) {
      da[base + k] = (b >> (7 - k)) & 1;
    }
  }
  const typeBits = ((da[27] ?? 0) << 2) | ((da[26] ?? 0) << 1) | (da[25] ?? 0);
  let addr = 0;
  for (let k = 24; k >= 1; k--) {
    addr = addr * 2 + (da[k] ?? 0);
  }
  return {
    addr: addr.toString(16).toUpperCase().padStart(6, "0"),
    kind: avlcAddressKind(typeBits),
  };
}

/**
 * Decode the AVLC destination (octets 0-3) and source (octets 4-7)
 * addresses from an xng VDL2 `raw` hex frame.  Returns `null` when the
 * input is not valid hex or is shorter than 8 octets.
 */
export function decodeAvlcAddresses(rawHex: string): AvlcAddresses | null {
  if (
    rawHex.length < 16 ||
    rawHex.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(rawHex)
  ) {
    return null;
  }
  const octets: number[] = [];
  for (let i = 0; i < 16; i += 2) {
    octets.push(Number.parseInt(rawHex.slice(i, i + 2), 16));
  }
  return {
    dst: parseAvlcAddress(octets.slice(0, 4)),
    src: parseAvlcAddress(octets.slice(4, 8)),
  };
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

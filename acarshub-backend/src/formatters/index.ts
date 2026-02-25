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
 * Message Formatters Module
 *
 * Ports Python acars_formatter.py to TypeScript
 * Formats raw decoder JSON into normalized message structure
 * Supports 5 decoder types:
 * - ACARS (raw acarsdec)
 * - VDLM2 (dumpvdl2)
 * - HFDL (dumphfdl)
 * - IMSL (JAERO + SatDump)
 * - IRDM (iridium-toolkit)
 */

// Logger not yet needed - will be used for debug logging in future
// import { createLogger } from "../utils/logger.js";
// const logger = createLogger("formatters");

/**
 * Formatted message structure
 * Matches database schema fields
 */
export interface FormattedMessage {
  timestamp: number;
  station_id?: string;
  toaddr?: number;
  fromaddr?: number;
  depa?: string;
  dsta?: string;
  eta?: string;
  gtout?: string;
  gtin?: string;
  wloff?: string;
  wlin?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  text?: string;
  tail?: string;
  flight?: string;
  icao?: string;
  freq?: string | number;
  ack?: string;
  mode?: string;
  label?: string;
  block_id?: string;
  msgno?: string;
  is_response?: number;
  is_onground?: number;
  error?: number;
  libacars?: string;
  level?: string | number;
  end?: boolean;
  fromaddr_decoded?: string;
  toaddr_decoded?: string;
  [key: string]: unknown;
}

/**
 * Main message router
 * Determines decoder type and routes to appropriate formatter
 *
 * @param message - Raw decoder JSON
 * @returns Formatted message or null if unrecognized
 */
export function formatAcarsMessage(
  message: Record<string, unknown>,
): FormattedMessage | null {
  // VDLM2 (dumpvdl2)
  if ("vdl2" in message) {
    return formatVdlm2Message(message);
  }

  // HFDL (dumphfdl)
  if ("hfdl" in message) {
    return formatHfdlMessage(message);
  }

  // IMSL - SatDump
  if (
    typeof message.source === "object" &&
    message.source !== null &&
    "app" in message.source &&
    typeof message.source.app === "object" &&
    message.source.app !== null &&
    "name" in message.source.app &&
    message.source.app.name === "SatDump"
  ) {
    if (message.msg_name === "ACARS") {
      return formatSatdumpImslMessage(message);
    }
    return null;
  }

  // IMSL - JAERO
  if (
    typeof message.app === "object" &&
    message.app !== null &&
    "name" in message.app &&
    message.app.name === "JAERO"
  ) {
    return formatJaeroImslMessage(message);
  }

  // IRDM (iridium-toolkit)
  if (
    typeof message.app === "object" &&
    message.app !== null &&
    "name" in message.app &&
    message.app.name === "iridium-toolkit"
  ) {
    return formatIrdmMessage(message);
  }

  // Raw ACARS message - normalize ICAO to hex string
  if (
    "icao" in message &&
    message.icao !== null &&
    message.icao !== undefined
  ) {
    const normalized = { ...message };

    if (typeof normalized.icao === "number") {
      // Convert numeric ICAO to 6-character hex string
      normalized.icao = normalized.icao
        .toString(16)
        .toUpperCase()
        .padStart(6, "0");
    } else if (typeof normalized.icao === "string") {
      // Ensure hex string is uppercase and properly formatted
      const icaoStr = normalized.icao;

      // Check if it's a hex string (6 chars, all hex digits)
      const isHexFormat = /^[0-9A-Fa-f]{6}$/.test(icaoStr);

      if (isHexFormat) {
        // Already in hex format - just uppercase it
        normalized.icao = icaoStr.toUpperCase();
      } else {
        // It's a decimal string - convert to hex
        try {
          const icaoInt = Number.parseInt(icaoStr, 10);
          normalized.icao = icaoInt.toString(16).toUpperCase().padStart(6, "0");
        } catch {
          // Can't convert - leave as-is but uppercase
          normalized.icao = icaoStr.toUpperCase();
        }
      }
    }

    return normalized as FormattedMessage;
  }

  return message as FormattedMessage;
}

/**
 * Count total errors in message tree
 * Recursively walks object looking for err: true fields
 *
 * @param message - Message object to scan
 * @returns Total error count
 */
export function countErrors(message: Record<string, unknown>): number {
  let totalErrors = 0;

  for (const [key, value] of Object.entries(message)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      totalErrors += countErrors(value as Record<string, unknown>);
    } else if (key === "err" && value === true) {
      totalErrors += 1;
    }
  }

  return totalErrors;
}

/**
 * IRDM: Channelize frequency
 * Snaps frequency to nearest Iridium channel
 *
 * @param freq - Frequency in Hz
 * @returns Channelized frequency in Hz
 */
function irdmChannelizeFreq(freq: number): number {
  const base = 1616e6;
  const chwid = 10e6 / (30 * 8);
  const offs = freq - base;
  return base + chwid * Math.round(offs / chwid);
}

/**
 * Format IRDM message (iridium-toolkit)
 *
 * @param message - Raw IRDM message
 * @returns Formatted message
 */
export function formatIrdmMessage(
  message: Record<string, unknown>,
): FormattedMessage {
  const formatted: FormattedMessage = {} as FormattedMessage;

  // Frequency
  if (typeof message.freq === "number") {
    const channelizedFreq = irdmChannelizeFreq(message.freq);
    formatted.freq = (channelizedFreq / 1e6).toFixed(6);
  }

  // Signal level
  if (typeof message.level === "number") {
    formatted.level = message.level.toFixed(1);
  }

  // Station ID
  if (
    typeof message.source === "object" &&
    message.source !== null &&
    "station_id" in message.source &&
    typeof message.source.station_id === "string"
  ) {
    formatted.station_id = message.source.station_id;
  }

  // ACARS data
  if (
    typeof message.acars === "object" &&
    message.acars !== null &&
    !Array.isArray(message.acars)
  ) {
    const acars = message.acars as Record<string, unknown>;

    // Timestamp (ISO string → Unix timestamp)
    if (typeof acars.timestamp === "string") {
      try {
        formatted.timestamp = new Date(acars.timestamp).getTime() / 1000;
      } catch {
        formatted.timestamp = Date.now() / 1000;
      }
    }

    // Errors
    if (typeof acars.errors === "number") {
      formatted.error = acars.errors;
    }

    // Block end
    if (typeof acars.block_end === "boolean") {
      formatted.end = acars.block_end;
    }

    // Mode
    if (typeof acars.mode === "string") {
      formatted.mode = acars.mode;
    }

    // Tail
    if (typeof acars.tail === "string") {
      formatted.tail = acars.tail;
    }

    // Flight
    if (typeof acars.flight === "string") {
      formatted.flight = acars.flight;
    }

    // Label
    if (typeof acars.label === "string") {
      formatted.label = acars.label;
    }

    // Block ID
    if (typeof acars.block_id === "string") {
      formatted.block_id = acars.block_id;
    }

    // Message number
    if (typeof acars.message_number === "string") {
      formatted.msgno = acars.message_number;
    }

    // Ack
    if (typeof acars.ack === "string") {
      formatted.ack = acars.ack;
    }

    // Text
    if (typeof acars.text === "string") {
      formatted.text = acars.text;
    }
  }

  // Ensure timestamp is set
  if (!formatted.timestamp) {
    formatted.timestamp = Date.now() / 1000;
  }

  return formatted;
}

/**
 * Format JAERO IMSL message
 *
 * @param message - Raw JAERO message
 * @returns Formatted message
 */
export function formatJaeroImslMessage(
  message: Record<string, unknown>,
): FormattedMessage {
  const formatted: FormattedMessage = {} as FormattedMessage;

  // Error count
  formatted.error = countErrors(message);

  // Timestamp
  if (
    typeof message.t === "object" &&
    message.t !== null &&
    "sec" in message.t &&
    typeof message.t.sec === "number"
  ) {
    formatted.timestamp = message.t.sec;
  }

  // Station ID
  if (typeof message.station === "string") {
    formatted.station_id = message.station;
  }

  // ISU data
  if (
    typeof message.isu === "object" &&
    message.isu !== null &&
    !Array.isArray(message.isu)
  ) {
    const isu = message.isu as Record<string, unknown>;

    // ACARS data
    if (
      typeof isu.acars === "object" &&
      isu.acars !== null &&
      !Array.isArray(isu.acars)
    ) {
      const acars = isu.acars as Record<string, unknown>;

      // Message text
      if (typeof acars.msg_text === "string") {
        formatted.text = acars.msg_text;
      }

      // ARINC622 (libacars)
      if (typeof acars.arinc622 === "object" && acars.arinc622 !== null) {
        formatted.libacars = JSON.stringify(acars.arinc622);

        const arinc622 = acars.arinc622 as Record<string, unknown>;
        if (typeof arinc622.gs_addr === "string") {
          formatted.fromaddr_decoded = arinc622.gs_addr;
        }
      }

      // Ack
      if (typeof acars.ack === "string") {
        formatted.ack = acars.ack;
      }

      // Block ID
      if (typeof acars.blk_id === "string") {
        formatted.block_id = acars.blk_id;
      }

      // Label
      if (typeof acars.label === "string") {
        formatted.label = acars.label;
      }

      // Mode
      if (typeof acars.mode === "string") {
        formatted.mode = acars.mode;
      }

      // Tail
      if (typeof acars.reg === "string") {
        formatted.tail = acars.reg;
      }
    }

    // Destination address
    if (
      typeof isu.dst === "object" &&
      isu.dst !== null &&
      "addr" in isu.dst &&
      typeof isu.dst.addr === "string"
    ) {
      formatted.toaddr = Number.parseInt(isu.dst.addr, 16);
      formatted.icao = isu.dst.addr.toUpperCase();
    }

    // Source address
    if (
      typeof isu.src === "object" &&
      isu.src !== null &&
      "addr" in isu.src &&
      typeof isu.src.addr === "string"
    ) {
      formatted.fromaddr = Number.parseInt(isu.src.addr, 16);
    }

    // Reference number
    if (typeof isu.refno === "number") {
      formatted.msgno = String(isu.refno);
    }
  }

  // Ensure timestamp is set
  if (!formatted.timestamp) {
    formatted.timestamp = Date.now() / 1000;
  }

  return formatted;
}

/**
 * Format SatDump IMSL message
 *
 * @param message - Raw SatDump message
 * @returns Formatted message
 */
export function formatSatdumpImslMessage(
  message: Record<string, unknown>,
): FormattedMessage {
  const formatted: FormattedMessage = {} as FormattedMessage;

  // Timestamp
  if (typeof message.timestamp === "number") {
    formatted.timestamp = message.timestamp;
  }

  // Station ID
  if (
    typeof message.source === "object" &&
    message.source !== null &&
    "station_id" in message.source &&
    typeof message.source.station_id === "string"
  ) {
    formatted.station_id = message.source.station_id;
  }

  // Frequency
  if (typeof message.freq === "number" || typeof message.freq === "string") {
    formatted.freq = message.freq;
  }

  // Signal level
  if (typeof message.level === "number" || typeof message.level === "string") {
    formatted.level = message.level;
  }

  // Error count
  formatted.error = countErrors(message);

  // Mode
  if (typeof message.mode === "string") {
    formatted.mode = message.mode;
  }

  // Label (replace \x7f with 'd')
  if (typeof message.label === "string") {
    formatted.label = message.label.replace(/\x7f/g, "d");
  }

  // Block ID
  if (typeof message.bi === "string") {
    formatted.block_id = message.bi;
  }

  // Message text
  if (typeof message.message === "string") {
    formatted.text = message.message;
  }

  // More to come (inverted to end flag)
  if (typeof message.more_to_come === "boolean") {
    formatted.end = !message.more_to_come;
  }

  // Tail (remove dots)
  if (typeof message.plane_reg === "string") {
    formatted.tail = message.plane_reg.replace(/\./g, "");
  }

  // Ack (replace \x15 with '!')
  if (typeof message.tak === "number") {
    const ackChar = String.fromCharCode(message.tak);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control character is intentional for ACARS protocol
    formatted.ack = ackChar.replace(/\x15/g, "!");
  }

  // Libacars
  if (typeof message.libacars === "object" && message.libacars !== null) {
    formatted.libacars = JSON.stringify(message.libacars);
  }

  // Flight
  if (typeof message.flight === "string") {
    formatted.flight = message.flight;
  }

  // From address decoded
  if (typeof message.fromaddr_decoded === "string") {
    formatted.fromaddr_decoded = message.fromaddr_decoded;
  }

  // Signal unit
  if (
    typeof message.signal_unit === "object" &&
    message.signal_unit !== null &&
    !Array.isArray(message.signal_unit)
  ) {
    const sigunit = message.signal_unit as Record<string, unknown>;

    // AES ID (toaddr/icao)
    if (typeof sigunit.aes_id === "string") {
      formatted.toaddr = Number.parseInt(sigunit.aes_id, 16);
      formatted.icao = sigunit.aes_id;
    }

    // GES ID (fromaddr)
    if (typeof sigunit.ges_id === "number") {
      formatted.fromaddr = sigunit.ges_id;
    }

    // Reference number
    if (typeof sigunit.ref_no === "number") {
      formatted.msgno = String(sigunit.ref_no);
    }
  }

  // Ensure timestamp is set
  if (!formatted.timestamp) {
    formatted.timestamp = Date.now() / 1000;
  }

  return formatted;
}

/**
 * Format HFDL frequency
 * Converts Hz to MHz with normalized precision
 *
 * @param freq - Frequency in Hz
 * @returns Frequency in MHz as string
 */
function formatHfdlFreq(freq: number): string {
  const output = freq / 1_000_000;
  const truncated = Math.trunc(output * 1000) / 1000;
  let result = String(truncated);

  // Remove trailing .0
  if (result.endsWith(".0")) {
    result = result.slice(0, -2);
  }

  return result;
}

/**
 * Format HFDL message (dumphfdl)
 *
 * @param message - Raw HFDL message
 * @returns Formatted message
 */
export function formatHfdlMessage(
  message: Record<string, unknown>,
): FormattedMessage {
  const formatted: FormattedMessage = {} as FormattedMessage;
  const libacars: Record<string, unknown> = {};

  // Must have hfdl field
  if (
    typeof message.hfdl !== "object" ||
    message.hfdl === null ||
    Array.isArray(message.hfdl)
  ) {
    formatted.timestamp = Date.now() / 1000;
    return formatted;
  }

  const hfdl = message.hfdl as Record<string, unknown>;

  // Timestamp
  if (
    typeof hfdl.t === "object" &&
    hfdl.t !== null &&
    "sec" in hfdl.t &&
    typeof hfdl.t.sec === "number"
  ) {
    formatted.timestamp = hfdl.t.sec;
  }

  // Station ID
  if (typeof hfdl.station === "string") {
    formatted.station_id = hfdl.station;
  }

  // Error count
  formatted.error = countErrors(hfdl);

  // Frequency
  if (typeof hfdl.freq === "number") {
    formatted.freq = formatHfdlFreq(hfdl.freq);
  }

  // Signal level
  if (typeof hfdl.sig_level === "number") {
    formatted.level = formatDumpvdl2Level(hfdl.sig_level);
  }

  // SPDU (store in libacars)
  if (typeof hfdl.spdu === "object" && hfdl.spdu !== null) {
    libacars.spdu = hfdl.spdu;
  }

  // LPDU
  if (
    typeof hfdl.lpdu === "object" &&
    hfdl.lpdu !== null &&
    !Array.isArray(hfdl.lpdu)
  ) {
    const lpdu = hfdl.lpdu as Record<string, unknown>;

    // Destination address
    if (
      typeof lpdu.dst === "object" &&
      lpdu.dst !== null &&
      "addr" in lpdu.dst &&
      typeof lpdu.dst.addr === "string"
    ) {
      formatted.toaddr = Number.parseInt(lpdu.dst.addr, 16);
    }

    // Source address
    if (
      typeof lpdu.src === "object" &&
      lpdu.src !== null &&
      "addr" in lpdu.src &&
      typeof lpdu.src.addr === "string"
    ) {
      formatted.fromaddr = Number.parseInt(lpdu.src.addr, 16);
    }

    // ICAO
    if (
      typeof lpdu.ac_info === "object" &&
      lpdu.ac_info !== null &&
      "icao" in lpdu.ac_info &&
      typeof lpdu.ac_info.icao === "string"
    ) {
      formatted.icao = lpdu.ac_info.icao.toUpperCase();
    }

    // HFNPDU
    if (
      typeof lpdu.hfnpdu === "object" &&
      lpdu.hfnpdu !== null &&
      !Array.isArray(lpdu.hfnpdu)
    ) {
      const hfnpdu = lpdu.hfnpdu as Record<string, unknown>;

      // Flight ID
      if (typeof hfnpdu.flight_id === "string") {
        formatted.flight = hfnpdu.flight_id;
      }

      // Position
      if (
        typeof hfnpdu.pos === "object" &&
        hfnpdu.pos !== null &&
        !Array.isArray(hfnpdu.pos)
      ) {
        const pos = hfnpdu.pos as Record<string, unknown>;
        if (typeof pos.lat === "number") {
          formatted.lat = pos.lat;
        }
        if (typeof pos.lon === "number") {
          formatted.lon = pos.lon;
        }
      }

      // Frequency data (store in libacars)
      if (typeof hfnpdu.freq_data === "object" && hfnpdu.freq_data !== null) {
        libacars.freq_data = hfnpdu.freq_data;
      }

      // ACARS
      if (
        typeof hfnpdu.acars === "object" &&
        hfnpdu.acars !== null &&
        !Array.isArray(hfnpdu.acars)
      ) {
        const acars = hfnpdu.acars as Record<string, unknown>;

        // Ack
        if (typeof acars.ack === "string") {
          formatted.ack = acars.ack;
        }

        // Tail (remove dots)
        if (typeof acars.reg === "string") {
          formatted.tail = acars.reg.replace(/\./g, "");
        }

        // Label
        if (typeof acars.label === "string") {
          formatted.label = String(acars.label);
        }

        // Block ID
        if (typeof acars.blk_id === "string") {
          formatted.block_id = acars.blk_id;
        }

        // Message number (with optional sequence)
        if (typeof acars.msg_num === "string") {
          formatted.msgno = acars.msg_num;
          if (typeof acars.msg_num_seq === "string") {
            formatted.msgno = formatted.msgno + acars.msg_num_seq;
          }
        }

        // Mode
        if (typeof acars.mode === "string") {
          formatted.mode = acars.mode;
        }

        // Message text
        if (typeof acars.msg_text === "string") {
          formatted.text = acars.msg_text;
        }

        // ARINC622 (store in libacars)
        if (typeof acars.arinc622 === "object" && acars.arinc622 !== null) {
          libacars.arinc622 = acars.arinc622;
        }
      }
    }
  }

  // Store libacars if any data collected
  if (Object.keys(libacars).length > 0) {
    formatted.libacars = JSON.stringify(libacars);
  }

  // Ensure timestamp is set
  if (!formatted.timestamp) {
    formatted.timestamp = Date.now() / 1000;
  }

  return formatted;
}

/**
 * Format dumpvdl2 signal level
 * Truncates to 1 decimal place
 *
 * @param level - Raw signal level
 * @returns Formatted level
 */
function formatDumpvdl2Level(level: number): number {
  const truncated = Math.trunc(10 * level) / 10;
  return truncated;
}

/**
 * Reformat dumpvdl2 frequency
 * Converts integer to MHz with proper decimals
 *
 * @param freq - Frequency as integer (e.g., 136975)
 * @returns Frequency in MHz (e.g., 136.975)
 */
function reformatDumpvdl2Freq(freq: number): number {
  const freqStr = String(freq);
  let formatted = `${freqStr.slice(0, 3)}.${freqStr.slice(3).replace(/0+$/, "")}`;

  // Ensure at least one digit after decimal
  if (formatted.length === 4) {
    formatted = `${formatted}0`;
  }

  return Number.parseFloat(formatted);
}

/**
 * Format VDLM2 message (dumpvdl2)
 *
 * @param message - Raw VDLM2 message
 * @returns Formatted message
 */
export function formatVdlm2Message(
  message: Record<string, unknown>,
): FormattedMessage {
  const formatted: FormattedMessage = {} as FormattedMessage;

  // Must have vdl2 field
  if (
    typeof message.vdl2 !== "object" ||
    message.vdl2 === null ||
    Array.isArray(message.vdl2)
  ) {
    formatted.timestamp = Date.now() / 1000;
    return formatted;
  }

  const vdl2 = message.vdl2 as Record<string, unknown>;

  // Timestamp
  if (
    typeof vdl2.t === "object" &&
    vdl2.t !== null &&
    "sec" in vdl2.t &&
    typeof vdl2.t.sec === "number"
  ) {
    formatted.timestamp = vdl2.t.sec;
  }

  // Station ID
  if (typeof vdl2.station === "string") {
    formatted.station_id = vdl2.station;
  }

  // AVLC
  if (
    typeof vdl2.avlc === "object" &&
    vdl2.avlc !== null &&
    !Array.isArray(vdl2.avlc)
  ) {
    const avlc = vdl2.avlc as Record<string, unknown>;

    // Destination address
    if (
      typeof avlc.dst === "object" &&
      avlc.dst !== null &&
      "addr" in avlc.dst &&
      typeof avlc.dst.addr === "string"
    ) {
      formatted.toaddr = Number.parseInt(avlc.dst.addr, 16);
    }

    // Source address
    if (
      typeof avlc.src === "object" &&
      avlc.src !== null &&
      "addr" in avlc.src &&
      typeof avlc.src.addr === "string"
    ) {
      formatted.fromaddr = Number.parseInt(avlc.src.addr, 16);

      // ICAO (only if source is Aircraft)
      const src = avlc.src as Record<string, unknown>;
      if (src.type === "Aircraft") {
        formatted.icao = avlc.src.addr.toUpperCase();
      }

      // On-ground status
      if (typeof src.status === "string") {
        formatted.is_onground = src.status === "Airborne" ? 0 : 2;
      }
    }

    // XID parameters
    if (
      typeof avlc.xid === "object" &&
      avlc.xid !== null &&
      "vdl_params" in avlc.xid &&
      Array.isArray(avlc.xid.vdl_params)
    ) {
      for (const item of avlc.xid.vdl_params) {
        if (typeof item === "object" && item !== null && "name" in item) {
          // Destination airport
          if (item.name === "dst_airport" && "value" in item) {
            formatted.dsta = String(item.value);
          }
          // Aircraft location
          else if (
            item.name === "ac_location" &&
            typeof item.value === "object" &&
            item.value !== null &&
            "loc" in item.value
          ) {
            const value = item.value as Record<string, unknown>;
            const loc = value.loc as Record<string, unknown>;
            if (typeof loc.lat === "number") {
              formatted.lat = loc.lat;
            }
            if (typeof loc.lon === "number") {
              formatted.lon = loc.lon;
            }
            if (typeof value.alt === "number") {
              formatted.alt = value.alt;
            }
          }
        }
      }
    }

    // ACARS
    if (
      typeof avlc.acars === "object" &&
      avlc.acars !== null &&
      !Array.isArray(avlc.acars)
    ) {
      const acars = avlc.acars as Record<string, unknown>;

      // Message text
      if (typeof acars.msg_text === "string") {
        formatted.text = acars.msg_text;
      }

      // Tail (remove dots)
      if (typeof acars.reg === "string") {
        formatted.tail = acars.reg.replace(/\./g, "");
      }

      // Flight
      if (typeof acars.flight === "string") {
        formatted.flight = acars.flight;
      }

      // Ack
      if (typeof acars.ack === "string") {
        formatted.ack = acars.ack;
      }

      // Mode
      if (typeof acars.mode === "string") {
        formatted.mode = acars.mode;
      }

      // Label
      if (typeof acars.label === "string") {
        formatted.label = String(acars.label);
      }

      // Block ID
      if (typeof acars.blk_id === "string") {
        formatted.block_id = acars.blk_id;
      }

      // Message number (with optional sequence)
      if (typeof acars.msg_num === "string") {
        formatted.msgno = acars.msg_num;
        if (typeof acars.msg_num_seq === "string") {
          formatted.msgno = formatted.msgno + acars.msg_num_seq;
        }
      }

      // ARINC622 (libacars)
      if (typeof acars.arinc622 === "object" && acars.arinc622 !== null) {
        formatted.libacars = JSON.stringify(acars.arinc622);
      }
    }

    // Response flag
    if (typeof avlc.cr === "string" && avlc.cr === "Response") {
      formatted.is_response = 1;
    }
  }

  // Header bits fixed (error count)
  if (typeof vdl2.hdr_bits_fixed === "number") {
    formatted.error = vdl2.hdr_bits_fixed;
  }

  // Signal level
  if (typeof vdl2.sig_level === "number") {
    formatted.level = formatDumpvdl2Level(vdl2.sig_level);
  }

  // Frequency
  if (typeof vdl2.freq === "number") {
    formatted.freq = reformatDumpvdl2Freq(vdl2.freq);
  }

  // Ensure timestamp is set
  if (!formatted.timestamp) {
    formatted.timestamp = Date.now() / 1000;
  }

  return formatted;
}

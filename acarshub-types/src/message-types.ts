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
 * Canonical message-type mapping.
 *
 * The `messages.message_type` column stores the legacy Python names
 * (`"VDL-M2"`, `"IMS-L"`, ...). Existing databases are full of these values,
 * so the stored spellings MUST NOT change. Other parts of the system use
 * different spellings for the same decoder (`"VDLM2"` on the wire, `"VDLM"`
 * in config, `"IMSL"` in signal-level payloads), so every comparison of a
 * message type must go through {@link decoderKeyFromMessageType} rather than
 * a hand-written alias list.
 *
 * @module message-types
 */

/** Spelling-independent identifier for a decoder / message type. */
export type DecoderKey = "acars" | "vdlm2" | "hfdl" | "imsl" | "irdm";

/** Value stored in `messages.message_type` (legacy Python names). */
export type StoredMessageType = "ACARS" | "VDL-M2" | "HFDL" | "IMS-L" | "IRDM";

/** The stored database spelling for each decoder. */
export const STORED_MESSAGE_TYPES: Readonly<
  Record<DecoderKey, StoredMessageType>
> = Object.freeze({
  acars: "ACARS",
  vdlm2: "VDL-M2",
  hfdl: "HFDL",
  imsl: "IMS-L",
  irdm: "IRDM",
});

const DECODER_KEY_BY_SPELLING = Object.freeze({
  ACARS: "acars",
  "VDL-M2": "vdlm2",
  VDLM2: "vdlm2",
  VDLM: "vdlm2",
  HFDL: "hfdl",
  "IMS-L": "imsl",
  IMSL: "imsl",
  IRDM: "irdm",
} as const satisfies Record<string, DecoderKey>);

/**
 * Every canonical (upper-case) spelling accepted by
 * {@link decoderKeyFromMessageType}. Passing a value of this type selects the
 * non-null overloads, so callers holding e.g. the wire `MessageType` union get
 * a compile-time guarantee that every member is recognised.
 */
export type MessageTypeSpelling = keyof typeof DECODER_KEY_BY_SPELLING;

function isMessageTypeSpelling(value: string): value is MessageTypeSpelling {
  return Object.hasOwn(DECODER_KEY_BY_SPELLING, value);
}

/**
 * Resolve any known spelling of a message type to its {@link DecoderKey}.
 *
 * Case-insensitive and whitespace-tolerant. Accepts ACARS; VDL-M2, VDLM2,
 * VDLM; HFDL; IMS-L, IMSL; IRDM.
 *
 * @returns The decoder key, or `null` for an unrecognised type.
 */
export function decoderKeyFromMessageType(
  type: MessageTypeSpelling,
): DecoderKey;
export function decoderKeyFromMessageType(type: string): DecoderKey | null;
export function decoderKeyFromMessageType(type: string): DecoderKey | null {
  const normalized = type.trim().toUpperCase();
  return isMessageTypeSpelling(normalized)
    ? DECODER_KEY_BY_SPELLING[normalized]
    : null;
}

/**
 * Resolve any known spelling of a message type to the value stored in
 * `messages.message_type`.
 *
 * @returns The stored spelling, or `null` for an unrecognised type.
 */
export function toStoredMessageType(
  type: MessageTypeSpelling,
): StoredMessageType;
export function toStoredMessageType(type: string): StoredMessageType | null;
export function toStoredMessageType(type: string): StoredMessageType | null {
  const key = decoderKeyFromMessageType(type);
  return key === null ? null : STORED_MESSAGE_TYPES[key];
}

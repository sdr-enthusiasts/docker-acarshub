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
 * ACARS Message Type Definitions
 * Shared between frontend and backend
 */

// Decoder Types for ACARS Messages

/**
 * DecodedText from @airframes/acars-decoder
 * The actual parts we care about
 */
export interface DecodedTextItem {
  label: string;
  value: string;
}

export interface DecodedText {
  decoder: {
    decodeLevel: "full" | "partial" | "none";
    name?: string;
  };
  formatted: DecodedTextItem[];
}

// Libacars decoder types
export interface LibacarsTimestamp {
  hour: number;
  min: number;
  sec: number;
}

export interface LibacarsFreqData {
  freq: number;
}

export interface LibacarsGroundStation {
  name?: string;
  listening_on_freqs?: LibacarsFreqData[];
  heard_on_freqs?: LibacarsFreqData[];
}

export interface LibacarsFrequencyData {
  freq_data?: Array<{
    gs?: LibacarsGroundStation;
  }>;
  [key: string]: unknown;
}

export interface LibacarsCPDLC {
  msg_type?: string;
  [key: string]: unknown;
}

// Generic libacars data structure
export type LibacarsData =
  | LibacarsFrequencyData
  | LibacarsCPDLC
  | Record<string, unknown>;

/**
 * Core ACARS Message Type
 * This is the primary message structure used throughout the system
 */
export interface AcarsMsg {
  timestamp: number;
  station_id: string;
  toaddr?: string;
  fromaddr?: string;
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
  icao?: number;
  freq?: number;
  ack?: string;
  mode?: string;
  label?: string;
  block_id?: string;
  msgno?: string;
  is_response?: number;
  is_onground?: number;
  error?: number | string;
  libacars?: string; // JSON string that needs parsing
  level?: number;
  // Custom parameters injected by JavaScript or from the backend
  matched?: boolean;
  matched_text?: string[];
  matched_icao?: string[];
  matched_flight?: string[];
  matched_tail?: string[];
  uid: string;
  decodedText?: DecodedText;
  data?: string;
  message_type: string;
  msg_time?: number;
  duplicates?: string;
  msgno_parts?: string;
  label_type?: string;
  toaddr_decoded?: string;
  toaddr_hex?: string;
  fromaddr_hex?: string;
  fromaddr_decoded?: string;
  icao_url?: string;
  icao_hex?: string;
  decoded_msg?: string;
  icao_flight?: string;
  airline?: string;
  iata_flight?: string;
  flight_number?: string;
}

/**
 * Message Group Types
 * A message group represents a collection of messages from a single source
 * This can be an aircraft, ground station, or unknown source
 * Groups are matched by identifiers (flight, tail, icao_hex)
 */
export interface MessageGroup {
  identifiers: string[];
  has_alerts: boolean;
  num_alerts: number;
  messages: AcarsMsg[];
  lastUpdated: number; // Unix timestamp of most recent message (for culling)
}

// Legacy alias for backward compatibility during migration
export type Plane = MessageGroup;

export interface MessageGroupData {
  [index: string]: {
    count: number;
    has_alerts: boolean;
    num_alerts: number;
  };
}

// Legacy alias
export type PlaneData = MessageGroupData;

export interface MessageGroupMatch {
  messages: AcarsMsg[];
  has_alerts: boolean;
  num_alerts: number;
}

// Legacy alias
export type PlaneMatch = MessageGroupMatch;

export interface MessageGroupStats {
  num_messages: number;
  has_alerts: boolean;
  num_alerts: number;
}

// Legacy alias
export type PlaneNumMsgsAndAlert = MessageGroupStats;

export interface Matches {
  value: string;
  num_messages: number;
}

/**
 * HTML Message Types (for Socket.IO communication)
 */
export interface HtmlMsg {
  msghtml: AcarsMsg;
  loading?: boolean;
  done_loading?: boolean;
}

/**
 * Label Types
 */
export interface Labels {
  labels: {
    [labelId: string]: {
      name: string;
    };
  };
}

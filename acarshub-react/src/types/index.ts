// Copyright (C) 2022-2024 Frederick Clausen II
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
 * Core ACARS Hub Type Definitions
 * Migrated from legacy acarshub-typescript/src/interfaces.ts
 */

// Database Types
export interface DatabaseSize {
  size: string;
  count: number;
}

// System Status Types
export interface SystemStatus {
  status: {
    error_state: boolean;
    decoders: StatusDecoder;
    servers: StatusServer;
    global: StatusGlobal;
    stats: StatusDecoder;
    external_formats: StatusExternalFormats;
  };
}

export interface StatusExternalFormats {
  [index: string]: Array<{
    Status: string;
    type: string;
  }>;
}

export interface StatusServer {
  [index: string]: {
    Status: string;
    Web: string;
  };
}

export interface StatusDecoder {
  [index: string]: {
    Status: string;
  };
}

export interface StatusGlobal {
  [index: string]: {
    Status: string;
    Count: number;
  };
}

// Alert and Filter Types
export interface Terms {
  terms: string[];
  ignore: string[];
}

export interface AlertTerm {
  data: {
    [index: number]: {
      count: number;
      id: number;
      term: string;
    };
  };
}

export interface AlertMatched {
  was_found: boolean;
  text: string[] | null;
  icao: string[] | null;
  flight: string[] | null;
  tail: string[] | null;
}

// Decoder Configuration
export interface Decoders {
  acars: boolean;
  vdlm: boolean;
  hfdl: boolean;
  imsl: boolean;
  irdm: boolean;
  allow_remote_updates: boolean;
  adsb: {
    enabled: boolean;
    lat: number;
    lon: number;
    url: string;
    bypass: boolean;
    range_rings: boolean;
    flight_tracking_url: string;
  };
}

// Signal Types
export interface Signal {
  levels: {
    [index: number]: {
      count: number;
      id: number;
      level: number;
    };
  };
}

export interface SignalData {
  freq_type: string;
  freq: string;
  count: number;
}

export interface SignalFreqData {
  freqs: SignalData[];
}

export interface SignalCountData {
  count: {
    non_empty_total: number;
    non_empty_errors: number;
    empty_total: number;
    empty_errors: number;
  };
}

// Search Types
export interface CurrentSearch {
  flight: string;
  depa: string;
  dsta: string;
  freq: string;
  label: string;
  msgno: string;
  tail: string;
  icao: string;
  msg_text: string;
  station_id: string;
}

export interface SearchHtmlMsg {
  msghtml: AcarsMsg[];
  query_time: number;
  num_results: number;
}

// Label Types
export interface Labels {
  [index: string]: {
    [index: string]: {
      name: string;
    };
  };
}

// Core ACARS Message Type
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
  libacars?: unknown;
  level?: number;
  // Custom parameters injected by JavaScript or from the backend
  matched?: boolean;
  matched_text?: string[];
  matched_icao?: string[];
  matched_flight?: string[];
  matched_tail?: string[];
  uid: string;
  decodedText?: unknown; // External ACARS decoder library - type unavailable
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
}

// Plane/Aircraft Types
export interface Plane {
  identifiers: string[];
  has_alerts: boolean;
  num_alerts: number;
  messages: AcarsMsg[];
}

export interface PlaneData {
  [index: string]: {
    count: number;
    has_alerts: boolean;
    num_alerts: number;
  };
}

export interface PlaneMatch {
  messages: AcarsMsg[];
  has_alerts: boolean;
  num_alerts: number;
}

export interface PlaneNumMsgsAndAlert {
  num_messages: number;
  has_alerts: boolean;
  num_alerts: number;
}

export interface Matches {
  value: string;
  num_messages: number;
}

// ADS-B Types
export interface Adsb {
  now: number;
  messages: number;
  aircraft: AdsbPlane[];
}

export interface AdsbPlane {
  hex: string;
  type: string;
  flight: string;
  alt_baro?: number;
  alt_geom?: number;
  gs?: number;
  ias?: number;
  tas?: number;
  mach?: number;
  track?: number;
  track_rate?: number;
  roll?: number;
  mag_heading?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: number;
  emergency?: number;
  category?: number;
  nav_qnh?: number;
  nav_altitude_mcp?: number;
  nav_altitude_fms?: number;
  nav_heading?: number;
  nav_modes?: number;
  lat?: number;
  lon?: number;
  nic?: number;
  rc?: number;
  seen_pos?: number;
  version?: number;
  nic_baro?: number;
  nac_p?: number;
  nac_v?: number;
  sil?: number;
  sil_type?: number;
  gva?: number;
  sda?: number;
  mlat?: string[];
  tisb?: string[];
  messages?: number;
  seen?: number;
  rssi?: number;
  alert?: number;
  spi?: number;
  wd?: number;
  ws?: number;
  oat?: number;
  tat?: number;
  t?: string;
  r?: string;
}

export interface AdsbStatus {
  adsb_enabled: boolean;
  adsb_getting_data: boolean;
}

// Version Information
export interface AcarshubVersion {
  container_version: string;
  github_version: string;
  is_outdated: boolean;
}

// Utility Types
export interface WindowSize {
  height: number;
  width: number;
}

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
 * System Status and Configuration Type Definitions
 * Shared between frontend and backend
 */

/**
 * Database Size Information
 */
export interface DatabaseSize {
  size: number; // Size in bytes
  count: number;
}

/**
 * System Status Response
 */
export interface SystemStatus {
  status: {
    error_state: boolean;
    decoders: StatusDecoder;
    servers: StatusServer;
    global: StatusGlobal;
    stats: StatusDecoder; // Legacy compatibility (empty)
    external_formats: StatusExternalFormats; // Legacy compatibility (empty)
    errors?: {
      Total: number;
      LastMinute: number;
    };
    threads?: {
      database: boolean;
      scheduler: boolean;
    };
  };
}

/**
 * External Format Status
 */
export interface StatusExternalFormats {
  [index: string]: Array<{
    Status: string;
    type: string;
  }>;
}

/**
 * Server Status
 */
export interface StatusServer {
  [index: string]: {
    Status: string;
    Messages: number;
  };
}

/**
 * Decoder Status
 */
export interface StatusDecoder {
  [index: string]: {
    Status: string;
    Connected?: boolean;
    Alive?: boolean;
  };
}

/**
 * Global Status
 */
export interface StatusGlobal {
  [index: string]: {
    Status: string;
    Count: number;
    LastMinute?: number;
  };
}

/**
 * Alert Terms Configuration
 */
export interface Terms {
  terms: string[];
  ignore: string[];
}

/**
 * Alert Term with Statistics
 */
export interface AlertTerm {
  [index: number]: {
    count: number;
    id: number;
    term: string;
  };
}

/**
 * Alert Match Results
 */
export interface AlertMatched {
  was_found: boolean;
  text: string[] | null;
  icao: string[] | null;
  flight: string[] | null;
  tail: string[] | null;
}

/**
 * Decoder Configuration
 */
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
    range_rings: boolean;
  };
}

/**
 * Signal Level Item
 */
export interface SignalLevelItem {
  level: number;
  count: number;
  id?: number;
}

/**
 * Signal Level Data by Decoder
 */
export interface SignalLevelData {
  [decoder: string]: SignalLevelItem[];
}

/**
 * Legacy single-array format (deprecated, kept for backwards compatibility)
 */
export interface Signal {
  [index: number]: {
    count: number;
    id: number;
    level: number;
  };
}

/**
 * Signal Frequency Data
 */
export interface SignalData {
  freq_type: string;
  freq: string;
  count: number;
}

/**
 * Signal Frequency Response
 */
export interface SignalFreqData {
  freqs: SignalData[];
}

/**
 * Signal Count Statistics
 */
export interface SignalCountData {
  count: {
    non_empty_total: number;
    non_empty_errors: number;
    empty_total: number;
    empty_errors: number;
  };
}

/**
 * Version Information
 */
export interface AcarshubVersion {
  container_version: string;
  github_version: string;
  is_outdated: boolean;
}

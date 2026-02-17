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
 * Socket.IO Event Type Definitions
 * Shared between frontend and backend
 *
 * These define the API contract for real-time communication
 * between the backend server and frontend clients.
 */

import type { ADSBData, Adsb } from "./adsb.js";
import type { HtmlMsg, Labels } from "./messages.js";
import type {
  AlertsByTermResults,
  CurrentSearch,
  SearchHtmlMsg,
} from "./search.js";
import type {
  AcarshubVersion,
  AlertTerm,
  DatabaseSize,
  Decoders,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
  SystemStatus,
  Terms,
} from "./system.js";

/**
 * Time-series data point from RRD database
 */
export interface RRDTimeseriesPoint {
  timestamp: number; // Unix timestamp in seconds
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}

/**
 * Time-series data response
 */
export interface RRDTimeseriesData {
  data: RRDTimeseriesPoint[];
  time_period?: string; // Python format: "1hr" | "6hr" | "12hr" | "24hr" | "1wk" | "30day" | "6mon" | "1yr"
  start?: number; // Query start timestamp (alternative to time_period)
  end?: number; // Query end timestamp (alternative to time_period)
  downsample?: number; // Bucket size in seconds (if downsampled)
  points: number; // Number of data points returned
  error?: string; // Error message if query failed
  resolution?: string; // Resolution hint (e.g., "1min", "5min", "1hr")
  data_sources?: string[]; // List of data source names
}

/**
 * Events received from backend (server → client)
 * These are the events that the backend emits and the frontend listens for
 */
export interface SocketEvents {
  // ACARS message events
  acars_msg: (data: HtmlMsg) => void;
  newmsg: (data: { new: boolean }) => void;

  // Label and term updates
  labels: (data: Labels) => void;
  terms: (data: Terms) => void;

  // Alert matches (initial load from database)
  alert_matches: (data: HtmlMsg) => void;

  // Search results
  database_search_results: (data: SearchHtmlMsg) => void;

  // Historical alerts by term
  alerts_by_term_results: (data: AlertsByTermResults) => void;

  // System status and monitoring
  system_status: (data: SystemStatus) => void;
  signal: (data: { levels: SignalLevelData }) => void;
  signal_freqs: (data: SignalFreqData) => void;
  signal_count: (data: SignalCountData) => void;

  // Time-series data (RRD replacement)
  rrd_timeseries_data: (data: RRDTimeseriesData) => void;

  // ADS-B events
  adsb: (data: Adsb) => void;
  adsb_aircraft: (data: ADSBData) => void;

  // Configuration (Python sends "features_enabled", not "decoders")
  features_enabled: (data: Decoders) => void;
  decoders: (data: Decoders) => void; // Legacy alias

  // Alert statistics (Python sends "alert_terms" with {data: ...}, not "alert_terms_stats")
  alert_terms: (data: { data: AlertTerm }) => void;
  alert_terms_stats: (data: AlertTerm) => void; // Legacy alias

  // Database size (Python sends "database" with {count, size}, not "database_size")
  database: (data: DatabaseSize) => void;
  database_size: (data: DatabaseSize) => void; // Legacy alias

  // Version information
  acarshub_version: (data: AcarshubVersion) => void;
}

/**
 * Events emitted to backend (client → server)
 * These are the events that the frontend emits and the backend handles
 */
export interface SocketEmitEvents {
  query_search: (params: {
    search_term: CurrentSearch;
    results_after?: number;
    show_all?: boolean;
  }) => void;
  update_alerts: (terms: Terms) => void;
  signal_freqs: () => void;
  signal_count: () => void;
  alert_term_query: (params: {
    icao: string;
    flight: string;
    tail: string;
  }) => void;
  request_status: () => void;
  query_alerts_by_term: (params: { term: string; page?: number }) => void;
  rrd_timeseries: (params: {
    time_period?: string; // Python format: "1hr" | "6hr" | "12hr" | "24hr" | "1wk" | "30day" | "6mon" | "1yr"
    start?: number; // Unix timestamp in seconds (alternative to time_period)
    end?: number; // Unix timestamp in seconds (alternative to time_period)
    downsample?: number; // Bucket size in seconds
  }) => void;
}

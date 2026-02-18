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
 * Search and Query Type Definitions
 * Shared between frontend and backend
 */

import type { AcarsMsg } from "./messages.js";

/**
 * Current Search Parameters
 */
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
  /** Decoder type filter: "ACARS", "VDLM2", "HFDL", "IMSL", "IRDM", or "" for all */
  msg_type: string;
}

/**
 * Search Results with HTML Messages
 */
export interface SearchHtmlMsg {
  msghtml: AcarsMsg[];
  query_time: number;
  num_results: number;
}

/**
 * Alerts by Term Search Results
 */
export interface AlertsByTermResults {
  total_count: number;
  messages: AcarsMsg[];
  term: string;
  page: number;
  query_time: number;
}

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
 * ADS-B Aircraft Type Definitions
 * Shared between frontend and backend
 */

import type { AcarsMsg } from "./messages.js";

/**
 * Source type for ADS-B position data, as reported in aircraft.json by
 * readsb/dump1090.  This identifies both the underlying message format and
 * the method used to derive the aircraft's current position.
 *
 * Ordered from highest to lowest preference (readsb priority order):
 *   adsb_icao      – Mode S / ADS-B transponder, 24-bit ICAO address
 *   adsb_icao_nt   – ADS-B "non-transponder" emitter (e.g. ground vehicle), ICAO address
 *   adsr_icao      – Rebroadcast of ADS-B (e.g. via UAT), ICAO address
 *   tisb_icao      – TIS-B traffic info for a Mode S target, ICAO address
 *   adsc           – ADS-C via satellite downlink monitoring
 *   mlat           – Multilateration (arrival-time-difference across receivers)
 *   other          – Miscellaneous / Basestation / SBS format, unknown quality
 *   mode_s         – Mode S transponder only (no position)
 *   adsb_other     – ADS-B transponder with non-ICAO (anonymised) address
 *   adsr_other     – Rebroadcast ADS-B (e.g. UAT), non-ICAO address
 *   tisb_other     – TIS-B traffic info, non-ICAO address
 *   tisb_trackfile – TIS-B traffic info identified by track/file ID (primary or Mode A/C radar)
 */
export type ADSBSourceType =
  | "adsb_icao"
  | "adsb_icao_nt"
  | "adsr_icao"
  | "tisb_icao"
  | "adsc"
  | "mlat"
  | "other"
  | "mode_s"
  | "adsb_other"
  | "adsr_other"
  | "tisb_other"
  | "tisb_trackfile";

/**
 * ADS-B Aircraft Data (simplified format from readsb/dump1090)
 */
export interface ADSBAircraft {
  hex: string; // ICAO hex code (required, unique ID)
  flight?: string; // Callsign
  lat?: number; // Latitude
  lon?: number; // Longitude
  track?: number; // Heading for icon rotation (degrees)
  alt_baro?: number | "ground"; // Altitude (feet) or "ground" literal
  gs?: number; // Ground speed (knots)
  squawk?: string; // Transponder code
  baro_rate?: number; // Climb/descent rate (ft/min)
  category?: string; // Aircraft category (for icon shape)
  t?: string; // ICAO aircraft type designator (e.g. "B738", "A320")
  r?: string; // Registration/tail number
  type?: ADSBSourceType; // Best source / tracking method for current position data
  seen?: number; // Seconds since last update
  dbFlags?: number; // Bitfield: military=1, interesting=2, PIA=4, LADD=8
}

/**
 * ADS-B Data Response (from readsb/dump1090 aircraft.json)
 */
export interface ADSBData {
  now: number; // Unix timestamp
  aircraft: ADSBAircraft[];
}

/**
 * Complete ADS-B Aircraft Data (full readsb format)
 */
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
  dbFlags?: number; // Bitfield: military=1, interesting=2, PIA=4, LADD=8
}

/**
 * ADS-B Response with Aircraft List
 */
export interface Adsb {
  now: number;
  messages: number;
  aircraft: AdsbPlane[];
}

/**
 * ADS-B Status
 */
export interface AdsbStatus {
  adsb_enabled: boolean;
  adsb_getting_data: boolean;
}

/**
 * ADS-B Target (for map display)
 */
export interface AdsbTarget {
  id: string;
  position: AdsbPlane;
  last_updated: number;
  num_messages: number;
  messages?: AcarsMsg[];
  icon: AircraftIcon | null;
  // Note: Leaflet markers will be handled differently in React
  // These properties are for reference only during migration
  position_marker?: unknown;
  datablock_marker?: unknown;
}

/**
 * Aircraft Icon Data
 */
export interface AircraftIcon {
  svg: string;
  width: number;
  height: number;
}

/**
 * SVG Icon Configuration
 */
export interface SvgIcon {
  name: string;
  scale: number;
}

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
 * Core ACARS Hub Type Definitions
 * Migrated from legacy acarshub-typescript/src/interfaces.ts
 */

// Database Types
export interface DatabaseSize {
  size: number; // Size in bytes
  count: number;
}

// System Status Types
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

export interface StatusExternalFormats {
  [index: string]: Array<{
    Status: string;
    type: string;
  }>;
}

export interface StatusServer {
  [index: string]: {
    Status: string;
    Messages: number;
  };
}

export interface StatusDecoder {
  [index: string]: {
    Status: string;
    Connected?: boolean;
    Alive?: boolean;
  };
}

export interface StatusGlobal {
  [index: string]: {
    Status: string;
    Count: number;
    LastMinute?: number;
  };
}

// Alert and Filter Types
export interface Terms {
  terms: string[];
  ignore: string[];
}

export interface AlertTerm {
  [index: number]: {
    count: number;
    id: number;
    term: string;
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
    range_rings: boolean;
  };
}

// ADS-B Aircraft Types
export interface ADSBAircraft {
  hex: string; // ICAO hex code (required, unique ID)
  flight?: string; // Callsign
  lat?: number; // Latitude
  lon?: number; // Longitude
  track?: number; // Heading for icon rotation (degrees)
  alt_baro?: number; // Altitude (feet)
  gs?: number; // Ground speed (knots)
  squawk?: string; // Transponder code
  baro_rate?: number; // Climb/descent rate (ft/min)
  category?: string; // Aircraft category (for icon shape)
  t?: string; // Aircraft type designator
  r?: string; // Registration/tail number
  type?: string; // Aircraft type (usually same as t)
  seen?: number; // Seconds since last update
  dbFlags?: number; // Bitfield: military=1, interesting=2, PIA=4, LADD=8
}

export interface ADSBData {
  now: number; // Unix timestamp
  aircraft: ADSBAircraft[];
}

// Signal Types
export interface SignalLevelItem {
  level: number;
  count: number;
  id?: number;
}

export interface SignalLevelData {
  [decoder: string]: SignalLevelItem[];
}

// Legacy single-array format (deprecated, kept for backwards compatibility)
export interface Signal {
  [index: number]: {
    count: number;
    id: number;
    level: number;
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

export interface AlertsByTermResults {
  total_count: number;
  messages: AcarsMsg[];
  term: string;
  page: number;
  query_time: number;
}

// Label Types
export interface Labels {
  labels: {
    [labelId: string]: {
      name: string;
    };
  };
}

// Decoder Types for ACARS Messages

// DecodedText from @airframes/acars-decoder
// The actual library returns items with this structure
export interface DecodedTextItem {
  type: string;
  code: string;
  label: string;
  value: string;
  // Additional fields may exist
  [key: string]: string | unknown;
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

// Message Group Types
// A message group represents a collection of messages from a single source
// This can be an aircraft, ground station, or unknown source
// Groups are matched by identifiers (flight, tail, icao_hex)
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
  dbFlags?: number; // Bitfield: military=1, interesting=2, PIA=4, LADD=8
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

// HTML Message Types (for Socket.IO communication)
export interface HtmlMsg {
  msghtml: AcarsMsg;
  loading?: boolean;
  done_loading?: boolean;
}

// Map and Leaflet Types (will be used with react-leaflet)
export interface AircraftIcon {
  svg: string;
  width: number;
  height: number;
}

export interface SvgIcon {
  name: string;
  scale: number;
}

// Leaflet-specific types for ADS-B targets (using react-leaflet)
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

// Utility Types
export interface WindowSize {
  height: number;
  width: number;
}

/**
 * Socket.IO Event Types
 * These define the structure of events sent and received via Socket.IO
 */

// Events received from backend
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

  // ADS-B events
  adsb: (data: Adsb) => void;
  adsb_aircraft: (data: ADSBData) => void;

  // Configuration
  decoders: (data: Decoders) => void;

  // Alert statistics
  alert_terms_stats: (data: AlertTerm) => void;

  // Database size
  database_size: (data: DatabaseSize) => void;

  // Version information
  acarshub_version: (data: AcarshubVersion) => void;
}

// Events emitted to backend
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
}

/**
 * React Component Prop Types
 * Common prop interfaces for React components
 */

export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface MessageComponentProps extends BaseComponentProps {
  message: AcarsMsg;
  showDetails?: boolean;
  onToggleDetails?: () => void;
}

export interface MessageGroupComponentProps extends BaseComponentProps {
  messageGroup: MessageGroup;
  expanded?: boolean;
  onToggle?: () => void;
}

// Legacy alias
export type PlaneComponentProps = MessageGroupComponentProps & {
  plane: MessageGroup;
};

/**
 * UI State Types
 * Types for managing UI state in components
 */

export interface TabState {
  activeTab: string;
  tabs: TabConfig[];
}

export interface TabConfig {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
}

export interface ModalState {
  isOpen: boolean;
  title?: string;
  content?: React.ReactNode;
  onClose?: () => void;
}

export interface TooltipConfig {
  content: string | React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  trigger?: "hover" | "click" | "focus";
}

/**
 * Form and Input Types
 */

export interface FormFieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "textarea";
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: SelectOption[];
}

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

/**
 * Statistics and Chart Types
 */

export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color?: string;
}

export interface StatisticCard {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

/**
 * Theme Types
 */

export type Theme = "mocha" | "latte";

export interface ThemeConfig {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * Error and Loading States
 */

export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  code?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ErrorState;
  loading: LoadingState;
}

/**
 * Pagination Types
 */

export interface PaginationConfig {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Filter and Sort Types
 */

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface FilterConfig {
  field: string;
  operator: "equals" | "contains" | "startsWith" | "endsWith" | "gt" | "lt";
  value: string | number | boolean;
}

/**
 * User Settings and Preferences Types
 */

/**
 * Altitude unit preference
 * - feet: Imperial feet (default - used by most of the world)
 * - meters: Metric meters (used by Russia and a few others)
 */
export type AltitudeUnit = "feet" | "meters";

/**
 * Time format preference
 * - auto: Detect from user's locale
 * - 12h: 12-hour format with AM/PM
 * - 24h: 24-hour format
 */
export type TimeFormat = "auto" | "12h" | "24h";

/**
 * Date format presets
 */
export type DateFormat =
  | "auto" // Locale default
  | "mdy" // MM/DD/YYYY (US)
  | "dmy" // DD/MM/YYYY (Europe)
  | "ymd" // YYYY-MM-DD (ISO)
  | "long" // January 1, 2024
  | "short"; // Jan 1, 2024

/**
 * Timezone preference
 * - local: Use browser's local timezone
 * - utc: Use UTC timezone
 */
export type Timezone = "local" | "utc";

/**
 * Display density options
 */
export type DisplayDensity = "comfortable" | "compact" | "spacious";

/**
 * Log level for application logging
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

/**
 * Notification preferences
 */
export interface NotificationSettings {
  /** Enable desktop notifications */
  desktop: boolean;
  /** Enable sound alerts for matched messages */
  sound: boolean;
  /** Sound volume (0-100) */
  volume: number;
  /** Show on-page toast notifications for alert matches */
  onPageAlerts: boolean;
}

/**
 * Map provider types - organized by category like tar1090
 */
export type MapProviderCategory = "worldwide" | "us" | "europe" | "custom";

/**
 * Worldwide map providers (no API key required)
 */
export type WorldwideMapProvider =
  | "osm" // OpenStreetMap
  | "carto_english" // CARTO.com English (Voyager)
  | "osm_de" // OpenStreetMap DE
  | "openfreemap_bright" // OpenFreeMap Bright
  | "openfreemap_liberty" // OpenFreeMap Liberty
  | "openfreemap_positron" // OpenFreeMap Positron
  | "openfreemap_dark" // OpenFreeMap Dark
  | "openfreemap_fiord" // OpenFreeMap Fiord
  | "esri_satellite" // ESRI.com Satellite
  | "esri_gray" // ESRI.com Gray
  | "esri_streets" // ESRI.com Streets
  | "gibs_clouds" // GIBS Clouds (yesterday)
  | "carto_dark_all" // CARTO.com dark_all
  | "carto_dark_nolabels" // CARTO.com dark_nolabels
  | "carto_light_all" // CARTO.com light_all
  | "carto_light_nolabels"; // CARTO.com light_nolabels

/**
 * US-specific map providers (aviation charts)
 */
export type USMapProvider =
  | "vfr_sectional" // VFR Sectional Chart
  | "vfr_terminal" // VFR Terminal Chart
  | "ifr_low" // IFR Enroute Chart Low
  | "ifr_high"; // IFR Enroute Chart High

/**
 * Europe-specific map providers
 */
export type EuropeMapProvider = never; // No tile layers, only overlays in tar1090

/**
 * All available map providers
 */
export type MapProvider =
  | WorldwideMapProvider
  | USMapProvider
  | EuropeMapProvider
  | "custom";

/**
 * Map provider configuration
 */
export interface MapProviderConfig {
  /** Provider ID */
  id: MapProvider;
  /** Display name */
  name: string;
  /** Category for grouping */
  category: MapProviderCategory;
  /** Tile URL template */
  url: string;
  /** Attribution text */
  attribution?: string;
  /** Maximum zoom level */
  maxZoom?: number;
  /** Minimum zoom level */
  minZoom?: number;
  /** Whether this is a vector tile layer (false = raster) */
  isVector?: boolean;
}

/**
 * GeoJSON overlay configuration
 */
export interface GeoJSONOverlay {
  /** Unique identifier (e.g., "us_a2a_refueling") */
  id: string;
  /** Display name (e.g., "Air-to-Air Refueling") */
  name: string;
  /** File path (e.g., "/geojson/US_A2A_refueling.geojson") */
  path: string;
  /** Geographic category (e.g., "United States") */
  category: string;
  /** Visibility state */
  enabled: boolean;
  /** Line/fill color (hex format) */
  color?: string;
  /** Opacity (0-1) */
  opacity?: number;
}

/**
 * GeoJSON category grouping
 */
export interface GeoJSONCategory {
  /** Category name (e.g., "United States") */
  name: string;
  /** Overlays in this category */
  overlays: GeoJSONOverlay[];
}

/**
 * Map settings
 */
export interface MapSettings {
  /** Map tile provider */
  provider: MapProvider;
  /** Custom tile URL (only used if provider is 'custom') */
  customTileUrl?: string;
  /** User has explicitly selected a provider (don't auto-switch with theme) */
  userSelectedProvider: boolean;
  /** Station latitude for range rings and center */
  stationLat: number;
  /** Station longitude for range rings and center */
  stationLon: number;
  /** Range ring radii in nautical miles */
  rangeRings: number[];
  /** Default center latitude */
  defaultCenterLat: number;
  /** Default center longitude */
  defaultCenterLon: number;
  /** Default zoom level */
  defaultZoom: number;
  /** Show only ACARS aircraft on map */
  showOnlyAcars: boolean;
  /** Show data blocks */
  showDatablocks: boolean;
  /** Show extended data blocks */
  showExtendedDatablocks: boolean;
  /** Show NEXRAD overlay */
  showNexrad: boolean;
  /** Show range rings */
  showRangeRings: boolean;
  /** Show only aircraft with unread messages */
  showOnlyUnread: boolean;
  /** Show only military aircraft (dbFlags & 1) */
  showOnlyMilitary: boolean;
  /** Show only interesting aircraft (dbFlags & 2) */
  showOnlyInteresting: boolean;
  /** Show only PIA aircraft (dbFlags & 4) */
  showOnlyPIA: boolean;
  /** Show only LADD aircraft (dbFlags & 8) */
  showOnlyLADD: boolean;
  /** Enabled GeoJSON overlay IDs */
  enabledGeoJSONOverlays: string[];
  /** Show OpenAIP aeronautical charts overlay */
  showOpenAIP: boolean;
  /** Show RainViewer weather radar overlay */
  showRainViewer: boolean;
}

/**
 * Regional and locale settings
 */
export interface RegionalSettings {
  /** Time format preference */
  timeFormat: TimeFormat;
  /** Date format preference */
  dateFormat: DateFormat;
  /** Timezone display (future: allow override) */
  timezone: "local" | "utc";
  /** Locale override (undefined = auto-detect) */
  locale?: string;
  /** Altitude unit preference (feet/meters/auto) */
  altitudeUnit: AltitudeUnit;
}

/**
 * Appearance settings
 */
export interface AppearanceSettings {
  /** Theme (Mocha/Latte) */
  theme: Theme;
  /** Show connection status indicator */
  showConnectionStatus: boolean;
  /** Enable animations */
  animations: boolean;
}

/**
 * Data and privacy settings
 */
export interface DataSettings {
  /** Maximum messages to keep in memory per message group (aircraft/station) */
  maxMessagesPerAircraft: number;
  /** Maximum number of message groups to keep in memory (total sources) */
  maxMessageGroups: number;
  /** Enable local data caching */
  enableCaching: boolean;
  /** Auto-clear old data after N minutes */
  autoClearMinutes: number;
}

/**
 * Advanced settings (logging, debugging)
 */
export interface AdvancedSettings {
  /** Log level for console and buffer */
  logLevel: LogLevel;
  /** Persist logs to localStorage across page refreshes */
  persistLogs: boolean;
}

/**
 * Complete user settings object
 */
export interface UserSettings {
  /** Appearance preferences */
  appearance: AppearanceSettings;
  /** Regional and time preferences */
  regional: RegionalSettings;
  /** Notification preferences */
  notifications: NotificationSettings;
  /** Data management preferences */
  data: DataSettings;
  /** Map preferences */
  map: MapSettings;
  /** Advanced settings (logging, debugging) */
  advanced: AdvancedSettings;
  /** Last updated timestamp */
  updatedAt: number;
  /** Settings version for migration */
  version: number;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: UserSettings = {
  appearance: {
    theme: "mocha",
    showConnectionStatus: true,
    animations: true,
  },
  regional: {
    timeFormat: "auto",
    dateFormat: "auto",
    timezone: "local",
    altitudeUnit: "feet",
  },
  notifications: {
    desktop: false,
    sound: false,
    volume: 50,
    onPageAlerts: false,
  },
  data: {
    maxMessagesPerAircraft: 50,
    maxMessageGroups: 50,
    enableCaching: true,
    autoClearMinutes: 60,
  },
  map: {
    provider: "carto_dark_all", // Default for Mocha theme
    customTileUrl: undefined,
    userSelectedProvider: false, // Allow theme-aware switching
    stationLat: 0,
    stationLon: 0,
    rangeRings: [100, 200, 300],
    defaultCenterLat: 0,
    defaultCenterLon: 0,
    defaultZoom: 7,
    showOnlyAcars: false,
    showDatablocks: true,
    showExtendedDatablocks: false,
    showNexrad: false,
    showRangeRings: true,
    showOnlyUnread: false,
    showOnlyMilitary: false,
    showOnlyInteresting: false,
    showOnlyPIA: false,
    showOnlyLADD: false,
    enabledGeoJSONOverlays: [],
    showOpenAIP: false,
    showRainViewer: false,
  },
  advanced: {
    logLevel: "info",
    persistLogs: false,
  },
  updatedAt: Date.now(),
  version: 3,
};

/**
 * Settings section for UI organization
 */
export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

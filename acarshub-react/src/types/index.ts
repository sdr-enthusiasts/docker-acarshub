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
    url: string;
    bypass: boolean;
    range_rings: boolean;
    flight_tracking_url: string;
  };
}

// Signal Types
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

  // Search results
  database_search_results: (data: SearchHtmlMsg) => void;

  // System status and monitoring
  system_status: (data: SystemStatus) => void;
  signal: (data: Signal) => void;
  signal_freqs: (data: SignalFreqData) => void;
  signal_count: (data: SignalCountData) => void;

  // ADS-B events
  adsb: (data: Adsb) => void;

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
  query_search: (params: CurrentSearch) => void;
  update_alerts: (terms: Terms) => void;
  signal_freqs: () => void;
  signal_count: () => void;
  alert_term_query: (params: {
    icao: string;
    flight: string;
    tail: string;
  }) => void;
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

export interface PlaneComponentProps extends BaseComponentProps {
  plane: Plane;
  expanded?: boolean;
  onToggle?: () => void;
}

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
 * Time format options
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
 * Display density options
 */
export type DisplayDensity = "comfortable" | "compact" | "spacious";

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
  /** Only notify for alert matches */
  alertsOnly: boolean;
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
}

/**
 * Appearance settings
 */
export interface AppearanceSettings {
  /** Theme (Mocha/Latte) */
  theme: Theme;
  /** Display density */
  density: DisplayDensity;
  /** Show connection status indicator */
  showConnectionStatus: boolean;
  /** Enable animations */
  animations: boolean;
}

/**
 * Data and privacy settings
 */
export interface DataSettings {
  /** Maximum messages to keep in memory per aircraft */
  maxMessagesPerAircraft: number;
  /** Enable local data caching */
  enableCaching: boolean;
  /** Auto-clear old data after N minutes */
  autoClearMinutes: number;
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
    density: "comfortable",
    showConnectionStatus: true,
    animations: true,
  },
  regional: {
    timeFormat: "auto",
    dateFormat: "auto",
    timezone: "local",
  },
  notifications: {
    desktop: false,
    sound: false,
    volume: 50,
    alertsOnly: true,
  },
  data: {
    maxMessagesPerAircraft: 50,
    enableCaching: true,
    autoClearMinutes: 60,
  },
  updatedAt: Date.now(),
  version: 1,
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

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
 * Frontend-Only UI Type Definitions
 * These types are specific to the React frontend and are not shared with the backend
 */

import type { AcarsMsg, MessageGroup } from "@acarshub/types";

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
  /** Use professional sprite silhouettes (true) or SVG markers (false) */
  useSprites: boolean;
  /** Color aircraft markers by decoder type (ACARS=blue, VDLM=green, HFDL=yellow, etc.) instead of message state */
  colorByDecoder: boolean;
  /** Altitude threshold (ft MSL) for "on ground" color (default: 500) */
  groundAltitudeThreshold: number;
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
    useSprites: true,
    colorByDecoder: false,
    groundAltitudeThreshold: 500,
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
  version: 5,
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

/**
 * Window Size Utility Type
 */
export interface WindowSize {
  height: number;
  width: number;
}

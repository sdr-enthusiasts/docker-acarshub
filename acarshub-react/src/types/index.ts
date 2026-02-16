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
 * Frontend Type Definitions Index
 *
 * This file re-exports:
 * 1. Shared types from @acarshub/types (used by both frontend and backend)
 * 2. Frontend-only UI types from ./ui
 *
 * Components should import from "@/types" as before - the migration to
 * shared types is transparent to existing code.
 */

// Re-export all shared types from @acarshub/types
export type {
  AcarshubVersion,
  AcarsMsg,
  // ADS-B
  ADSBAircraft,
  ADSBData,
  Adsb,
  AdsbPlane,
  AdsbStatus,
  AdsbTarget,
  AircraftIcon,
  AlertMatched,
  AlertsByTermResults,
  AlertTerm,
  // Search
  CurrentSearch,
  // System
  DatabaseSize,
  DecodedText,
  // Messages
  DecodedTextItem,
  Decoders,
  HtmlMsg,
  Labels,
  LibacarsCPDLC,
  LibacarsData,
  LibacarsFreqData,
  LibacarsFrequencyData,
  LibacarsGroundStation,
  LibacarsTimestamp,
  Matches,
  MessageGroup,
  MessageGroupData,
  MessageGroupMatch,
  MessageGroupStats,
  Plane,
  PlaneData,
  PlaneMatch,
  PlaneNumMsgsAndAlert,
  SearchHtmlMsg,
  Signal,
  SignalCountData,
  SignalData,
  SignalFreqData,
  SignalLevelData,
  SignalLevelItem,
  SocketEmitEvents,
  // Socket.IO
  SocketEvents,
  StatusDecoder,
  StatusExternalFormats,
  StatusGlobal,
  StatusServer,
  SvgIcon,
  SystemStatus,
  Terms,
} from "@acarshub/types";

// Re-export all frontend-only UI types
export type {
  AdvancedSettings,
  // Settings
  AltitudeUnit,
  ApiResponse,
  AppearanceSettings,
  // Component Props
  BaseComponentProps,
  // Charts
  ChartDataPoint,
  ChartSeries,
  DataSettings,
  DateFormat,
  DisplayDensity,
  ErrorState,
  EuropeMapProvider,
  FilterConfig,
  // Forms
  FormFieldConfig,
  GeoJSONCategory,
  GeoJSONOverlay,
  // Error/Loading
  LoadingState,
  LogLevel,
  MapProvider,
  MapProviderCategory,
  MapProviderConfig,
  MapSettings,
  MessageComponentProps,
  MessageGroupComponentProps,
  ModalState,
  NotificationSettings,
  // Pagination
  PaginationConfig,
  PlaneComponentProps,
  RegionalSettings,
  SelectOption,
  SettingsSection,
  SortConfig,
  // Sort/Filter
  SortDirection,
  StatisticCard,
  TabConfig,
  // UI State
  TabState,
  // Theme
  Theme,
  ThemeConfig,
  TimeFormat,
  Timezone,
  TooltipConfig,
  USMapProvider,
  UserSettings,
  // Utilities
  WindowSize,
  WorldwideMapProvider,
} from "./ui.js";

// Re-export default settings constant
export { DEFAULT_SETTINGS } from "./ui.js";

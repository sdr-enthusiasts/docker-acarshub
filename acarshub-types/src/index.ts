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
 * ACARS Hub Shared Type Definitions
 *
 * This package contains TypeScript type definitions that are shared
 * between the ACARS Hub frontend (React) and backend (Node.js).
 *
 * These types define the API contract for Socket.IO communication,
 * message structures, system status, and search operations.
 *
 * @packageDocumentation
 */

// Re-export all ADS-B types
export type {
  ADSBAircraft,
  ADSBData,
  Adsb,
  AdsbPlane,
  AdsbStatus,
  AdsbTarget,
  AircraftIcon,
  SvgIcon,
} from "./adsb.js";
// Re-export all message types
export type {
  AcarsMsg,
  DecodedText,
  DecodedTextItem,
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
} from "./messages.js";
// Re-export all search types
export type {
  AlertsByTermResults,
  CurrentSearch,
  SearchHtmlMsg,
} from "./search.js";
// Re-export all Socket.IO event types
export type {
  MsgBatchPayload,
  RRDTimeseriesData,
  RRDTimeseriesPoint,
  SocketEmitEvents,
  SocketEvents,
} from "./socket.js";
// Re-export all system and configuration types
export type {
  AcarshubVersion,
  AlertMatched,
  AlertTerm,
  DatabaseSize,
  Decoders,
  Signal,
  SignalCountData,
  SignalData,
  SignalFreqData,
  SignalLevelData,
  SignalLevelItem,
  StatusDecoder,
  StatusExternalFormats,
  StatusGlobal,
  StatusServer,
  SystemStatus,
  Terms,
} from "./system.js";

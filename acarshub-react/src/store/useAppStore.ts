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

import { create } from "zustand";
import type {
  AcarshubVersion,
  AcarsMsg,
  AdsbStatus,
  DatabaseSize,
  Decoders,
  Labels,
  Plane,
  Signal,
  SystemStatus,
  Terms,
} from "../types";

/**
 * Application State Interface
 * Defines the complete state tree for ACARS Hub
 */
interface AppState {
  // Connection state
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Message state
  messages: Map<string, Plane>; // Key: aircraft identifier (tail/icao/flight)
  addMessage: (message: AcarsMsg) => void;
  clearMessages: () => void;

  // Labels and metadata
  labels: Labels;
  setLabels: (labels: Labels) => void;

  // Alert configuration
  alertTerms: Terms;
  setAlertTerms: (terms: Terms) => void;
  alertCount: number;
  setAlertCount: (count: number) => void;

  // Decoder configuration
  decoders: Decoders | null;
  setDecoders: (decoders: Decoders) => void;

  // System status
  systemStatus: SystemStatus | null;
  setSystemStatus: (status: SystemStatus) => void;

  // Database info
  databaseSize: DatabaseSize | null;
  setDatabaseSize: (size: DatabaseSize) => void;

  // Version info
  version: AcarshubVersion | null;
  setVersion: (version: AcarshubVersion) => void;

  // ADS-B status
  adsbStatus: AdsbStatus | null;
  setAdsbStatus: (status: AdsbStatus) => void;

  // Signal levels
  signalLevels: Signal | null;
  setSignalLevels: (signal: Signal) => void;

  // UI state
  currentPage: string;
  setCurrentPage: (page: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

/**
 * Maximum number of messages to keep per aircraft
 * Prevents memory bloat from long-running sessions
 */
const MAX_MESSAGES_PER_AIRCRAFT = 50;

/**
 * Main Application Store
 * Uses Zustand for reactive state management
 */
export const useAppStore = create<AppState>((set) => ({
  // Connection state
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // Message state
  messages: new Map(),
  addMessage: (message) =>
    set((state) => {
      const newMessages = new Map(state.messages);

      // Determine aircraft identifier priority: tail > flight > icao
      const identifier =
        message.tail || message.flight || message.icao?.toString() || "unknown";

      // Get existing plane or create new one
      const existingPlane = newMessages.get(identifier) || {
        identifiers: [],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
      };

      // Update identifiers array with all known identifiers for this aircraft
      const identifiers = new Set(existingPlane.identifiers);
      if (message.tail) identifiers.add(message.tail);
      if (message.flight) identifiers.add(message.flight);
      if (message.icao) identifiers.add(message.icao.toString());

      // Add new message to beginning of array (newest first)
      const updatedMessages = [message, ...existingPlane.messages].slice(
        0,
        MAX_MESSAGES_PER_AIRCRAFT,
      );

      // Check for alerts (message.matched flag set by backend)
      const hasAlerts = updatedMessages.some((msg) => msg.matched);
      const numAlerts = updatedMessages.filter((msg) => msg.matched).length;

      // Update plane data
      newMessages.set(identifier, {
        identifiers: Array.from(identifiers),
        has_alerts: hasAlerts,
        num_alerts: numAlerts,
        messages: updatedMessages,
      });

      return { messages: newMessages };
    }),
  clearMessages: () => set({ messages: new Map() }),

  // Labels and metadata
  labels: {},
  setLabels: (labels) => set({ labels }),

  // Alert configuration
  alertTerms: { terms: [], ignore: [] },
  setAlertTerms: (terms) => set({ alertTerms: terms }),
  alertCount: 0,
  setAlertCount: (count) => set({ alertCount: count }),

  // Decoder configuration
  decoders: null,
  setDecoders: (decoders) => set({ decoders }),

  // System status
  systemStatus: null,
  setSystemStatus: (status) => set({ systemStatus: status }),

  // Database info
  databaseSize: null,
  setDatabaseSize: (size) => set({ databaseSize: size }),

  // Version info
  version: null,
  setVersion: (version) => set({ version }),

  // ADS-B status
  adsbStatus: null,
  setAdsbStatus: (status) => set({ adsbStatus: status }),

  // Signal levels
  signalLevels: null,
  setSignalLevels: (signal) => set({ signalLevels: signal }),

  // UI state
  currentPage: "Live Messages",
  setCurrentPage: (page) => set({ currentPage: page }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));

/**
 * Selectors for common state queries
 * Helps prevent unnecessary re-renders by selecting only needed state
 */
export const selectIsConnected = (state: AppState) => state.isConnected;
export const selectMessages = (state: AppState) => state.messages;
export const selectCurrentPage = (state: AppState) => state.currentPage;
export const selectDecoders = (state: AppState) => state.decoders;
export const selectAlertCount = (state: AppState) => state.alertCount;
export const selectAdsbEnabled = (state: AppState) =>
  state.decoders?.adsb.enabled ?? false;

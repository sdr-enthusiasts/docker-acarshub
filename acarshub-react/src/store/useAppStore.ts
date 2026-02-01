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
import {
  checkForDuplicate,
  checkMultiPartDuplicate,
  isMultiPartMessage,
  mergeMultiPartMessage,
  messageDecoder,
} from "../services/messageDecoder";
import type {
  AcarshubVersion,
  AcarsMsg,
  AdsbStatus,
  AlertTerm,
  DatabaseSize,
  Decoders,
  Labels,
  MessageGroup,
  Signal,
  SignalCountData,
  SignalFreqData,
  SystemStatus,
  Terms,
} from "../types";
import { applyAlertMatching } from "../utils/alertMatching";
import { useSettingsStore } from "./useSettingsStore";

/**
 * Application State Interface
 * Defines the complete state tree for ACARS Hub
 */
interface AppState {
  // Connection state
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Message state
  messageGroups: Map<string, MessageGroup>; // Key: primary identifier (flight/tail/icao_hex)
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

  // Statistics data
  alertTermData: AlertTerm | null;
  setAlertTermData: (data: AlertTerm) => void;
  signalFreqData: SignalFreqData | null;
  setSignalFreqData: (data: SignalFreqData) => void;
  signalCountData: SignalCountData | null;
  setSignalCountData: (data: SignalCountData) => void;

  // UI state
  currentPage: string;
  setCurrentPage: (page: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

/**
 * Get maximum number of messages to keep per message group from settings
 * Prevents memory bloat from long-running sessions
 */
const getMaxMessagesPerGroup = (): number => {
  return useSettingsStore.getState().settings.data.maxMessagesPerAircraft;
};

/**
 * Get maximum number of message groups to keep in memory from settings
 * Used for culling old groups that haven't been updated recently
 */
const getMaxMessageGroups = (): number => {
  return useSettingsStore.getState().settings.data.maxMessageGroups;
};

/**
 * Main Application Store
 * Uses Zustand for reactive state management
 */
export const useAppStore = create<AppState>((set) => ({
  // Connection state
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // Message state
  messageGroups: new Map(),
  addMessage: (message) =>
    set((state) => {
      // Decode the message if it has text
      let decodedMessage = messageDecoder.decode(message);

      // Apply alert matching (check against alert terms)
      decodedMessage = applyAlertMatching(decodedMessage, state.alertTerms);

      const newMessageGroups = new Map(state.messageGroups);

      // Extract all possible identifiers from the message
      // Prefer icao_flight (normalized ICAO format) over flight (could be IATA or ICAO)
      const messageKeys = {
        flight:
          decodedMessage.icao_flight?.trim() ||
          decodedMessage.flight?.trim() ||
          null,
        tail: decodedMessage.tail?.trim() || null,
        icao_hex: decodedMessage.icao_hex?.toUpperCase() || null,
      };

      // Find existing message group that matches any of the message's identifiers
      let matchedGroupKey: string | null = null;
      let matchedGroup: MessageGroup | null = null;

      for (const [groupKey, group] of newMessageGroups) {
        const matches =
          (messageKeys.flight &&
            group.identifiers.includes(messageKeys.flight)) ||
          (messageKeys.tail && group.identifiers.includes(messageKeys.tail)) ||
          (messageKeys.icao_hex &&
            group.identifiers.includes(messageKeys.icao_hex));

        if (matches) {
          matchedGroupKey = groupKey;
          matchedGroup = group;
          break;
        }
      }

      // Determine the primary key for this aircraft (priority: flight > tail > icao_hex)
      const primaryKey =
        messageKeys.flight ||
        messageKeys.tail ||
        messageKeys.icao_hex ||
        "unknown";

      // If we found a match but the primary key has changed, we need to update the map key
      if (matchedGroup && matchedGroupKey && matchedGroupKey !== primaryKey) {
        // Remove old key entry
        newMessageGroups.delete(matchedGroupKey);
      }

      // Get the message group data (existing or new)
      const group = matchedGroup || {
        identifiers: [],
        has_alerts: false,
        num_alerts: 0,
        messages: [],
        lastUpdated: 0,
      };

      // Merge identifiers: add any new identifiers from this message
      const identifiers = new Set(group.identifiers);
      if (messageKeys.flight) identifiers.add(messageKeys.flight);
      if (messageKeys.tail) identifiers.add(messageKeys.tail);
      if (messageKeys.icao_hex) identifiers.add(messageKeys.icao_hex);

      // Duplicate detection and multi-part message handling
      let isDuplicate = false;
      let isMultiPart = false;
      let updatedMessages = [...group.messages];

      // Check for duplicates or multi-part messages in existing group messages
      if (matchedGroup && group.messages.length > 0) {
        for (let i = 0; i < group.messages.length; i++) {
          const existingMsg = group.messages[i];

          // Check 1: Full field duplicate
          if (checkForDuplicate(existingMsg, decodedMessage)) {
            isDuplicate = true;
            // Update timestamp and increment duplicate counter
            updatedMessages[i] = {
              ...existingMsg,
              timestamp: decodedMessage.timestamp,
              duplicates: String(Number(existingMsg.duplicates || 0) + 1),
            };
            // Move this message to the front
            const movedMsg = updatedMessages[i];
            updatedMessages.splice(i, 1);
            updatedMessages.unshift(movedMsg);
            break;
          }

          // Check 2: Text field duplicate
          if (
            existingMsg.text &&
            decodedMessage.text &&
            existingMsg.text === decodedMessage.text
          ) {
            isDuplicate = true;
            // Update timestamp and increment duplicate counter
            updatedMessages[i] = {
              ...existingMsg,
              timestamp: decodedMessage.timestamp,
              duplicates: String(Number(existingMsg.duplicates || 0) + 1),
            };
            // Move this message to the front
            const movedMsg = updatedMessages[i];
            updatedMessages.splice(i, 1);
            updatedMessages.unshift(movedMsg);
            break;
          }

          // Check 3: Multi-part message
          if (isMultiPartMessage(existingMsg, decodedMessage)) {
            isMultiPart = true;

            // Check if this specific part already exists
            if (existingMsg.msgno_parts && decodedMessage.msgno) {
              const dupCheck = checkMultiPartDuplicate(
                existingMsg.msgno_parts,
                decodedMessage.msgno,
              );

              if (dupCheck.exists) {
                // This part already exists - just update the duplicate counter
                updatedMessages[i] = {
                  ...existingMsg,
                  timestamp: decodedMessage.timestamp,
                  msgno_parts: dupCheck.updatedParts,
                };
              } else {
                // New part - merge it
                updatedMessages[i] = mergeMultiPartMessage(
                  existingMsg,
                  decodedMessage,
                  messageDecoder,
                );
              }
            } else {
              // First multi-part - merge
              updatedMessages[i] = mergeMultiPartMessage(
                existingMsg,
                decodedMessage,
                messageDecoder,
              );
            }

            // Move this message to the front
            const movedMsg = updatedMessages[i];
            updatedMessages.splice(i, 1);
            updatedMessages.unshift(movedMsg);
            break;
          }
        }
      }

      // If not a duplicate or multi-part, add as new message
      if (!isDuplicate && !isMultiPart) {
        updatedMessages = [decodedMessage, ...updatedMessages];
      }

      // Limit to user's configured max messages per group
      updatedMessages = updatedMessages.slice(0, getMaxMessagesPerGroup());

      // Check for alerts (message.matched flag set by client-side alert matching)
      const hasAlerts = updatedMessages.some((msg) => msg.matched);
      const numAlerts = updatedMessages.filter((msg) => msg.matched).length;

      // Update message group data with the primary key and current timestamp
      newMessageGroups.set(primaryKey, {
        identifiers: Array.from(identifiers),
        has_alerts: hasAlerts,
        num_alerts: numAlerts,
        messages: updatedMessages,
        lastUpdated: decodedMessage.timestamp || Date.now() / 1000,
      });

      // Cull old message groups if we exceed the limit
      const maxGroups = getMaxMessageGroups();
      if (newMessageGroups.size > maxGroups) {
        // Sort groups by lastUpdated (oldest first)
        const sortedGroups = Array.from(newMessageGroups.entries()).sort(
          (a, b) => a[1].lastUpdated - b[1].lastUpdated,
        );

        // Remove oldest groups until we're at the limit
        const groupsToRemove = sortedGroups.slice(
          0,
          newMessageGroups.size - maxGroups,
        );
        for (const [key] of groupsToRemove) {
          newMessageGroups.delete(key);
        }
      }

      return { messageGroups: newMessageGroups };
    }),
  clearMessages: () => set({ messageGroups: new Map() }),

  // Labels and metadata
  labels: { labels: {} },
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

  // Statistics data
  alertTermData: null,
  setAlertTermData: (data) => set({ alertTermData: data }),
  signalFreqData: null,
  setSignalFreqData: (data) => set({ signalFreqData: data }),
  signalCountData: null,
  setSignalCountData: (data) => set({ signalCountData: data }),

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
export const selectMessageGroups = (state: AppState) => state.messageGroups;
export const selectLabels = (state: AppState) => state.labels;
export const selectSystemStatus = (state: AppState) => state.systemStatus;
export const selectAlertCount = (state: AppState) => state.alertCount;
export const selectAdsbEnabled = (state: AppState) =>
  state.decoders?.adsb.enabled ?? false;

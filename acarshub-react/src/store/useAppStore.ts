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
  ADSBData,
  AdsbStatus,
  AlertTerm,
  DatabaseSize,
  Decoders,
  Labels,
  MessageGroup,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
  SystemStatus,
  Terms,
} from "../types";
import { applyAlertMatching } from "../utils/alertMatching";
import { storeLogger } from "../utils/logger";
import { cullMessageGroups } from "../utils/messageCulling";
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

  // Alert message storage (separate from regular messages, longer persistence)
  alertMessageGroups: Map<string, MessageGroup>; // Key: primary identifier (flight/tail/icao_hex)
  addAlertMessage: (message: AcarsMsg) => void;
  clearAlertMessages: () => void;

  // Notifications state
  notifications: {
    desktop: boolean;
    sound: boolean;
    volume: number;
    onPageAlerts: boolean;
  };

  // Unread message tracking
  readMessageUids: Set<string>; // Set of message UIDs that have been read
  markMessageAsRead: (uid: string) => void;
  markMessagesAsRead: (uids: string[]) => void;
  markAllMessagesAsRead: () => void;
  markAllAlertsAsRead: () => void;
  isMessageRead: (uid: string) => boolean;
  getUnreadCount: () => number;
  getUnreadAlertCount: () => number;

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
  signalLevels: SignalLevelData | null;
  setSignalLevels: (signal: SignalLevelData) => void;

  // Statistics data
  alertTermData: AlertTerm | null;
  setAlertTermData: (data: AlertTerm) => void;
  signalFreqData: SignalFreqData | null;
  setSignalFreqData: (data: SignalFreqData) => void;
  signalCountData: SignalCountData | null;
  setSignalCountData: (data: SignalCountData) => void;

  // ADS-B aircraft data
  adsbAircraft: ADSBData | null;
  setAdsbAircraft: (data: ADSBData) => void;

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
 * Load read message UIDs from localStorage
 */
const loadReadMessageUids = (): Set<string> => {
  try {
    const stored = localStorage.getItem("acarshub.readMessages");
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch (error) {
    console.error("Failed to load read messages from localStorage:", error);
  }
  return new Set();
};

/**
 * Save read message UIDs to localStorage
 */
const saveReadMessageUids = (readUids: Set<string>) => {
  try {
    localStorage.setItem(
      "acarshub.readMessages",
      JSON.stringify(Array.from(readUids)),
    );
    storeLogger.trace("Saved read message UIDs to localStorage", {
      count: readUids.size,
    });
  } catch (error) {
    storeLogger.error("Failed to save read messages to localStorage", error);
  }
};

/**
 * Main Application Store
 * Uses Zustand for reactive state management
 */
export const useAppStore = create<AppState>((set, get) => {
  // Expose store to window in development for debugging
  if (import.meta.env.DEV) {
    // @ts-expect-error - Exposing store for dev debugging
    window.__ACARS_STORE__ = { getState: get, setState: set };
  }

  return {
    // Connection state
    isConnected: false,
    setConnected: (connected) => set({ isConnected: connected }),

    // Message state
    messageGroups: new Map(),
    notifications: {
      desktop: useSettingsStore.getState().settings.notifications.desktop,
      sound: false,
      volume: 50,
      onPageAlerts: false,
    },

    // Alert message storage
    alertMessageGroups: new Map(),
    addMessage: (message) =>
      set((state) => {
        storeLogger.trace("Processing incoming message", {
          station: message.station_id,
          label: message.label,
          hasText: !!message.text,
        });

        // Generate UID if not present (backend doesn't send UIDs)
        // Format: timestamp-random to ensure uniqueness
        if (!message.uid) {
          message.uid = `${message.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          storeLogger.trace("Generated UID for message", { uid: message.uid });
        }

        // Decode the message if it has text
        let decodedMessage = messageDecoder.decode(message);

        // Apply alert matching (check against alert terms)
        decodedMessage = applyAlertMatching(decodedMessage, state.alertTerms);

        if (decodedMessage.matched) {
          storeLogger.info("Alert match detected in message", {
            uid: decodedMessage.uid,
            matchedTerms: decodedMessage.matched_text,
          });

          // Add to separate alert storage for longer persistence
          // This happens AFTER regular message processing below
          // Check for duplicate in alert storage and add if not present
          const alertGroups = state.alertMessageGroups;
          let isDuplicateInAlerts = false;

          // Check if this message already exists in alert storage
          for (const group of alertGroups.values()) {
            if (group.messages.some((msg) => msg.uid === decodedMessage.uid)) {
              isDuplicateInAlerts = true;
              storeLogger.debug("Message already in alert storage, skipping", {
                uid: decodedMessage.uid,
              });
              break;
            }
          }

          // Only add to alert storage if not already present
          if (!isDuplicateInAlerts) {
            // Use get() to call addAlertMessage after state update completes
            // We'll do this via a separate set() call after the main message processing
            storeLogger.trace("Will add message to alert storage", {
              uid: decodedMessage.uid,
            });
          }
        }

        // Sync notifications with settings store
        const notifications = {
          ...state.notifications,
          desktop: useSettingsStore.getState().settings.notifications.desktop,
          onPageAlerts:
            useSettingsStore.getState().settings.notifications.onPageAlerts,
        };

        // Trigger desktop notification if enabled (after alert matching is complete)
        if (
          notifications.desktop &&
          decodedMessage.matched && // Only notify for alerts
          decodedMessage.timestamp &&
          Date.now() - decodedMessage.timestamp * 1000 <= 5000 // Prevent notifications for messages older than 5 seconds
        ) {
          if (Notification.permission === "granted") {
            // Debug: Log raw matched_text values
            storeLogger.debug("Raw matched_text before HTML stripping", {
              uid: decodedMessage.uid,
              rawMatchedText: decodedMessage.matched_text,
            });

            // Strip HTML tags from matched terms (notifications don't support HTML)
            const stripHtml = (text: string): string => {
              const tmp = document.createElement("div");
              tmp.innerHTML = text;
              return tmp.textContent || tmp.innerText || "";
            };

            const cleanedTerms = decodedMessage.matched_text?.length
              ? decodedMessage.matched_text.map(stripHtml).join(", ")
              : "Unknown";

            storeLogger.info("Triggering desktop notification", {
              uid: decodedMessage.uid,
              rawMatchedText: decodedMessage.matched_text,
              cleanedTerms: cleanedTerms,
            });

            const notificationBody = `Matched terms: ${cleanedTerms}`;

            storeLogger.debug("Creating notification with body", {
              uid: decodedMessage.uid,
              body: notificationBody,
              bodyLength: notificationBody.length,
            });

            const notification = new Notification("New Alert", {
              body: notificationBody,
              icon: "/static/icons/alert-icon.png",
            });

            // Focus window on notification click
            notification.onclick = () => {
              window.focus();
            };
          }
        }

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

        storeLogger.trace("Extracted message identifiers", messageKeys);

        // Find existing message group that matches any of the message's identifiers
        let matchedGroupKey: string | null = null;
        let matchedGroup: MessageGroup | null = null;

        for (const [groupKey, group] of newMessageGroups) {
          const matches =
            (messageKeys.flight &&
              group.identifiers.includes(messageKeys.flight)) ||
            (messageKeys.tail &&
              group.identifiers.includes(messageKeys.tail)) ||
            (messageKeys.icao_hex &&
              group.identifiers.includes(messageKeys.icao_hex));

          if (matches) {
            matchedGroupKey = groupKey;
            matchedGroup = group;
            storeLogger.trace("Found existing message group", {
              groupKey,
              existingMessages: group.messages.length,
            });
            break;
          }
        }

        if (!matchedGroup) {
          storeLogger.debug("Creating new message group", {
            primaryKey:
              messageKeys.flight ||
              messageKeys.tail ||
              messageKeys.icao_hex ||
              "unknown",
          });
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
              const duplicateCount = Number(existingMsg.duplicates || 0) + 1;
              storeLogger.debug("Full field duplicate detected", {
                uid: existingMsg.uid,
                duplicateCount,
              });
              // Update timestamp and increment duplicate counter
              updatedMessages[i] = {
                ...existingMsg,
                timestamp: decodedMessage.timestamp,
                duplicates: String(duplicateCount),
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
              const duplicateCount = Number(existingMsg.duplicates || 0) + 1;
              storeLogger.debug("Text field duplicate detected", {
                uid: existingMsg.uid,
                duplicateCount,
              });
              // Update timestamp and increment duplicate counter
              updatedMessages[i] = {
                ...existingMsg,
                timestamp: decodedMessage.timestamp,
                duplicates: String(duplicateCount),
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
              storeLogger.debug("Multi-part message detected", {
                existingMsgno: existingMsg.msgno,
                newMsgno: decodedMessage.msgno,
              });

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
        // ADS-B-aware culling: NEVER remove groups paired with active ADS-B aircraft
        const maxGroups = getMaxMessageGroups();
        if (newMessageGroups.size > maxGroups) {
          // If ADS-B is enabled but no data received yet, SKIP culling
          // Wait for first ADS-B data to arrive before culling with awareness
          const adsbEnabled = state.decoders?.adsb?.enabled;
          const hasAdsbData = state.adsbAircraft !== null;

          if (adsbEnabled && !hasAdsbData) {
            storeLogger.debug(
              "Skipping culling - ADS-B enabled but no data received yet",
              {
                currentGroups: newMessageGroups.size,
                maxGroups,
              },
            );
            // Don't cull yet - wait for ADS-B data
            // Continue with normal flow (calculate alert count and return)
          } else {
            // Either ADS-B is disabled OR we have ADS-B data - safe to cull
            const culledGroups = cullMessageGroups(
              newMessageGroups,
              maxGroups,
              state.adsbAircraft,
            );

            return {
              messageGroups: culledGroups,
              alertCount: Array.from(culledGroups.values()).reduce(
                (sum, group) => sum + group.num_alerts,
                0,
              ),
            };
          }
        }

        // Calculate total alert count across all message groups
        let totalAlerts = 0;
        for (const group of newMessageGroups.values()) {
          totalAlerts += group.num_alerts;
        }

        storeLogger.trace("Updated global alert count", {
          totalAlerts,
          totalGroups: newMessageGroups.size,
        });

        // If this message matched an alert term, also add to alert storage
        if (decodedMessage.matched) {
          // Check if message already exists in alert storage
          const alertGroups = state.alertMessageGroups;
          let isDuplicateInAlerts = false;

          for (const group of alertGroups.values()) {
            if (group.messages.some((msg) => msg.uid === decodedMessage.uid)) {
              isDuplicateInAlerts = true;
              break;
            }
          }

          // Add to alert storage if not a duplicate
          if (!isDuplicateInAlerts) {
            storeLogger.debug("Adding alert message to separate storage", {
              uid: decodedMessage.uid,
            });

            // Call addAlertMessage to store in separate alert storage
            // We need to do this as a nested set() call
            const currentAlertGroups = new Map(state.alertMessageGroups);

            // Extract identifiers
            const messageKeys = {
              flight:
                decodedMessage.icao_flight?.trim() ||
                decodedMessage.flight?.trim() ||
                null,
              tail: decodedMessage.tail?.trim() || null,
              icao_hex: decodedMessage.icao_hex?.toUpperCase() || null,
            };

            // Find existing alert group
            let matchedGroupKey: string | null = null;
            let matchedGroup: MessageGroup | null = null;

            for (const [groupKey, group] of currentAlertGroups) {
              const matches =
                (messageKeys.flight &&
                  group.identifiers.includes(messageKeys.flight)) ||
                (messageKeys.tail &&
                  group.identifiers.includes(messageKeys.tail)) ||
                (messageKeys.icao_hex &&
                  group.identifiers.includes(messageKeys.icao_hex));

              if (matches) {
                matchedGroupKey = groupKey;
                matchedGroup = group;
                break;
              }
            }

            const primaryKey =
              messageKeys.flight ||
              messageKeys.tail ||
              messageKeys.icao_hex ||
              "unknown";

            if (
              matchedGroup &&
              matchedGroupKey &&
              matchedGroupKey !== primaryKey
            ) {
              currentAlertGroups.delete(matchedGroupKey);
            }

            const group = matchedGroup || {
              identifiers: [],
              has_alerts: true,
              num_alerts: 0,
              messages: [],
              lastUpdated: 0,
            };

            const identifiers = new Set(group.identifiers);
            if (messageKeys.flight) identifiers.add(messageKeys.flight);
            if (messageKeys.tail) identifiers.add(messageKeys.tail);
            if (messageKeys.icao_hex) identifiers.add(messageKeys.icao_hex);

            let updatedMessages = [decodedMessage, ...group.messages];
            updatedMessages = updatedMessages.slice(
              0,
              getMaxMessagesPerGroup(),
            );

            currentAlertGroups.set(primaryKey, {
              identifiers: Array.from(identifiers),
              has_alerts: true,
              num_alerts: updatedMessages.length,
              messages: updatedMessages,
              lastUpdated: decodedMessage.timestamp || Date.now() / 1000,
            });

            // Cull alert groups if needed
            const maxGroups = getMaxMessageGroups();
            if (currentAlertGroups.size > maxGroups) {
              const sortedGroups = Array.from(
                currentAlertGroups.entries(),
              ).sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);

              const groupsToRemove = sortedGroups.slice(
                0,
                currentAlertGroups.size - maxGroups,
              );

              for (const [key] of groupsToRemove) {
                currentAlertGroups.delete(key);
              }
            }

            return {
              messageGroups: newMessageGroups,
              alertCount: totalAlerts,
              alertMessageGroups: currentAlertGroups,
            };
          }
        }

        return { messageGroups: newMessageGroups, alertCount: totalAlerts };
      }),
    clearMessages: () => {
      storeLogger.info("Clearing all message groups");
      set({ messageGroups: new Map() });
    },

    // Alert message handling (separate storage for longer persistence)
    addAlertMessage: (message) =>
      set((state) => {
        storeLogger.trace("Processing incoming alert message", {
          station: message.station_id,
          label: message.label,
          uid: message.uid,
        });

        // Generate UID if not present
        if (!message.uid) {
          message.uid = `${message.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          storeLogger.trace("Generated UID for alert message", {
            uid: message.uid,
          });
        }

        // Decode the message if it has text
        const decodedMessage = messageDecoder.decode(message);

        const newAlertGroups = new Map(state.alertMessageGroups);

        // Extract all possible identifiers from the message
        const messageKeys = {
          flight:
            decodedMessage.icao_flight?.trim() ||
            decodedMessage.flight?.trim() ||
            null,
          tail: decodedMessage.tail?.trim() || null,
          icao_hex: decodedMessage.icao_hex?.toUpperCase() || null,
        };

        // Find existing alert group that matches any of the message's identifiers
        let matchedGroupKey: string | null = null;
        let matchedGroup: MessageGroup | null = null;

        for (const [groupKey, group] of newAlertGroups) {
          const matches =
            (messageKeys.flight &&
              group.identifiers.includes(messageKeys.flight)) ||
            (messageKeys.tail &&
              group.identifiers.includes(messageKeys.tail)) ||
            (messageKeys.icao_hex &&
              group.identifiers.includes(messageKeys.icao_hex));

          if (matches) {
            matchedGroupKey = groupKey;
            matchedGroup = group;
            storeLogger.trace("Found existing alert group", {
              groupKey,
              existingMessages: group.messages.length,
            });
            break;
          }
        }

        // Determine the primary key for this aircraft
        const primaryKey =
          messageKeys.flight ||
          messageKeys.tail ||
          messageKeys.icao_hex ||
          "unknown";

        // If we found a match but the primary key has changed, update the map key
        if (matchedGroup && matchedGroupKey && matchedGroupKey !== primaryKey) {
          newAlertGroups.delete(matchedGroupKey);
        }

        // Get the message group data (existing or new)
        const group = matchedGroup || {
          identifiers: [],
          has_alerts: true, // Alert groups always have alerts
          num_alerts: 0,
          messages: [],
          lastUpdated: 0,
        };

        // Merge identifiers
        const identifiers = new Set(group.identifiers);
        if (messageKeys.flight) identifiers.add(messageKeys.flight);
        if (messageKeys.tail) identifiers.add(messageKeys.tail);
        if (messageKeys.icao_hex) identifiers.add(messageKeys.icao_hex);

        // Check for duplicates by UID (don't add same message twice)
        const isDuplicate = group.messages.some(
          (msg) => msg.uid === decodedMessage.uid,
        );

        if (isDuplicate) {
          storeLogger.debug("Skipping duplicate alert message", {
            uid: decodedMessage.uid,
          });
          return { alertMessageGroups: newAlertGroups };
        }

        // Add the new alert message
        let updatedMessages = [decodedMessage, ...group.messages];

        // Limit to user's configured max messages per group
        updatedMessages = updatedMessages.slice(0, getMaxMessagesPerGroup());

        const numAlerts = updatedMessages.length; // All messages in alert groups are alerts

        // Update alert group data
        newAlertGroups.set(primaryKey, {
          identifiers: Array.from(identifiers),
          has_alerts: true,
          num_alerts: numAlerts,
          messages: updatedMessages,
          lastUpdated: decodedMessage.timestamp || Date.now() / 1000,
        });

        // Cull old alert groups if we exceed the limit
        // Alert culling is SIMPLER: no ADS-B consideration, just oldest groups
        const maxGroups = getMaxMessageGroups();
        if (newAlertGroups.size > maxGroups) {
          storeLogger.debug("Culling alert groups", {
            currentGroups: newAlertGroups.size,
            maxGroups,
          });

          // Sort groups by lastUpdated timestamp (oldest first)
          const sortedGroups = Array.from(newAlertGroups.entries()).sort(
            (a, b) => a[1].lastUpdated - b[1].lastUpdated,
          );

          // Remove oldest groups until we're at the limit
          const groupsToRemove = sortedGroups.slice(
            0,
            newAlertGroups.size - maxGroups,
          );

          for (const [key] of groupsToRemove) {
            newAlertGroups.delete(key);
            storeLogger.debug("Culled alert group", { key });
          }
        }

        storeLogger.trace("Alert message added", {
          totalAlertGroups: newAlertGroups.size,
          totalAlertMessages: Array.from(newAlertGroups.values()).reduce(
            (sum, group) => sum + group.messages.length,
            0,
          ),
        });

        return { alertMessageGroups: newAlertGroups };
      }),
    clearAlertMessages: () => {
      storeLogger.info("Clearing all alert message groups");
      set({ alertMessageGroups: new Map() });
    },

    // Labels and metadata
    labels: { labels: {} },
    setLabels: (labels) => set({ labels }),

    // Alert configuration
    alertTerms: { terms: [], ignore: [] },
    setAlertTerms: (terms) => {
      storeLogger.debug("Alert terms updated", {
        terms: terms.terms?.length || 0,
        ignore: terms.ignore?.length || 0,
      });
      set({ alertTerms: terms });
    },
    alertCount: 0,
    setAlertCount: (count) => {
      storeLogger.trace("Alert count updated", { count });
      set({ alertCount: count });
    },

    // Decoder configuration
    decoders: null,
    setDecoders: (decoders) => {
      storeLogger.info("Decoder configuration updated", {
        acars: decoders.acars,
        vdlm: decoders.vdlm,
        hfdl: decoders.hfdl,
        imsl: decoders.imsl,
        irdm: decoders.irdm,
        adsbEnabled: decoders.adsb?.enabled,
      });
      set({ decoders });
    },

    // System status
    systemStatus: null,
    setSystemStatus: (status) => {
      storeLogger.trace("System status updated", {
        hasErrors: status.status?.error_state,
      });
      set({ systemStatus: status });
    },

    // Database info
    databaseSize: null,
    setDatabaseSize: (size) => {
      storeLogger.debug("Database size updated", {
        size: size.size,
        count: size.count,
      });
      set({ databaseSize: size });
    },

    // Version info
    version: null,
    setVersion: (version) => {
      storeLogger.info("Version information set", { version });
      set({ version });
    },

    // ADS-B status
    adsbStatus: null,
    setAdsbStatus: (status) => {
      storeLogger.trace("ADS-B status updated", status);
      set({ adsbStatus: status });
    },

    // Signal levels
    signalLevels: null,
    setSignalLevels: (signal) => {
      storeLogger.trace("Signal levels updated");
      set({ signalLevels: signal });
    },

    // Statistics data
    alertTermData: null,
    setAlertTermData: (data) => set({ alertTermData: data }),
    signalFreqData: null,
    setSignalFreqData: (data) => set({ signalFreqData: data }),
    signalCountData: null,
    setSignalCountData: (data) => set({ signalCountData: data }),

    // ADS-B aircraft data
    adsbAircraft: null,
    setAdsbAircraft: (data) => {
      storeLogger.trace("ADS-B aircraft data updated", {
        aircraftCount: data.aircraft?.length || 0,
      });
      set({ adsbAircraft: data });
    },

    // UI state
    currentPage: "Live Messages",
    setCurrentPage: (page) => set({ currentPage: page }),
    settingsOpen: false,
    setSettingsOpen: (open) => set({ settingsOpen: open }),

    // Unread message tracking
    readMessageUids: loadReadMessageUids(),

    markMessageAsRead: (uid) => {
      storeLogger.trace("Marking message as read", { uid });
      const readUids = new Set(get().readMessageUids);
      readUids.add(uid);
      saveReadMessageUids(readUids);
      set({ readMessageUids: readUids });
    },

    markMessagesAsRead: (uids) => {
      storeLogger.debug("Marking multiple messages as read", {
        count: uids.length,
      });
      const readUids = new Set(get().readMessageUids);
      for (const uid of uids) {
        readUids.add(uid);
      }
      saveReadMessageUids(readUids);
      set({ readMessageUids: readUids });
    },

    markAllMessagesAsRead: () => {
      const messageGroups = get().messageGroups;
      const newReadUids = new Set(get().readMessageUids);

      // Mark all messages in all groups as read
      for (const group of messageGroups.values()) {
        for (const message of group.messages) {
          newReadUids.add(message.uid);
        }
      }

      saveReadMessageUids(newReadUids);
      set({ readMessageUids: newReadUids });
    },

    markAllAlertsAsRead: () => {
      const messageGroups = get().messageGroups;
      const newReadUids = new Set(get().readMessageUids);

      // Mark all alert messages in all groups as read
      for (const group of messageGroups.values()) {
        for (const message of group.messages) {
          if (message.matched === true) {
            newReadUids.add(message.uid);
          }
        }
      }

      saveReadMessageUids(newReadUids);
      set({ readMessageUids: newReadUids });
      storeLogger.info("Marked all alert messages as read", {
        totalReadUids: newReadUids.size,
      });
    },

    isMessageRead: (uid) => {
      return get().readMessageUids.has(uid);
    },

    getUnreadCount: () => {
      const messageGroups = get().messageGroups;
      const readUids = get().readMessageUids;
      let unreadCount = 0;

      for (const group of messageGroups.values()) {
        for (const message of group.messages) {
          if (!readUids.has(message.uid)) {
            unreadCount++;
          }
        }
      }

      return unreadCount;
    },

    getUnreadAlertCount: () => {
      const messageGroups = get().messageGroups;
      const readUids = get().readMessageUids;
      let unreadAlertCount = 0;

      for (const group of messageGroups.values()) {
        for (const message of group.messages) {
          // Only count unread messages that match alert terms
          if (message.matched === true && !readUids.has(message.uid)) {
            unreadAlertCount++;
          }
        }
      }

      return unreadAlertCount;
    },
  };
});

/**
 * Selectors for common state queries
 * Helps prevent unnecessary re-renders by selecting only needed state
 */
export const selectIsConnected = (state: AppState) => state.isConnected;
export const selectMessageGroups = (state: AppState) => state.messageGroups;
export const selectLabels = (state: AppState) => state.labels;
export const selectSystemStatus = (state: AppState) => state.systemStatus;
export const selectAlertCount = (state: AppState) => state.alertCount;
export const selectUnreadAlertCount = (state: AppState) =>
  state.getUnreadAlertCount();
export const selectAdsbEnabled = (state: AppState) =>
  state.decoders?.adsb.enabled ?? false;

/**
 * Expose store to window in development/test mode for E2E testing
 * This allows Playwright tests to inject state (e.g., decoder configuration)
 * Production builds will tree-shake this away
 */
if (import.meta.env.MODE === "development" || import.meta.env.MODE === "test") {
  // @ts-expect-error - Required for E2E testing window exposure
  window.__ACARS_STORE__ = useAppStore;
}

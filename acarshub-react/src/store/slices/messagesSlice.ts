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

// ----------------------------------------------------------------------------
// GOD-07: extracted from store/useAppStore.ts. Message ingestion: regular
// message groups and the separate (longer-persistence) alert message
// groups, both populated by the same incoming-message pipeline.
//
// addMessage() reads `state.decoders`/`state.adsbAircraft`/
// `state.readMessageUids` (connection/adsb/readState slices) for ADS-B-aware
// culling and read-state reset on duplicate promotion. Rather than
// importing those other slices' interfaces (which would create a
// slices/*.ts type-only import cycle — TypeScript resolves those fine at
// compile time, but `just madge`'s cycle detector does not distinguish
// `import type` from value imports, so a real cycle-shaped edge would still
// fail CI), this file declares a local MessagesSliceDependencies interface
// with just the field types it needs, sourced from ../../types directly.
// See store/slices/types.ts for why the *combined* AppState type still
// exists (useAppStore.ts, the composition root, needs it) and why only
// leaf-only imports from there are safe.
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import {
  checkForDuplicate,
  checkMultiPartDuplicate,
  isMultiPartMessage,
  mergeMultiPartMessage,
  mergeStringArrays,
} from "../../services/messageDecoder";
import type { AcarsMsg, ADSBData, Decoders, MessageGroup } from "../../types";
import { storeLogger } from "../../utils/logger";
import { cullMessageGroups } from "../../utils/messageCulling";
import { useSettingsStore } from "../useSettingsStore";
import { saveReadMessageUids } from "./readStateSlice";

/**
 * Fields this slice reads from other slices (connection/adsb/readState), but
 * does not own or write. See the file-level comment above for why these are
 * declared locally instead of imported from the owning slice's interface.
 */
interface MessagesSliceDependencies {
  decoders: Decoders | null;
  adsbAircraft: ADSBData | null;
  readMessageUids: Set<string>;
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

export interface MessagesSlice {
  // Message state
  messageGroups: Map<string, MessageGroup>; // Key: primary identifier (flight/tail/icao_hex)
  addMessage: (message: AcarsMsg) => void;
  clearMessages: () => void;

  // Alert message storage (separate from regular messages, longer persistence)
  alertMessageGroups: Map<string, MessageGroup>; // Key: primary identifier (flight/tail/icao_hex)
  addAlertMessage: (message: AcarsMsg) => void;
  clearAlertMessages: () => void;

  // Notifications state — internal bookkeeping synced from the settings
  // store inside addMessage(); no external consumer reads this field.
  notifications: {
    desktop: boolean;
    sound: boolean;
    volume: number;
    onPageAlerts: boolean;
  };
}

export const createMessagesSlice: StateCreator<
  MessagesSlice & MessagesSliceDependencies,
  [],
  [],
  MessagesSlice
> = (set) => ({
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
      storeLogger.debug("Processing incoming message", {
        station: message.station_id,
        label: message.label,
        hasText: !!message.text,
        hasTextKey: "text" in message,
        hasMsgText: "msg_text" in message,
        textLength: message.text?.length || 0,
        textPreview: message.text?.substring(0, 50) || "(no text)",
        uid: message.uid,
        matched: message.matched,
        matchedType: typeof message.matched,
        hasMatchedKey: "matched" in message,
        flight: message.flight,
        tail: message.tail,
        icao_hex: message.icao_hex,
      });

      // Generate UID if not present (backend doesn't send UIDs)
      // Format: timestamp-random to ensure uniqueness
      if (!message.uid) {
        message.uid = `${message.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        storeLogger.trace("Generated UID for message", { uid: message.uid });
      }

      // Backend has already decoded the message text and set matched flags.
      // No client-side decoding or matching needed.
      const decodedMessage = message;

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

      let newMessageGroups = new Map(state.messageGroups);

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
          (messageKeys.tail && group.identifiers.includes(messageKeys.tail)) ||
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
      // Track the UID of any message promoted to the front so its read state
      // can be reset — a promoted duplicate is newly relevant to the user.
      let promotedUid: string | undefined;

      // Check for duplicates or multi-part messages in existing group messages
      if (matchedGroup && group.messages.length > 0) {
        for (let i = 0; i < group.messages.length; i++) {
          const existingMsg = group.messages[i];

          // Check 0: UID duplicate (exact same message)
          if (
            existingMsg.uid &&
            decodedMessage.uid &&
            existingMsg.uid === decodedMessage.uid
          ) {
            isDuplicate = true;
            storeLogger.warn("UID duplicate detected - SKIPPING MESSAGE", {
              uid: decodedMessage.uid,
              existingMsgFlight: existingMsg.flight,
              newMsgFlight: decodedMessage.flight,
              groupKey: matchedGroupKey,
            });
            break;
          }

          // Check 1: Full field duplicate
          if (checkForDuplicate(existingMsg, decodedMessage)) {
            isDuplicate = true;
            const duplicateCount = Number(existingMsg.duplicates || 0) + 1;
            storeLogger.debug("Full field duplicate detected", {
              uid: existingMsg.uid,
              duplicateCount,
            });
            // Update timestamp and increment duplicate counter.
            // Carry forward matched state: once matched, always matched.
            // If the incoming copy of the message carries alert metadata that
            // the stored copy lacks (e.g. alert terms were updated after the
            // first receipt), the merged result must reflect that.
            updatedMessages[i] = {
              ...existingMsg,
              timestamp: decodedMessage.timestamp,
              duplicates: String(duplicateCount),
              matched: !!(existingMsg.matched || decodedMessage.matched),
              matched_text: mergeStringArrays(
                existingMsg.matched_text,
                decodedMessage.matched_text,
              ),
              matched_icao: mergeStringArrays(
                existingMsg.matched_icao,
                decodedMessage.matched_icao,
              ),
              matched_tail: mergeStringArrays(
                existingMsg.matched_tail,
                decodedMessage.matched_tail,
              ),
              matched_flight: mergeStringArrays(
                existingMsg.matched_flight,
                decodedMessage.matched_flight,
              ),
            };
            // Track so we can reset the read state after the loop
            promotedUid = existingMsg.uid;
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
            // Update timestamp and increment duplicate counter.
            // Carry forward matched state (same reasoning as Check 1 above).
            updatedMessages[i] = {
              ...existingMsg,
              timestamp: decodedMessage.timestamp,
              duplicates: String(duplicateCount),
              matched: !!(existingMsg.matched || decodedMessage.matched),
              matched_text: mergeStringArrays(
                existingMsg.matched_text,
                decodedMessage.matched_text,
              ),
              matched_icao: mergeStringArrays(
                existingMsg.matched_icao,
                decodedMessage.matched_icao,
              ),
              matched_tail: mergeStringArrays(
                existingMsg.matched_tail,
                decodedMessage.matched_tail,
              ),
              matched_flight: mergeStringArrays(
                existingMsg.matched_flight,
                decodedMessage.matched_flight,
              ),
            };
            // Track so we can reset the read state after the loop
            promotedUid = existingMsg.uid;
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
                // This part already exists - just update the duplicate counter.
                // Carry forward matched state here too.
                updatedMessages[i] = {
                  ...existingMsg,
                  timestamp: decodedMessage.timestamp,
                  msgno_parts: dupCheck.updatedParts,
                  matched: !!(existingMsg.matched || decodedMessage.matched),
                  matched_text: mergeStringArrays(
                    existingMsg.matched_text,
                    decodedMessage.matched_text,
                  ),
                  matched_icao: mergeStringArrays(
                    existingMsg.matched_icao,
                    decodedMessage.matched_icao,
                  ),
                  matched_tail: mergeStringArrays(
                    existingMsg.matched_tail,
                    decodedMessage.matched_tail,
                  ),
                  matched_flight: mergeStringArrays(
                    existingMsg.matched_flight,
                    decodedMessage.matched_flight,
                  ),
                };
              } else {
                // New part - merge it
                updatedMessages[i] = mergeMultiPartMessage(
                  existingMsg,
                  decodedMessage,
                );
              }
            } else {
              // First multi-part - merge
              updatedMessages[i] = mergeMultiPartMessage(
                existingMsg,
                decodedMessage,
              );
            }

            // Track so we can reset the read state after the loop
            promotedUid = existingMsg.uid;
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
          // Continue with normal flow (calculate alert count and process alerts below)
        } else {
          // Either ADS-B is disabled OR we have ADS-B data - safe to cull
          newMessageGroups = cullMessageGroups(
            newMessageGroups,
            maxGroups,
            state.adsbAircraft,
          );
        }
      }

      // Calculate total alert count across all message groups
      // Calculate total alert count across all message groups (if not already calculated during culling)
      const totalAlerts = Array.from(newMessageGroups.values()).reduce(
        (sum, group) => sum + group.num_alerts,
        0,
      );

      storeLogger.trace("Updated global alert count", {
        totalAlerts,
        totalGroups: newMessageGroups.size,
      });

      // Process alert storage BEFORE any early returns
      // This ensures alerts are always added regardless of culling path
      let updatedAlertGroups = state.alertMessageGroups;

      if (decodedMessage.matched) {
        storeLogger.info(
          "Message IS matched - proceeding to add to alertMessageGroups",
          {
            uid: decodedMessage.uid,
          },
        );

        // Check if message already exists in alert storage
        let isDuplicateInAlerts = false;

        for (const group of state.alertMessageGroups.values()) {
          if (group.messages.some((msg) => msg.uid === decodedMessage.uid)) {
            isDuplicateInAlerts = true;
            break;
          }
        }

        // Add to alert storage if not a duplicate
        if (!isDuplicateInAlerts) {
          storeLogger.info("Adding NEW alert message to alertMessageGroups", {
            uid: decodedMessage.uid,
            flight: decodedMessage.flight,
            tail: decodedMessage.tail,
            currentAlertGroupCount: state.alertMessageGroups.size,
          });

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
          updatedMessages = updatedMessages.slice(0, getMaxMessagesPerGroup());

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
            const sortedGroups = Array.from(currentAlertGroups.entries()).sort(
              (a, b) => a[1].lastUpdated - b[1].lastUpdated,
            );

            const groupsToRemove = sortedGroups.slice(
              0,
              currentAlertGroups.size - maxGroups,
            );

            for (const [key] of groupsToRemove) {
              currentAlertGroups.delete(key);
            }
          }

          storeLogger.info("Updated alertMessageGroups", {
            newAlertGroupCount: currentAlertGroups.size,
            previousCount: state.alertMessageGroups.size,
            groupsAdded:
              currentAlertGroups.size - state.alertMessageGroups.size,
          });

          updatedAlertGroups = currentAlertGroups;
        } else {
          storeLogger.warn(
            "Alert message is DUPLICATE in alert storage - skipping",
            {
              uid: decodedMessage.uid,
              currentAlertGroupCount: state.alertMessageGroups.size,
            },
          );
        }
      }

      storeLogger.debug("Final return - message processing complete", {
        uid: decodedMessage.uid,
        matched: decodedMessage.matched,
        returningAlertGroups: decodedMessage.matched,
      });

      // If a duplicate message was promoted, remove it from the read set so
      // the card shows as unread again — the message is newly relevant.
      let updatedReadMessageUids = state.readMessageUids;
      if (promotedUid && state.readMessageUids.has(promotedUid)) {
        const newReadUids = new Set(state.readMessageUids);
        newReadUids.delete(promotedUid);
        saveReadMessageUids(newReadUids);
        updatedReadMessageUids = newReadUids;
        storeLogger.debug("Reset read state for promoted duplicate", {
          uid: promotedUid,
        });
      }

      return {
        messageGroups: newMessageGroups,
        alertCount: totalAlerts,
        alertMessageGroups: updatedAlertGroups,
        readMessageUids: updatedReadMessageUids,
      };
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

      // Backend has already decoded the message text. Use it directly.
      const decodedMessage = message;

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
          (messageKeys.tail && group.identifiers.includes(messageKeys.tail)) ||
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
        storeLogger.warn("SKIPPING DUPLICATE ALERT MESSAGE BY UID", {
          uid: decodedMessage.uid,
          flight: decodedMessage.flight,
          tail: decodedMessage.tail,
          groupKey: primaryKey,
          existingCount: group.messages.length,
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
});

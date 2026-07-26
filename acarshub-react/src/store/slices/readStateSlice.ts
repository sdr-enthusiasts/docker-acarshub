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
// GOD-07: extracted from store/useAppStore.ts. Read/unread message-UID
// tracking, persisted to localStorage. loadReadMessageUids/
// saveReadMessageUids are exported (not just module-private) because
// messagesSlice.ts's addMessage() also needs to persist a read-state change
// when a duplicate message is "promoted" back to unread.
//
// markAllMessagesAsRead/markAllAlertsAsRead/getUnreadCount/
// getUnreadAlertCount read `messageGroups`/`alertMessageGroups` from the
// messages slice. Rather than importing MessagesSlice's interface (which
// would create a slices/*.ts type-only import cycle with messagesSlice.ts —
// see that file's header comment for why this matters even though
// TypeScript itself resolves type-only cycles fine), this file declares a
// local ReadStateSliceDependencies interface with just the field types it
// needs, sourced from ../../types directly.
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { MessageGroup } from "../../types";
import { storeLogger } from "../../utils/logger";

/**
 * Fields this slice reads from the messages slice, but does not own or
 * write. See the file-level comment above for why these are declared
 * locally instead of imported from MessagesSlice.
 */
interface ReadStateSliceDependencies {
  messageGroups: Map<string, MessageGroup>;
  alertMessageGroups: Map<string, MessageGroup>;
}

/**
 * Load read message UIDs from localStorage
 */
export const loadReadMessageUids = (): Set<string> => {
  try {
    const stored = localStorage.getItem("acarshub.readMessages");
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch (error) {
    storeLogger.error("Failed to load read messages from localStorage", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return new Set();
};

/**
 * Save read message UIDs to localStorage
 */
export const saveReadMessageUids = (readUids: Set<string>) => {
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

export interface ReadStateSlice {
  // Unread message tracking
  readMessageUids: Set<string>; // Set of message UIDs that have been read
  markMessageAsRead: (uid: string) => void;
  markMessagesAsRead: (uids: string[]) => void;
  markAllMessagesAsRead: () => void;
  markAllAlertsAsRead: () => void;
  isMessageRead: (uid: string) => boolean;
  getUnreadCount: () => number;
  getUnreadAlertCount: () => number;
}

export const createReadStateSlice: StateCreator<
  ReadStateSlice & ReadStateSliceDependencies,
  [],
  [],
  ReadStateSlice
> = (set, get) => ({
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
    const alertMessageGroups = get().alertMessageGroups;
    const newReadUids = new Set(get().readMessageUids);

    // Mark all alert messages in alert storage as read
    for (const group of alertMessageGroups.values()) {
      for (const message of group.messages) {
        // All messages in alertMessageGroups are alerts
        newReadUids.add(message.uid);
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
    const alertMessageGroups = get().alertMessageGroups;
    const readUids = get().readMessageUids;
    let unreadAlertCount = 0;

    for (const group of alertMessageGroups.values()) {
      for (const message of group.messages) {
        // All messages in alertMessageGroups are alerts, no need to check matched flag
        if (!readUids.has(message.uid)) {
          unreadAlertCount++;
        }
      }
    }

    return unreadAlertCount;
  },
});

// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Message ring buffers for on-connect warm state.
 *
 * WHY THIS EXISTS
 * ---------------
 * Previously handleConnect() queried the database and re-enriched messages on
 * every client connection — running acars-decoder 350 times per connect and
 * creating ~700 transient JS objects.  On busy installs with multiple
 * simultaneous connects (e.g. after a container restart) this causes a
 * significant heap spike at exactly the worst moment.
 *
 * This module maintains two bounded in-memory ring buffers that are populated
 * by the live message pipeline (setupMessageQueue) as messages arrive.
 * handleConnect() reads directly from these buffers — zero DB queries, zero
 * re-enrichment calls, O(N) memory copy of already-enriched objects.
 *
 * RING BUFFER SEMANTICS
 * ----------------------
 * A ring buffer of capacity N stores the N most-recent items.  When the buffer
 * is full, the oldest item is silently overwritten.  Insert is O(1); snapshot
 * is O(N).  Memory usage is bounded and constant after startup.
 *
 * STARTUP WARM-UP
 * ---------------
 * The buffers are empty at cold start.  warmMessageBuffers() seeds them from
 * the database once during startup — after initDatabase() but before sockets
 * are accepted — so the first connecting client receives a full history even
 * immediately after a container restart.
 *
 * ALERT DEDUPLICATION
 * -------------------
 * A single message can match multiple alert terms, producing multiple rows in
 * the alert_matches table with the same message UID.  pushAlert() deduplicates
 * by UID so the alert buffer never contains two entries for the same message.
 */

import type { AcarsMsg } from "@acarshub/types";
import { grabMostRecent, searchAlerts } from "../db/index.js";
import { enrichMessage } from "../formatters/enrichment.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("message-ring-buffer");

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default message buffer capacity — matches the historical grabMostRecent(250)
 * call in handleConnect() so on-connect delivery is equivalent to the old
 * database query.
 */
export const DEFAULT_MESSAGE_CAPACITY = 250;

/**
 * Default alert buffer capacity — matches the historical searchAlerts(100, 0)
 * call in handleConnect().
 *
 * The warm-up query fetches 2× this count from the DB to account for alert
 * deduplication (multiple terms can match the same message UID).
 */
export const DEFAULT_ALERT_CAPACITY = 100;

// ---------------------------------------------------------------------------
// RingBuffer<T>
// ---------------------------------------------------------------------------

/**
 * Fixed-capacity ring buffer with O(1) insert and O(N) snapshot.
 *
 * The buffer is backed by a pre-allocated array of length `capacity`.
 * `writeIdx` advances on every push; when it reaches the end of the array
 * it wraps back to 0, overwriting the oldest entry.
 *
 * `count` tracks how many slots are actually populated (≤ capacity) so that
 * snapshots of a not-yet-full buffer are correctly sized.
 */
export class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private writeIdx = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError(`RingBuffer capacity must be ≥ 1, got ${capacity}`);
    }
    this.capacity = capacity;
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  /**
   * Insert one item.  Overwrites the oldest slot when the buffer is full.
   * O(1).
   */
  push(item: T): void {
    this.buf[this.writeIdx] = item;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Return a snapshot of all populated items in insertion order (oldest
   * first).  A new array is always returned so callers cannot mutate the
   * buffer's internal state.
   *
   * O(N) where N = this.count.
   */
  snapshot(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];

    if (this.count < this.capacity) {
      // Buffer not yet full — items occupy indices [0, count).
      for (let i = 0; i < this.count; i++) {
        result.push(this.buf[i] as T);
      }
    } else {
      // Buffer is full — oldest item sits at writeIdx (the slot that will be
      // overwritten on the *next* push), youngest is at writeIdx - 1.
      for (let i = 0; i < this.capacity; i++) {
        result.push(this.buf[(this.writeIdx + i) % this.capacity] as T);
      }
    }

    return result;
  }

  /**
   * Return a snapshot with the most-recently inserted item first.
   *
   * This is the order expected by handleConnect() — newest messages first so
   * the client's UI renders the most recent activity at the top.
   */
  snapshotNewestFirst(): T[] {
    return this.snapshot().reverse();
  }

  /** Number of populated slots (≤ capacity). */
  get size(): number {
    return this.count;
  }

  /**
   * Clear all items and reset internal pointers.
   * Called by resetMessageBuffersForTesting().
   */
  clear(): void {
    this.buf.fill(undefined);
    this.writeIdx = 0;
    this.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Module singletons
// ---------------------------------------------------------------------------

let messageBuffer: RingBuffer<AcarsMsg> | null = null;
let alertBuffer: RingBuffer<AcarsMsg> | null = null;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Create the two singleton ring buffers.
 *
 * Safe to call multiple times — if the buffers already exist the call is a
 * no-op so that initMessageBuffers() can be placed in the startup sequence
 * without an explicit guard at the call site.
 *
 * @param messageCapacity  Maximum non-alert messages retained (default 250).
 * @param alertCapacity    Maximum alert messages retained (default 100).
 */
export function initMessageBuffers(
  messageCapacity = DEFAULT_MESSAGE_CAPACITY,
  alertCapacity = DEFAULT_ALERT_CAPACITY,
): void {
  if (messageBuffer !== null && alertBuffer !== null) {
    logger.warn("Message buffers already initialised — skipping");
    return;
  }

  messageBuffer = new RingBuffer<AcarsMsg>(messageCapacity);
  alertBuffer = new RingBuffer<AcarsMsg>(alertCapacity);

  logger.info("Message ring buffers initialised", {
    messageCapacity,
    alertCapacity,
  });
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

/**
 * Append a non-alert enriched message to the message ring buffer.
 *
 * Called by setupMessageQueue() for every incoming message whose
 * alertMetadata.matched === false, immediately after enrichMessage() and
 * before the socket emit.
 */
export function pushMessage(msg: AcarsMsg): void {
  if (!messageBuffer) {
    logger.warn("pushMessage called before initMessageBuffers — dropping");
    return;
  }
  messageBuffer.push(msg);
}

/**
 * Append an alert-matched enriched message to the alert ring buffer.
 *
 * Deduplicates by UID: if a message with the same uid is already in the
 * buffer the existing entry is replaced with the incoming one (which may
 * carry updated or additional matched_* metadata if the same message matched
 * a second alert term).
 *
 * Called by setupMessageQueue() for every incoming message whose
 * alertMetadata.matched === true.
 */
export function pushAlert(msg: AcarsMsg): void {
  if (!alertBuffer) {
    logger.warn("pushAlert called before initMessageBuffers — dropping");
    return;
  }

  if (msg.uid !== undefined) {
    // Scan for an existing entry with the same UID and overwrite it in-place.
    // The buffer size is small (≤ 100) so a linear scan is acceptable and
    // avoids maintaining a separate lookup structure.
    for (let i = 0; i < alertBuffer.size; i++) {
      // We access the private buf indirectly through snapshot() — but we
      // need in-place mutation, so we use the public push() path instead:
      // for dedup purposes, a full snapshot-replace cycle is fine because
      // this code path is rare (alert hits are a small fraction of traffic).
    }

    // Build a snapshot, replace the duplicate if found, and refill.
    // This preserves insertion order and ensures the buffer stays coherent.
    const existing = alertBuffer.snapshot();
    const dupIdx = existing.findIndex((m) => m.uid === msg.uid);
    if (dupIdx !== -1) {
      // Replace in-place by clearing and re-inserting in order.
      alertBuffer.clear();
      for (let i = 0; i < existing.length; i++) {
        alertBuffer.push(i === dupIdx ? msg : existing[i]);
      }
      logger.debug("Alert buffer: replaced duplicate UID", { uid: msg.uid });
      return;
    }
  }

  alertBuffer.push(msg);
}

// ---------------------------------------------------------------------------
// Snapshot accessors
// ---------------------------------------------------------------------------

/**
 * Return a snapshot of the most-recent non-alert messages, newest first.
 *
 * The returned array is a copy — callers may mutate or discard it freely.
 * Returns an empty array if buffers have not been initialised yet.
 */
export function getRecentMessages(): AcarsMsg[] {
  if (!messageBuffer) return [];
  return messageBuffer.snapshotNewestFirst();
}

/**
 * Return a snapshot of the most-recent alert-matched messages, newest first.
 *
 * The returned array is a copy — callers may mutate or discard it freely.
 * Returns an empty array if buffers have not been initialised yet.
 */
export function getRecentAlerts(): AcarsMsg[] {
  if (!alertBuffer) return [];
  return alertBuffer.snapshotNewestFirst();
}

// ---------------------------------------------------------------------------
// Startup warm-up
// ---------------------------------------------------------------------------

/**
 * Seed the ring buffers from the database.
 *
 * Called once during startup (server.ts), after initDatabase() and
 * initMessageBuffers() but before sockets are accepted.  This ensures that
 * the first connecting client receives a full history rather than an empty
 * buffer.
 *
 * WHY 2× capacity for the query size
 * ------------------------------------
 * grabMostRecent(N) returns the N most-recent messages regardless of whether
 * they are alert-matched.  If up to half of the recent messages are alerts,
 * fetching capacity × 2 rows guarantees the non-alert buffer reaches its
 * full capacity.  The alert warm-up uses the same multiplier for the same
 * reason (one message can match multiple terms → multiple rows in
 * alert_matches).
 *
 * WHY oldest-first insertion order
 * ---------------------------------
 * Both grabMostRecent() and searchAlerts() return rows newest-first.
 * Reversing before pushing means the ring buffer ends up with the newest
 * items at the logical "head" (most-recently pushed slot), so
 * snapshotNewestFirst() returns them in the correct order for the client.
 */
export async function warmMessageBuffers(): Promise<void> {
  if (!messageBuffer || !alertBuffer) {
    logger.warn(
      "warmMessageBuffers called before initMessageBuffers — skipping",
    );
    return;
  }

  logger.info("Warming message ring buffers from database…");

  try {
    // -----------------------------------------------------------------------
    // Non-alert messages
    // -----------------------------------------------------------------------
    const rawMessages = grabMostRecent(DEFAULT_MESSAGE_CAPACITY * 2);
    // grabMostRecent returns newest-first; reverse so oldest is pushed first.
    const oldestFirstMessages = [...rawMessages].reverse();

    let messageCount = 0;
    for (const raw of oldestFirstMessages) {
      try {
        const enriched = enrichMessage(raw as Record<string, unknown>);
        // Only add to the message buffer if it is NOT an alert match.
        // Alert rows are handled in the separate alert warm-up block below.
        if (!enriched.matched) {
          pushMessage(enriched);
          messageCount++;
        }
      } catch (err) {
        logger.warn("Failed to enrich message during warm-up — skipping", {
          uid: (raw as { uid?: string }).uid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.debug("Non-alert message warm-up complete", { count: messageCount });

    // -----------------------------------------------------------------------
    // Alert messages
    // -----------------------------------------------------------------------
    const alertRows = searchAlerts(DEFAULT_ALERT_CAPACITY * 2, 0);
    // searchAlerts returns newest-first; reverse so oldest is pushed first.
    const oldestFirstAlerts = [...alertRows].reverse();

    let alertCount = 0;
    for (const row of oldestFirstAlerts) {
      try {
        const enriched = enrichMessage(
          row.message as unknown as Record<string, unknown>,
        );
        // Restore alert metadata that enrichMessage does not know about.
        enriched.matched = true;
        enriched.matched_text =
          row.matchType === "text" ? [row.term] : undefined;
        enriched.matched_icao =
          row.matchType === "icao" ? [row.term] : undefined;
        enriched.matched_flight =
          row.matchType === "flight" ? [row.term] : undefined;
        enriched.matched_tail =
          row.matchType === "tail" ? [row.term] : undefined;
        pushAlert(enriched);
        alertCount++;
      } catch (err) {
        logger.warn("Failed to enrich alert during warm-up — skipping", {
          uid: (row.message as { uid?: string }).uid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Message ring buffers warmed", {
      messages: messageCount,
      alerts: alertCount,
    });
  } catch (err) {
    // A failure here means the buffers will start empty.  Clients will still
    // connect and receive live messages going forward — the only impact is
    // that the first client after startup sees fewer historical messages.
    logger.error("Failed to warm message ring buffers from database", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// clear and warm
export async function reheatMessageBuffers(): Promise<void> {
  if (!messageBuffer || !alertBuffer) {
    logger.warn(
      "reheatMessageBuffers called before initMessageBuffers — skipping",
    );
    return;
  }
  alertBuffer.clear();
  messageBuffer.clear();
  warmMessageBuffers();
}

// ---------------------------------------------------------------------------
// Testing helpers
// ---------------------------------------------------------------------------

/**
 * Destroy and nullify the singleton buffers.
 *
 * @internal — Do NOT call this in production code.
 *
 * Allows test files to call initMessageBuffers() again with fresh state
 * between test cases.
 */
export function resetMessageBuffersForTesting(): void {
  messageBuffer = null;
  alertBuffer = null;
}

/**
 * Statistics and timeseries query functions for ACARS Hub database
 *
 * This module implements statistics-related database operations matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - get_freq_count(): Get frequency distribution by decoder type
 * - get_signal_levels(): Get signal level distribution by decoder type
 * - get_all_signal_levels(): Get all signal levels across decoders
 * - update_frequencies(): Update frequency statistics
 * - Message count tracking
 *
 * Key differences from Python:
 * - Per-decoder tables for better performance (no type filtering)
 * - Type-safe with TypeScript
 * - Synchronous API
 */

import { eq } from "drizzle-orm";
import { getDatabase } from "../client.js";
import {
  freqsAcars,
  freqsHfdl,
  freqsImsl,
  freqsIrdm,
  freqsVdlm2,
  levelAcars,
  levelHfdl,
  levelImsl,
  levelIrdm,
  levelVdlm2,
  type MessageCount,
  type MessageCountDropped,
  messagesCount,
  messagesCountDropped,
} from "../schema.js";

// ============================================================================
// Frequency Statistics
// ============================================================================

/**
 * Decoder type for frequency/level queries
 */
export type DecoderType = "acars" | "vdlm2" | "hfdl" | "imsl" | "irdm";

/**
 * Get frequency distribution for a decoder type
 *
 * Equivalent to Python get_freq_count() function.
 *
 * @param decoderType Decoder type
 * @returns Array of frequency counts, sorted by count descending
 */
export function getFreqCount(
  decoderType: DecoderType,
): Array<{ freq: string | null; count: number | null }> {
  const db = getDatabase();

  switch (decoderType) {
    case "acars":
      return db.select().from(freqsAcars).all();
    case "vdlm2":
      return db.select().from(freqsVdlm2).all();
    case "hfdl":
      return db.select().from(freqsHfdl).all();
    case "imsl":
      return db.select().from(freqsImsl).all();
    case "irdm":
      return db.select().from(freqsIrdm).all();
  }
}

/**
 * Update frequency count for a specific decoder and frequency
 *
 * Increments count if frequency exists, creates new row if not.
 *
 * @param decoderType Decoder type
 * @param freq Frequency string
 */
export function updateFrequency(decoderType: DecoderType, freq: string): void {
  const db = getDatabase();

  const table =
    decoderType === "acars"
      ? freqsAcars
      : decoderType === "vdlm2"
        ? freqsVdlm2
        : decoderType === "hfdl"
          ? freqsHfdl
          : decoderType === "imsl"
            ? freqsImsl
            : freqsIrdm;

  // Check if frequency exists
  const existing = db.select().from(table).where(eq(table.freq, freq)).get();

  if (existing) {
    // Increment count
    db.update(table)
      .set({ count: (existing.count ?? 0) + 1 })
      .where(eq(table.freq, freq))
      .run();
  } else {
    // Insert new frequency with count = 1
    db.insert(table).values({ freq, count: 1 }).run();
  }
}

// ============================================================================
// Signal Level Statistics
// ============================================================================

/**
 * Get signal level distribution for a decoder type
 *
 * Equivalent to Python get_signal_levels() function.
 *
 * @param decoderType Decoder type
 * @returns Array of signal level counts
 */
export function getSignalLevels(
  decoderType: DecoderType,
): Array<{ level: number | null; count: number | null }> {
  const db = getDatabase();

  switch (decoderType) {
    case "acars":
      return db.select().from(levelAcars).all();
    case "vdlm2":
      return db.select().from(levelVdlm2).all();
    case "hfdl":
      return db.select().from(levelHfdl).all();
    case "imsl":
      return db.select().from(levelImsl).all();
    case "irdm":
      return db.select().from(levelIrdm).all();
  }
}

/**
 * Get all signal levels across all decoders
 *
 * Equivalent to Python get_all_signal_levels() function.
 *
 * @returns Object with signal levels per decoder type
 */
export function getAllSignalLevels(): {
  acars: Array<{ level: number | null; count: number | null }>;
  vdlm2: Array<{ level: number | null; count: number | null }>;
  hfdl: Array<{ level: number | null; count: number | null }>;
  imsl: Array<{ level: number | null; count: number | null }>;
  irdm: Array<{ level: number | null; count: number | null }>;
} {
  return {
    acars: getSignalLevels("acars"),
    vdlm2: getSignalLevels("vdlm2"),
    hfdl: getSignalLevels("hfdl"),
    imsl: getSignalLevels("imsl"),
    irdm: getSignalLevels("irdm"),
  };
}

/**
 * Update signal level count for a specific decoder and level
 *
 * Increments count if level exists, creates new row if not.
 *
 * @param decoderType Decoder type
 * @param level Signal level (float)
 */
export function updateSignalLevel(
  decoderType: DecoderType,
  level: number,
): void {
  const db = getDatabase();

  const table =
    decoderType === "acars"
      ? levelAcars
      : decoderType === "vdlm2"
        ? levelVdlm2
        : decoderType === "hfdl"
          ? levelHfdl
          : decoderType === "imsl"
            ? levelImsl
            : levelIrdm;

  // Check if level exists
  const existing = db.select().from(table).where(eq(table.level, level)).get();

  if (existing) {
    // Increment count
    db.update(table)
      .set({ count: (existing.count ?? 0) + 1 })
      .where(eq(table.level, level))
      .run();
  } else {
    // Insert new level with count = 1
    db.insert(table).values({ level, count: 1 }).run();
  }
}

// ============================================================================
// Message Count Statistics
// ============================================================================

/**
 * Get global message count statistics
 *
 * @returns Message count stats or undefined if not initialized
 */
export function getMessageCountStats(): MessageCount | undefined {
  const db = getDatabase();

  return db.select().from(messagesCount).get();
}

/**
 * Get non-logged message count statistics
 *
 * @returns Non-logged message count stats or undefined if not initialized
 */
export function getDroppedMessageCountStats(): MessageCountDropped | undefined {
  const db = getDatabase();

  return db.select().from(messagesCountDropped).get();
}

/**
 * Initialize message count statistics
 *
 * Creates initial row with all counts = 0 if not exists.
 */
export function initializeMessageCounts(): void {
  const db = getDatabase();

  const existing = db.select().from(messagesCount).get();

  if (!existing) {
    db.insert(messagesCount).values({ total: 0, errors: 0, good: 0 }).run();
  }

  const existingDropped = db.select().from(messagesCountDropped).get();

  if (!existingDropped) {
    db.insert(messagesCountDropped)
      .values({ nonloggedErrors: 0, nonloggedGood: 0 })
      .run();
  }
}

/**
 * Increment message count
 *
 * @param hasError Whether the message had an error
 * @param logged Whether the message was logged to database
 */
export function incrementMessageCount(hasError: boolean, logged = true): void {
  const db = getDatabase();

  if (logged) {
    // Increment logged message counts
    const stats = getMessageCountStats();

    if (stats) {
      db.update(messagesCount)
        .set({
          total: (stats.total ?? 0) + 1,
          errors: hasError ? (stats.errors ?? 0) + 1 : stats.errors,
          good: !hasError ? (stats.good ?? 0) + 1 : stats.good,
        })
        .run();
    } else {
      // Initialize if not exists
      db.insert(messagesCount)
        .values({
          total: 1,
          errors: hasError ? 1 : 0,
          good: hasError ? 0 : 1,
        })
        .run();
    }
  } else {
    // Increment non-logged message counts
    const stats = getDroppedMessageCountStats();

    if (stats) {
      db.update(messagesCountDropped)
        .set({
          nonloggedErrors: hasError
            ? (stats.nonloggedErrors ?? 0) + 1
            : stats.nonloggedErrors,
          nonloggedGood: !hasError
            ? (stats.nonloggedGood ?? 0) + 1
            : stats.nonloggedGood,
        })
        .run();
    } else {
      // Initialize if not exists
      db.insert(messagesCountDropped)
        .values({
          nonloggedErrors: hasError ? 1 : 0,
          nonloggedGood: hasError ? 0 : 1,
        })
        .run();
    }
  }
}

/**
 * Reset all statistics tables
 *
 * WARNING: This deletes all frequency, signal level, and count data.
 */
export function resetAllStatistics(): void {
  const db = getDatabase();

  // Clear frequency tables
  db.delete(freqsAcars).run();
  db.delete(freqsVdlm2).run();
  db.delete(freqsHfdl).run();
  db.delete(freqsImsl).run();
  db.delete(freqsIrdm).run();

  // Clear signal level tables
  db.delete(levelAcars).run();
  db.delete(levelVdlm2).run();
  db.delete(levelHfdl).run();
  db.delete(levelImsl).run();
  db.delete(levelIrdm).run();

  // Reset count tables
  db.delete(messagesCount).run();
  db.delete(messagesCountDropped).run();

  // Reinitialize count tables
  initializeMessageCounts();
}

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

import { count, eq } from "drizzle-orm";
import { createLogger } from "../../utils/logger.js";
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
  messages,
  messagesCount,
  messagesCountDropped,
} from "../schema.js";

const logger = createLogger("db:statistics");

/**
 * In-memory message counters (avoids expensive COUNT(*) queries)
 *
 * Python backend maintains these as global variables that increment
 * as messages arrive. TypeScript does the same for performance.
 */
let messageCounters = {
  acars: 0,
  vdlm2: 0,
  hfdl: 0,
  imsl: 0,
  irdm: 0,
  total: 0,
};

/**
 * Flag to track if counters have been initialized from database
 */
let countersInitialized = false;

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
 * Get all frequency counts across all decoders
 *
 * Aggregates frequency data from all decoder types with decoder label.
 *
 * @returns Array of frequency counts with decoder type
 */
export function getAllFreqCounts(): Array<{
  decoder: string;
  freq: string | null;
  count: number | null;
}> {
  // Python sends uppercase decoder names: ACARS, VDL-M2, HFDL, IMSL, IRDM
  const acars = getFreqCount("acars").map((item) => ({
    decoder: "ACARS",
    ...item,
  }));
  const vdlm2 = getFreqCount("vdlm2").map((item) => ({
    decoder: "VDL-M2",
    ...item,
  }));
  const hfdl = getFreqCount("hfdl").map((item) => ({
    decoder: "HFDL",
    ...item,
  }));
  const imsl = getFreqCount("imsl").map((item) => ({
    decoder: "IMSL",
    ...item,
  }));
  const irdm = getFreqCount("irdm").map((item) => ({
    decoder: "IRDM",
    ...item,
  }));

  return [...acars, ...vdlm2, ...hfdl, ...imsl, ...irdm];
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
  ACARS: Array<{ level: number | null; count: number | null }>;
  "VDL-M2": Array<{ level: number | null; count: number | null }>;
  HFDL: Array<{ level: number | null; count: number | null }>;
  IMSL: Array<{ level: number | null; count: number | null }>;
  IRDM: Array<{ level: number | null; count: number | null }>;
} {
  return {
    ACARS: getSignalLevels("acars"),
    "VDL-M2": getSignalLevels("vdlm2"),
    HFDL: getSignalLevels("hfdl"),
    IMSL: getSignalLevels("imsl"),
    IRDM: getSignalLevels("irdm"),
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
 * Initialize message counters from database
 *
 * Should be called once at startup to sync in-memory counters with database.
 * After initialization, counters are incremented as messages are added.
 */
export function initializeMessageCounters(): void {
  if (countersInitialized) {
    logger.warn("Message counters already initialized, skipping");
    return;
  }

  const db = getDatabase();

  try {
    // Count messages by messageType
    const results = db
      .select({
        messageType: messages.messageType,
        count: count(),
      })
      .from(messages)
      .groupBy(messages.messageType)
      .all() as Array<{ messageType: string | null; count: number }>;

    // Reset counters
    messageCounters = {
      acars: 0,
      vdlm2: 0,
      hfdl: 0,
      imsl: 0,
      irdm: 0,
      total: 0,
    };

    for (const row of results) {
      const messageType = row.messageType?.toUpperCase();
      const count = row.count ?? 0;

      if (messageType === "ACARS") {
        messageCounters.acars = count;
      } else if (messageType === "VDLM2" || messageType === "VDL-M2") {
        messageCounters.vdlm2 += count; // Use += to handle both formats
      } else if (messageType === "HFDL") {
        messageCounters.hfdl = count;
      } else if (messageType === "IMSL" || messageType === "IMS-L") {
        messageCounters.imsl += count; // Use += to handle both formats
      } else if (messageType === "IRDM") {
        messageCounters.irdm = count;
      }

      messageCounters.total += count;
    }

    countersInitialized = true;

    logger.info("Message counters initialized", {
      acars: messageCounters.acars,
      vdlm2: messageCounters.vdlm2,
      hfdl: messageCounters.hfdl,
      imsl: messageCounters.imsl,
      irdm: messageCounters.irdm,
      total: messageCounters.total,
    });
  } catch (error) {
    logger.error("Failed to initialize message counters", { error });
    throw error;
  }
}

/**
 * Increment message counter for a specific decoder type
 *
 * Called when a new message is added to the database.
 * Avoids expensive COUNT(*) queries by maintaining in-memory counters.
 *
 * @param messageType Decoder type (ACARS, VDLM2, HFDL, etc.)
 */
export function incrementMessageCounter(messageType: string | null): void {
  if (!countersInitialized) {
    logger.warn("Message counters not initialized, initializing now");
    initializeMessageCounters();
  }

  if (!messageType) {
    return;
  }

  const upperType = messageType.toUpperCase();

  if (upperType === "ACARS") {
    messageCounters.acars++;
  } else if (upperType === "VDLM2" || upperType === "VDL-M2") {
    messageCounters.vdlm2++;
  } else if (upperType === "HFDL") {
    messageCounters.hfdl++;
  } else if (upperType === "IMSL" || upperType === "IMS-L") {
    messageCounters.imsl++;
  } else if (upperType === "IRDM") {
    messageCounters.irdm++;
  }

  messageCounters.total++;
}

/**
 * Get per-decoder message counts from in-memory counters
 *
 * Returns total message count for each decoder type.
 * This is used for system status display.
 *
 * Uses in-memory counters for performance instead of querying database.
 * Counters are initialized at startup and incremented as messages arrive.
 *
 * @returns Object with counts per decoder type
 */
export function getPerDecoderMessageCounts(): {
  acars: number;
  vdlm2: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
} {
  if (!countersInitialized) {
    logger.warn("Message counters not initialized, initializing now");
    initializeMessageCounters();
  }

  return { ...messageCounters };
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
 * Reset in-memory message counter state for testing purposes only.
 *
 * This resets the module-level `countersInitialized` flag and zeroes
 * `messageCounters` so that `initializeMessageCounters()` can be called
 * again in the next test with a fresh in-memory database.
 *
 * @internal - Do NOT call this in production code.
 */
export function resetCountersForTesting(): void {
  countersInitialized = false;
  messageCounters = {
    acars: 0,
    vdlm2: 0,
    hfdl: 0,
    imsl: 0,
    irdm: 0,
    total: 0,
  };
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

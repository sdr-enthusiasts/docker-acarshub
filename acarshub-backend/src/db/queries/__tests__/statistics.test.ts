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
 * Unit tests for db/queries/statistics.ts
 *
 * Tests cover:
 * - getFreqCount / getAllFreqCounts: read-back after updateFrequency
 * - updateFrequency: first call inserts (count=1), second call increments
 * - getSignalLevels / getAllSignalLevels: read-back after updateSignalLevel
 * - updateSignalLevel: first call inserts (count=1), second call increments
 * - initializeMessageCounters: reads from messages table, sets in-memory counters
 * - incrementMessageCounter: increments in-memory per-decoder counter
 * - getPerDecoderMessageCounts: returns current in-memory state
 * - incrementMessageCount: logged (count/errors/good) and dropped variants
 * - resetAllStatistics: clears all tables and reinitialises count rows
 * - resetCountersForTesting: resets module-level state between tests
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../client.js";
import * as schema from "../../schema.js";
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
  messages,
  messagesCount,
  messagesCountDropped,
} from "../../schema.js";
import {
  getAllFreqCounts,
  getAllSignalLevels,
  getFreqCount,
  getPerDecoderMessageCounts,
  getSignalLevels,
  incrementMessageCount,
  incrementMessageCounter,
  initializeMessageCounters,
  initializeMessageCounts,
  resetAllStatistics,
  resetCountersForTesting,
  updateFrequency,
  updateSignalLevel,
} from "../statistics.js";

// ---------------------------------------------------------------------------
// Schema SQL (mirrors Drizzle schema, without FTS or composite indexes)
// ---------------------------------------------------------------------------

const CREATE_STATS_TABLES = `
  CREATE TABLE IF NOT EXISTS freqs_acars   (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
  CREATE TABLE IF NOT EXISTS freqs_vdlm2   (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
  CREATE TABLE IF NOT EXISTS freqs_hfdl    (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
  CREATE TABLE IF NOT EXISTS freqs_imsl    (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
  CREATE TABLE IF NOT EXISTS freqs_irdm    (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);

  CREATE TABLE IF NOT EXISTS level_acars   (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
  CREATE TABLE IF NOT EXISTS level_vdlm2   (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
  CREATE TABLE IF NOT EXISTS level_hfdl    (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
  CREATE TABLE IF NOT EXISTS level_imsl    (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
  CREATE TABLE IF NOT EXISTS level_irdm    (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);

  CREATE TABLE IF NOT EXISTS count (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    total   INTEGER,
    errors  INTEGER,
    good    INTEGER
  );

  CREATE TABLE IF NOT EXISTS nonlogged_count (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    errors  INTEGER,
    good    INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uid          TEXT UNIQUE NOT NULL,
    message_type TEXT NOT NULL,
    msg_time     INTEGER NOT NULL,
    station_id   TEXT NOT NULL DEFAULT '',
    toaddr       TEXT NOT NULL DEFAULT '',
    fromaddr     TEXT NOT NULL DEFAULT '',
    depa         TEXT NOT NULL DEFAULT '',
    dsta         TEXT NOT NULL DEFAULT '',
    eta          TEXT NOT NULL DEFAULT '',
    gtout        TEXT NOT NULL DEFAULT '',
    gtin         TEXT NOT NULL DEFAULT '',
    wloff        TEXT NOT NULL DEFAULT '',
    wlin         TEXT NOT NULL DEFAULT '',
    lat          TEXT NOT NULL DEFAULT '',
    lon          TEXT NOT NULL DEFAULT '',
    alt          TEXT NOT NULL DEFAULT '',
    msg_text     TEXT NOT NULL DEFAULT '',
    tail         TEXT NOT NULL DEFAULT '',
    flight       TEXT NOT NULL DEFAULT '',
    icao         TEXT NOT NULL DEFAULT '',
    freq         TEXT NOT NULL DEFAULT '',
    ack          TEXT NOT NULL DEFAULT '',
    mode         TEXT NOT NULL DEFAULT '',
    label        TEXT NOT NULL DEFAULT '',
    block_id     TEXT NOT NULL DEFAULT '',
    msgno        TEXT NOT NULL DEFAULT '',
    is_response  TEXT NOT NULL DEFAULT '',
    is_onground  TEXT NOT NULL DEFAULT '',
    error        TEXT NOT NULL DEFAULT '',
    libacars     TEXT NOT NULL DEFAULT '',
    level        TEXT NOT NULL DEFAULT '',
    aircraft_id  TEXT
  );
`;

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqliteDb: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqliteDb = new Database(":memory:");
  sqliteDb.exec(CREATE_STATS_TABLES);
  testDb = drizzle(sqliteDb, { schema });
  vi.spyOn(clientModule, "getDatabase").mockReturnValue(testDb);

  // Reset module-level in-memory state before every test
  resetCountersForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  sqliteDb.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertMessage(
  uid: string,
  messageType: string,
  time = 1_700_000_000,
): void {
  testDb
    .insert(messages)
    .values({
      uid,
      messageType,
      time,
      stationId: "",
      toaddr: "",
      fromaddr: "",
      depa: "",
      dsta: "",
      eta: "",
      gtout: "",
      gtin: "",
      wloff: "",
      wlin: "",
      lat: "",
      lon: "",
      alt: "",
      text: "",
      tail: "",
      flight: "",
      icao: "",
      freq: "",
      ack: "",
      mode: "",
      label: "",
      blockId: "",
      msgno: "",
      isResponse: "",
      isOnground: "",
      error: "",
      libacars: "",
      level: "",
    })
    .run();
}

// ---------------------------------------------------------------------------
// updateFrequency / getFreqCount / getAllFreqCounts
// ---------------------------------------------------------------------------

describe("updateFrequency", () => {
  it("should insert a new row with count=1 on the first call", () => {
    updateFrequency("acars", "131.550");

    const rows = testDb.select().from(freqsAcars).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].freq).toBe("131.550");
    expect(rows[0].count).toBe(1);
  });

  it("should increment count on the second call for the same frequency", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("acars", "131.550");

    const rows = testDb.select().from(freqsAcars).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it("should track different frequencies independently", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("acars", "131.550");
    updateFrequency("acars", "130.025");

    const rows = testDb.select().from(freqsAcars).all();
    expect(rows).toHaveLength(2);

    const row550 = rows.find((r) => r.freq === "131.550");
    const row025 = rows.find((r) => r.freq === "130.025");
    expect(row550?.count).toBe(2);
    expect(row025?.count).toBe(1);
  });

  it("should write to the correct table for each decoder type", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("vdlm2", "136.900");
    updateFrequency("hfdl", "11.184");
    updateFrequency("imsl", "10.500");
    updateFrequency("irdm", "1626.5");

    expect(testDb.select().from(freqsAcars).all()).toHaveLength(1);
    expect(testDb.select().from(freqsVdlm2).all()).toHaveLength(1);
    expect(testDb.select().from(freqsHfdl).all()).toHaveLength(1);
    expect(testDb.select().from(freqsImsl).all()).toHaveLength(1);
    expect(testDb.select().from(freqsIrdm).all()).toHaveLength(1);
  });

  it("should not mix frequencies across decoder tables", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("vdlm2", "131.550");

    const acarsRows = testDb.select().from(freqsAcars).all();
    const vdlmRows = testDb.select().from(freqsVdlm2).all();
    expect(acarsRows).toHaveLength(1);
    expect(vdlmRows).toHaveLength(1);
  });
});

describe("getFreqCount", () => {
  it("should return an empty array when no frequencies recorded", () => {
    const result = getFreqCount("acars");
    expect(result).toEqual([]);
  });

  it("should return recorded frequencies for the correct decoder", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("acars", "131.550");
    updateFrequency("acars", "130.025");

    const result = getFreqCount("acars");
    expect(result).toHaveLength(2);
  });

  it("should return frequencies for vdlm2 independently of acars", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("vdlm2", "136.900");

    expect(getFreqCount("acars")).toHaveLength(1);
    expect(getFreqCount("vdlm2")).toHaveLength(1);
    expect(getFreqCount("hfdl")).toHaveLength(0);
    expect(getFreqCount("imsl")).toHaveLength(0);
    expect(getFreqCount("irdm")).toHaveLength(0);
  });
});

describe("getAllFreqCounts", () => {
  it("should return an empty array when no data exists", () => {
    expect(getAllFreqCounts()).toEqual([]);
  });

  it("should aggregate frequencies across all decoder types with correct decoder labels", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("vdlm2", "136.900");
    updateFrequency("hfdl", "11.184");
    updateFrequency("imsl", "10.500");
    updateFrequency("irdm", "1626.5");

    const results = getAllFreqCounts();
    expect(results).toHaveLength(5);

    const decoderLabels = results.map((r) => r.decoder);
    expect(decoderLabels).toContain("ACARS");
    expect(decoderLabels).toContain("VDL-M2");
    expect(decoderLabels).toContain("HFDL");
    expect(decoderLabels).toContain("IMSL");
    expect(decoderLabels).toContain("IRDM");
  });

  it("should include only decoders that have data", () => {
    updateFrequency("acars", "131.550");

    const results = getAllFreqCounts();
    expect(results).toHaveLength(1);
    expect(results[0].decoder).toBe("ACARS");
  });
});

// ---------------------------------------------------------------------------
// updateSignalLevel / getSignalLevels / getAllSignalLevels
// ---------------------------------------------------------------------------

describe("updateSignalLevel", () => {
  it("should insert a new row with count=1 on first call", () => {
    updateSignalLevel("acars", -12.5);

    const rows = testDb.select().from(levelAcars).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe(-12.5);
    expect(rows[0].count).toBe(1);
  });

  it("should increment count on the second call for the same level", () => {
    updateSignalLevel("acars", -12.5);
    updateSignalLevel("acars", -12.5);

    const rows = testDb.select().from(levelAcars).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it("should track different levels independently", () => {
    updateSignalLevel("acars", -12.5);
    updateSignalLevel("acars", -12.5);
    updateSignalLevel("acars", -8.0);

    const rows = testDb.select().from(levelAcars).all();
    expect(rows).toHaveLength(2);

    const row125 = rows.find((r) => r.level === -12.5);
    const row80 = rows.find((r) => r.level === -8.0);
    expect(row125?.count).toBe(2);
    expect(row80?.count).toBe(1);
  });

  it("should write to the correct table for each decoder type", () => {
    updateSignalLevel("acars", -10.0);
    updateSignalLevel("vdlm2", -11.0);
    updateSignalLevel("hfdl", -12.0);
    updateSignalLevel("imsl", -13.0);
    updateSignalLevel("irdm", -14.0);

    expect(testDb.select().from(levelAcars).all()).toHaveLength(1);
    expect(testDb.select().from(levelVdlm2).all()).toHaveLength(1);
    expect(testDb.select().from(levelHfdl).all()).toHaveLength(1);
    expect(testDb.select().from(levelImsl).all()).toHaveLength(1);
    expect(testDb.select().from(levelIrdm).all()).toHaveLength(1);
  });
});

describe("getSignalLevels", () => {
  it("should return empty array when no levels recorded", () => {
    expect(getSignalLevels("acars")).toEqual([]);
  });

  it("should return recorded levels for the correct decoder", () => {
    updateSignalLevel("vdlm2", -5.0);
    updateSignalLevel("vdlm2", -7.0);

    const result = getSignalLevels("vdlm2");
    expect(result).toHaveLength(2);
  });
});

describe("getAllSignalLevels", () => {
  it("should return an object with all five decoder keys", () => {
    const result = getAllSignalLevels();
    expect(result).toHaveProperty("ACARS");
    expect(result).toHaveProperty("VDL-M2");
    expect(result).toHaveProperty("HFDL");
    expect(result).toHaveProperty("IMSL");
    expect(result).toHaveProperty("IRDM");
  });

  it("should return empty arrays when no data exists", () => {
    const result = getAllSignalLevels();
    for (const key of Object.keys(result) as (keyof typeof result)[]) {
      expect(result[key]).toEqual([]);
    }
  });

  it("should populate each decoder key with its recorded levels", () => {
    updateSignalLevel("acars", -10.0);
    updateSignalLevel("vdlm2", -11.0);
    updateSignalLevel("hfdl", -12.0);

    const result = getAllSignalLevels();
    expect(result.ACARS).toHaveLength(1);
    expect(result["VDL-M2"]).toHaveLength(1);
    expect(result.HFDL).toHaveLength(1);
    expect(result.IMSL).toHaveLength(0);
    expect(result.IRDM).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// initializeMessageCounters
// ---------------------------------------------------------------------------

describe("initializeMessageCounters", () => {
  it("should set counters to zero when the messages table is empty", () => {
    initializeMessageCounters();

    const counts = getPerDecoderMessageCounts();
    expect(counts.acars).toBe(0);
    expect(counts.vdlm2).toBe(0);
    expect(counts.hfdl).toBe(0);
    expect(counts.imsl).toBe(0);
    expect(counts.irdm).toBe(0);
    expect(counts.total).toBe(0);
  });

  it("should read ACARS message count from database", () => {
    insertMessage("uid-1", "ACARS");
    insertMessage("uid-2", "ACARS");
    insertMessage("uid-3", "ACARS");

    initializeMessageCounters();

    const counts = getPerDecoderMessageCounts();
    expect(counts.acars).toBe(3);
    expect(counts.total).toBe(3);
  });

  it("should read VDLM2 message count from database (both spellings)", () => {
    insertMessage("uid-1", "VDLM2");
    insertMessage("uid-2", "VDL-M2");

    initializeMessageCounters();

    const counts = getPerDecoderMessageCounts();
    expect(counts.vdlm2).toBe(2);
  });

  it("should read HFDL message count from database", () => {
    insertMessage("uid-1", "HFDL");
    insertMessage("uid-2", "HFDL");

    initializeMessageCounters();

    const counts = getPerDecoderMessageCounts();
    expect(counts.hfdl).toBe(2);
  });

  it("should read mixed decoder counts from database", () => {
    insertMessage("uid-acars-1", "ACARS");
    insertMessage("uid-acars-2", "ACARS");
    insertMessage("uid-vdlm-1", "VDLM2");
    insertMessage("uid-hfdl-1", "HFDL");

    initializeMessageCounters();

    const counts = getPerDecoderMessageCounts();
    expect(counts.acars).toBe(2);
    expect(counts.vdlm2).toBe(1);
    expect(counts.hfdl).toBe(1);
    expect(counts.total).toBe(4);
  });

  it("should be a no-op when called a second time (already-initialized guard)", () => {
    insertMessage("uid-1", "ACARS");
    initializeMessageCounters();

    // Insert more messages into the DB and call again — counters must not change
    insertMessage("uid-2", "ACARS");
    initializeMessageCounters(); // should be skipped

    const counts = getPerDecoderMessageCounts();
    // Still 1 from the first initialization, not 2
    expect(counts.acars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// incrementMessageCounter
// ---------------------------------------------------------------------------

describe("incrementMessageCounter", () => {
  beforeEach(() => {
    initializeMessageCounters(); // start from zero
  });

  it("should increment the ACARS counter", () => {
    incrementMessageCounter("ACARS");
    expect(getPerDecoderMessageCounts().acars).toBe(1);
    expect(getPerDecoderMessageCounts().total).toBe(1);
  });

  it("should increment the VDLM2 counter (uppercase VDLM2)", () => {
    incrementMessageCounter("VDLM2");
    expect(getPerDecoderMessageCounts().vdlm2).toBe(1);
    expect(getPerDecoderMessageCounts().total).toBe(1);
  });

  it("should increment the VDLM2 counter (VDL-M2 spelling)", () => {
    incrementMessageCounter("VDL-M2");
    expect(getPerDecoderMessageCounts().vdlm2).toBe(1);
    expect(getPerDecoderMessageCounts().total).toBe(1);
  });

  it("should increment the HFDL counter", () => {
    incrementMessageCounter("HFDL");
    expect(getPerDecoderMessageCounts().hfdl).toBe(1);
    expect(getPerDecoderMessageCounts().total).toBe(1);
  });

  it("should increment the IMSL counter (IMSL spelling)", () => {
    incrementMessageCounter("IMSL");
    expect(getPerDecoderMessageCounts().imsl).toBe(1);
  });

  it("should increment the IMSL counter (IMS-L spelling)", () => {
    incrementMessageCounter("IMS-L");
    expect(getPerDecoderMessageCounts().imsl).toBe(1);
  });

  it("should increment the IRDM counter", () => {
    incrementMessageCounter("IRDM");
    expect(getPerDecoderMessageCounts().irdm).toBe(1);
  });

  it("should accumulate multiple increments", () => {
    incrementMessageCounter("ACARS");
    incrementMessageCounter("ACARS");
    incrementMessageCounter("ACARS");
    incrementMessageCounter("VDLM2");

    const counts = getPerDecoderMessageCounts();
    expect(counts.acars).toBe(3);
    expect(counts.vdlm2).toBe(1);
    expect(counts.total).toBe(4);
  });

  it("should not increment any counter for a null messageType", () => {
    incrementMessageCounter(null);
    const counts = getPerDecoderMessageCounts();
    expect(counts.total).toBe(0);
  });

  it("should not increment any counter for an unknown messageType", () => {
    incrementMessageCounter("UNKNOWN_TYPE");
    const counts = getPerDecoderMessageCounts();
    // total is always incremented for any non-null message, even unknown types
    // Per-decoder counters (acars, vdlm2, etc.) are NOT incremented for unknown types
    expect(counts.total).toBe(1);
    expect(counts.acars).toBe(0);
    expect(counts.vdlm2).toBe(0);
    expect(counts.hfdl).toBe(0);
    expect(counts.imsl).toBe(0);
    expect(counts.irdm).toBe(0);
  });

  it("should be case-insensitive", () => {
    incrementMessageCounter("acars");
    incrementMessageCounter("Acars");
    expect(getPerDecoderMessageCounts().acars).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getPerDecoderMessageCounts
// ---------------------------------------------------------------------------

describe("getPerDecoderMessageCounts", () => {
  it("should return a copy, not the live reference", () => {
    initializeMessageCounters();
    const snapshot1 = getPerDecoderMessageCounts();
    incrementMessageCounter("ACARS");
    const snapshot2 = getPerDecoderMessageCounts();

    expect(snapshot1.acars).toBe(0);
    expect(snapshot2.acars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// incrementMessageCount (persistent, DB-backed)
// ---------------------------------------------------------------------------

describe("incrementMessageCount", () => {
  beforeEach(() => {
    initializeMessageCounts();
  });

  it("should increment total and good for a non-error logged message", () => {
    incrementMessageCount(false, true);

    const row = testDb.select().from(messagesCount).get();
    expect(row?.total).toBe(1);
    expect(row?.good).toBe(1);
    expect(row?.errors).toBe(0);
  });

  it("should increment total and errors for an error logged message", () => {
    incrementMessageCount(true, true);

    const row = testDb.select().from(messagesCount).get();
    expect(row?.total).toBe(1);
    expect(row?.errors).toBe(1);
    expect(row?.good).toBe(0);
  });

  it("should accumulate logged message counts", () => {
    incrementMessageCount(false, true);
    incrementMessageCount(false, true);
    incrementMessageCount(true, true);

    const row = testDb.select().from(messagesCount).get();
    expect(row?.total).toBe(3);
    expect(row?.good).toBe(2);
    expect(row?.errors).toBe(1);
  });

  it("should increment nonloggedGood for a non-error dropped message", () => {
    incrementMessageCount(false, false);

    const row = testDb.select().from(messagesCountDropped).get();
    expect(row?.nonloggedGood).toBe(1);
    expect(row?.nonloggedErrors).toBe(0);
  });

  it("should increment nonloggedErrors for an error dropped message", () => {
    incrementMessageCount(true, false);

    const row = testDb.select().from(messagesCountDropped).get();
    expect(row?.nonloggedErrors).toBe(1);
    expect(row?.nonloggedGood).toBe(0);
  });

  it("should accumulate dropped message counts", () => {
    incrementMessageCount(false, false);
    incrementMessageCount(false, false);
    incrementMessageCount(true, false);

    const row = testDb.select().from(messagesCountDropped).get();
    expect(row?.nonloggedGood).toBe(2);
    expect(row?.nonloggedErrors).toBe(1);
  });

  it("should not mix logged and dropped counts", () => {
    incrementMessageCount(false, true); // logged
    incrementMessageCount(false, false); // dropped

    const logged = testDb.select().from(messagesCount).get();
    const dropped = testDb.select().from(messagesCountDropped).get();

    expect(logged?.total).toBe(1);
    expect(dropped?.nonloggedGood).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resetAllStatistics
// ---------------------------------------------------------------------------

describe("resetAllStatistics", () => {
  it("should clear all frequency tables", () => {
    updateFrequency("acars", "131.550");
    updateFrequency("vdlm2", "136.900");
    updateFrequency("hfdl", "11.184");
    updateFrequency("imsl", "10.500");
    updateFrequency("irdm", "1626.5");

    resetAllStatistics();

    expect(testDb.select().from(freqsAcars).all()).toHaveLength(0);
    expect(testDb.select().from(freqsVdlm2).all()).toHaveLength(0);
    expect(testDb.select().from(freqsHfdl).all()).toHaveLength(0);
    expect(testDb.select().from(freqsImsl).all()).toHaveLength(0);
    expect(testDb.select().from(freqsIrdm).all()).toHaveLength(0);
  });

  it("should clear all signal level tables", () => {
    updateSignalLevel("acars", -10.0);
    updateSignalLevel("vdlm2", -11.0);
    updateSignalLevel("hfdl", -12.0);
    updateSignalLevel("imsl", -13.0);
    updateSignalLevel("irdm", -14.0);

    resetAllStatistics();

    expect(testDb.select().from(levelAcars).all()).toHaveLength(0);
    expect(testDb.select().from(levelVdlm2).all()).toHaveLength(0);
    expect(testDb.select().from(levelHfdl).all()).toHaveLength(0);
    expect(testDb.select().from(levelImsl).all()).toHaveLength(0);
    expect(testDb.select().from(levelIrdm).all()).toHaveLength(0);
  });

  it("should reinitialise count tables after clearing", () => {
    incrementMessageCount(false, true);
    incrementMessageCount(true, false);

    resetAllStatistics();

    // Count tables should exist (reinitialised) but with zeros
    const logged = testDb.select().from(messagesCount).get();
    const dropped = testDb.select().from(messagesCountDropped).get();

    expect(logged).toBeDefined();
    expect(dropped).toBeDefined();
    expect(logged?.total).toBe(0);
    expect(logged?.errors).toBe(0);
    expect(dropped?.nonloggedGood).toBe(0);
    expect(dropped?.nonloggedErrors).toBe(0);
  });

  it("should be safe to call on an already-empty database", () => {
    expect(() => resetAllStatistics()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resetCountersForTesting
// ---------------------------------------------------------------------------

describe("resetCountersForTesting", () => {
  it("should allow initializeMessageCounters to run again after reset", () => {
    // First init: empty DB → all zeros
    initializeMessageCounters();
    const countsAfterFirst = getPerDecoderMessageCounts();
    expect(countsAfterFirst.acars).toBe(0);

    // Insert messages, then reset module state
    insertMessage("uid-1", "ACARS");
    insertMessage("uid-2", "ACARS");
    resetCountersForTesting();

    // Second init: should read 2 ACARS from DB
    initializeMessageCounters();
    const countsAfterSecond = getPerDecoderMessageCounts();
    expect(countsAfterSecond.acars).toBe(2);
  });

  it("should zero all in-memory counters", () => {
    initializeMessageCounters();
    incrementMessageCounter("ACARS");
    incrementMessageCounter("ACARS");
    incrementMessageCounter("VDLM2");

    resetCountersForTesting();

    // After reset, getPerDecoderMessageCounts triggers lazy re-init from DB (empty)
    const counts = getPerDecoderMessageCounts();
    expect(counts.acars).toBe(0);
    expect(counts.vdlm2).toBe(0);
    expect(counts.total).toBe(0);
  });
});

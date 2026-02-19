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
 * Unit tests for db/queries/alerts.ts
 *
 * Tests cover:
 * - initializeAlertCache / resetAlertCacheForTesting: module-level state management
 * - getCachedAlertTerms / getCachedAlertIgnoreTerms: in-memory reads
 * - setAlertTerms / setAlertIgnore: DB write + cache update + uppercase normalisation
 * - addAlertMatch / searchAlerts: insert and paginated retrieval
 * - searchAlertsByTerm: term-filtered paginated retrieval
 * - getAlertCounts / incrementAlertCount / resetAlertCounts: per-term statistics
 * - deleteOldAlertMatches: timestamp-based deletion
 * - getAlertMatchesForMessage: per-message lookup
 * - regenerateAllAlertMatches:
 *     text matching (word boundary, case-insensitive)
 *     ICAO matching (substring)
 *     tail matching (substring)
 *     flight matching (substring)
 *     ignore term filtering (suppresses match)
 *     matched_messages / total_matches stats
 *     empty alertTerms → no matches
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../client.js";
import * as schema from "../../schema.js";
import {
  alertMatches,
  alertStats,
  ignoreAlertTerms,
  messages,
} from "../../schema.js";
import {
  addAlertMatch,
  deleteOldAlertMatches,
  getAlertCounts,
  getAlertIgnore,
  getAlertMatchesForMessage,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  getSavedAlertCount,
  incrementAlertCount,
  initializeAlertCache,
  regenerateAllAlertMatches,
  resetAlertCacheForTesting,
  resetAlertCounts,
  searchAlerts,
  searchAlertsByTerm,
  setAlertIgnore,
  setAlertTerms,
} from "../alerts.js";

// ---------------------------------------------------------------------------
// Schema SQL
// ---------------------------------------------------------------------------

const CREATE_ALERT_TABLES = `
  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uid          TEXT UNIQUE NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'ACARS',
    msg_time     INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS alert_matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_uid TEXT NOT NULL,
    term        TEXT NOT NULL,
    match_type  TEXT NOT NULL,
    matched_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alert_stats (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    term  TEXT,
    count INTEGER
  );

  CREATE TABLE IF NOT EXISTS ignore_alert_terms (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT
  );
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal message row factory */
interface MsgOpts {
  uid: string;
  text?: string;
  icao?: string;
  tail?: string;
  flight?: string;
  time?: number;
}

function insertMessage(
  db: ReturnType<typeof drizzle<typeof schema>>,
  opts: MsgOpts,
): void {
  db.insert(messages)
    .values({
      uid: opts.uid,
      messageType: "ACARS",
      time: opts.time ?? 1_700_000_000,
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
      text: opts.text ?? "",
      tail: opts.tail ?? "",
      flight: opts.flight ?? "",
      icao: opts.icao ?? "",
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

/** Insert an alert_match row directly */
function insertAlertMatch(
  db: ReturnType<typeof drizzle<typeof schema>>,
  messageUid: string,
  term: string,
  matchType: string,
  matchedAt: number,
): void {
  db.insert(alertMatches)
    .values({ messageUid, term, matchType, matchedAt })
    .run();
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqliteDb: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqliteDb = new Database(":memory:");
  sqliteDb.exec(CREATE_ALERT_TABLES);
  testDb = drizzle(sqliteDb, { schema });
  vi.spyOn(clientModule, "getDatabase").mockReturnValue(testDb);

  // Ensure a clean cache state before every test
  resetAlertCacheForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  sqliteDb.close();
});

// ---------------------------------------------------------------------------
// resetAlertCacheForTesting / initializeAlertCache
// ---------------------------------------------------------------------------

describe("resetAlertCacheForTesting", () => {
  it("should allow initializeAlertCache to run again after reset", () => {
    // Seed DB with a term
    testDb.insert(alertStats).values({ term: "UAL123", count: 0 }).run();

    initializeAlertCache();
    expect(getCachedAlertTerms()).toContain("UAL123");

    // Reset and re-init with empty DB
    resetAlertCacheForTesting();
    sqliteDb.exec("DELETE FROM alert_stats");
    initializeAlertCache();

    expect(getCachedAlertTerms()).toHaveLength(0);
  });
});

describe("initializeAlertCache", () => {
  it("should load alert terms from alert_stats table", () => {
    testDb.insert(alertStats).values({ term: "UAL", count: 0 }).run();
    testDb.insert(alertStats).values({ term: "aal", count: 0 }).run();

    initializeAlertCache();

    const terms = getCachedAlertTerms();
    expect(terms).toContain("UAL");
    // Normalised to uppercase
    expect(terms).toContain("AAL");
    expect(terms).toHaveLength(2);
  });

  it("should load ignore terms from ignore_alert_terms table", () => {
    testDb.insert(ignoreAlertTerms).values({ term: "TEST" }).run();
    testDb.insert(ignoreAlertTerms).values({ term: "ignore" }).run();

    initializeAlertCache();

    const ignore = getCachedAlertIgnoreTerms();
    expect(ignore).toContain("TEST");
    expect(ignore).toContain("IGNORE");
    expect(ignore).toHaveLength(2);
  });

  it("should return empty arrays when tables are empty", () => {
    initializeAlertCache();

    expect(getCachedAlertTerms()).toHaveLength(0);
    expect(getCachedAlertIgnoreTerms()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setAlertTerms / getCachedAlertTerms
// ---------------------------------------------------------------------------

describe("setAlertTerms", () => {
  it("should write terms to DB and update cache", () => {
    setAlertTerms(["UAL123", "AAL456"]);

    const dbRows = testDb.select().from(alertStats).all();
    expect(dbRows).toHaveLength(2);

    const cached = getCachedAlertTerms();
    expect(cached).toContain("UAL123");
    expect(cached).toContain("AAL456");
  });

  it("should normalise terms to uppercase", () => {
    setAlertTerms(["ual123", "Aal456"]);

    const cached = getCachedAlertTerms();
    expect(cached).toContain("UAL123");
    expect(cached).toContain("AAL456");

    const dbRows = testDb.select().from(alertStats).all();
    expect(dbRows.map((r) => r.term)).toContain("UAL123");
  });

  it("should replace all existing terms on second call", () => {
    setAlertTerms(["FIRST"]);
    expect(getCachedAlertTerms()).toEqual(["FIRST"]);

    setAlertTerms(["SECOND", "THIRD"]);

    const cached = getCachedAlertTerms();
    expect(cached).not.toContain("FIRST");
    expect(cached).toContain("SECOND");
    expect(cached).toContain("THIRD");

    const dbRows = testDb.select().from(alertStats).all();
    expect(dbRows).toHaveLength(2);
  });

  it("should set cache to empty array when called with no terms", () => {
    setAlertTerms(["UAL123"]);
    setAlertTerms([]);

    expect(getCachedAlertTerms()).toEqual([]);
    expect(testDb.select().from(alertStats).all()).toHaveLength(0);
  });

  it("should initialise new rows with count = 0", () => {
    setAlertTerms(["UAL123"]);

    const row = testDb.select().from(alertStats).all()[0];
    expect(row.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setAlertIgnore / getCachedAlertIgnoreTerms
// ---------------------------------------------------------------------------

describe("setAlertIgnore", () => {
  it("should write ignore terms to DB and update cache", () => {
    setAlertIgnore(["NOISE", "TEST"]);

    const dbRows = testDb.select().from(ignoreAlertTerms).all();
    expect(dbRows).toHaveLength(2);

    const cached = getCachedAlertIgnoreTerms();
    expect(cached).toContain("NOISE");
    expect(cached).toContain("TEST");
  });

  it("should normalise ignore terms to uppercase", () => {
    setAlertIgnore(["noise", "Test"]);

    const cached = getCachedAlertIgnoreTerms();
    expect(cached).toContain("NOISE");
    expect(cached).toContain("TEST");
  });

  it("should replace all existing ignore terms on second call", () => {
    setAlertIgnore(["FIRST"]);
    setAlertIgnore(["SECOND"]);

    const cached = getCachedAlertIgnoreTerms();
    expect(cached).not.toContain("FIRST");
    expect(cached).toContain("SECOND");
  });

  it("should set cache to empty when called with no terms", () => {
    setAlertIgnore(["NOISE"]);
    setAlertIgnore([]);

    expect(getCachedAlertIgnoreTerms()).toEqual([]);
    expect(testDb.select().from(ignoreAlertTerms).all()).toHaveLength(0);
  });
});

describe("getAlertIgnore", () => {
  it("should return all ignore term rows from database", () => {
    setAlertIgnore(["NOISE", "TEST"]);

    const rows = getAlertIgnore();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.term)).toContain("NOISE");
  });

  it("should return empty array when no ignore terms set", () => {
    expect(getAlertIgnore()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addAlertMatch / searchAlerts / getSavedAlertCount
// ---------------------------------------------------------------------------

describe("addAlertMatch", () => {
  it("should insert a match and return the inserted row", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL123" });

    const match = addAlertMatch({
      messageUid: "msg-1",
      term: "UAL123",
      matchType: "text",
      matchedAt: 1_700_000_000,
    });

    expect(match.id).toBeDefined();
    expect(match.messageUid).toBe("msg-1");
    expect(match.term).toBe("UAL123");
    expect(match.matchType).toBe("text");
  });
});

describe("searchAlerts", () => {
  beforeEach(() => {
    // Insert 5 messages and 5 matches at different timestamps
    for (let i = 1; i <= 5; i++) {
      insertMessage(testDb, { uid: `msg-${i}`, text: `term${i}` });
      insertAlertMatch(testDb, `msg-${i}`, "TERM", "text", 1_700_000_000 + i);
    }
  });

  it("should return matches ordered by matchedAt descending", () => {
    const results = searchAlerts(10, 0);

    expect(results).toHaveLength(5);
    // Most recent first
    expect(results[0].matchedAt).toBeGreaterThan(results[1].matchedAt);
  });

  it("should include joined message data", () => {
    const results = searchAlerts(1, 0);

    expect(results[0].message).toBeDefined();
    expect(results[0].message.uid).toBeDefined();
  });

  it("should respect the limit parameter", () => {
    expect(searchAlerts(3, 0)).toHaveLength(3);
    expect(searchAlerts(1, 0)).toHaveLength(1);
  });

  it("should respect the offset parameter (pagination)", () => {
    const page1 = searchAlerts(2, 0);
    const page2 = searchAlerts(2, 2);

    const page1Ids = page1.map((r) => r.id);
    const page2Ids = page2.map((r) => r.id);

    // No overlap between pages
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it("should return an empty array when the table is empty", () => {
    sqliteDb.exec("DELETE FROM alert_matches");
    expect(searchAlerts()).toHaveLength(0);
  });
});

describe("getSavedAlertCount", () => {
  it("should return 0 when no matches exist", () => {
    expect(getSavedAlertCount()).toBe(0);
  });

  it("should return the total number of alert matches", () => {
    insertMessage(testDb, { uid: "msg-1" });
    insertAlertMatch(testDb, "msg-1", "TERM", "text", 1_700_000_000);
    insertAlertMatch(testDb, "msg-1", "TERM2", "text", 1_700_000_001);

    expect(getSavedAlertCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// searchAlertsByTerm
// ---------------------------------------------------------------------------

describe("searchAlertsByTerm", () => {
  beforeEach(() => {
    insertMessage(testDb, { uid: "msg-1" });
    insertMessage(testDb, { uid: "msg-2" });
    insertMessage(testDb, { uid: "msg-3" });

    insertAlertMatch(testDb, "msg-1", "UAL", "icao", 1_700_000_001);
    insertAlertMatch(testDb, "msg-2", "UAL", "icao", 1_700_000_002);
    insertAlertMatch(testDb, "msg-3", "DAL", "icao", 1_700_000_003);
  });

  it("should return only matches for the specified term", () => {
    const results = searchAlertsByTerm("UAL");
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.term).toBe("UAL");
    }
  });

  it("should return an empty array when no matches for the term", () => {
    const results = searchAlertsByTerm("UNKNOWN");
    expect(results).toHaveLength(0);
  });

  it("should order results by matchedAt descending", () => {
    const results = searchAlertsByTerm("UAL");
    expect(results[0].matchedAt).toBeGreaterThan(results[1].matchedAt);
  });

  it("should respect limit and offset for pagination", () => {
    // Insert 5 more UAL matches
    for (let i = 10; i < 15; i++) {
      insertMessage(testDb, { uid: `extra-${i}` });
      insertAlertMatch(testDb, `extra-${i}`, "UAL", "icao", 1_700_000_000 + i);
    }

    const page1 = searchAlertsByTerm("UAL", 3, 0);
    const page2 = searchAlertsByTerm("UAL", 3, 3);

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);

    const ids1 = page1.map((r) => r.id);
    const ids2 = page2.map((r) => r.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it("should include joined message data", () => {
    const results = searchAlertsByTerm("UAL", 1, 0);
    expect(results[0].message).toBeDefined();
    expect(results[0].message.uid).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getAlertCounts / incrementAlertCount / resetAlertCounts
// ---------------------------------------------------------------------------

describe("getAlertCounts", () => {
  it("should return an empty array when no alert stats exist", () => {
    expect(getAlertCounts()).toHaveLength(0);
  });

  it("should return all alert stat rows", () => {
    setAlertTerms(["UAL", "DAL"]);

    const counts = getAlertCounts();
    expect(counts).toHaveLength(2);
    expect(counts.map((c) => c.term)).toContain("UAL");
    expect(counts.map((c) => c.term)).toContain("DAL");
  });

  it("should reflect current counts after incrementing", () => {
    setAlertTerms(["UAL"]);
    incrementAlertCount("UAL");
    incrementAlertCount("UAL");

    const counts = getAlertCounts();
    const ual = counts.find((c) => c.term === "UAL");
    expect(ual?.count).toBe(2);
  });
});

describe("incrementAlertCount", () => {
  it("should increment count for an existing term", () => {
    setAlertTerms(["UAL"]);

    incrementAlertCount("UAL");

    const rows = testDb.select().from(alertStats).all();
    const ual = rows.find((r) => r.term === "UAL");
    expect(ual?.count).toBe(1);
  });

  it("should create a new row for a term not in alert_stats", () => {
    // Term not previously seeded via setAlertTerms
    incrementAlertCount("NEWTERM");

    const rows = testDb.select().from(alertStats).all();
    const row = rows.find((r) => r.term === "NEWTERM");
    expect(row).toBeDefined();
    expect(row?.count).toBe(1);
  });

  it("should accumulate counts across multiple calls", () => {
    setAlertTerms(["UAL"]);
    incrementAlertCount("UAL");
    incrementAlertCount("UAL");
    incrementAlertCount("UAL");

    const rows = testDb.select().from(alertStats).all();
    expect(rows.find((r) => r.term === "UAL")?.count).toBe(3);
  });

  it("should track multiple terms independently", () => {
    setAlertTerms(["UAL", "DAL"]);
    incrementAlertCount("UAL");
    incrementAlertCount("UAL");
    incrementAlertCount("DAL");

    const rows = testDb.select().from(alertStats).all();
    expect(rows.find((r) => r.term === "UAL")?.count).toBe(2);
    expect(rows.find((r) => r.term === "DAL")?.count).toBe(1);
  });
});

describe("resetAlertCounts", () => {
  it("should set all counts to zero", () => {
    setAlertTerms(["UAL", "DAL"]);
    incrementAlertCount("UAL");
    incrementAlertCount("DAL");
    incrementAlertCount("DAL");

    resetAlertCounts();

    const rows = testDb.select().from(alertStats).all();
    for (const row of rows) {
      expect(row.count).toBe(0);
    }
  });

  it("should not delete term rows, only reset counts", () => {
    setAlertTerms(["UAL", "DAL"]);
    resetAlertCounts();

    expect(testDb.select().from(alertStats).all()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deleteOldAlertMatches
// ---------------------------------------------------------------------------

describe("deleteOldAlertMatches", () => {
  beforeEach(() => {
    insertMessage(testDb, { uid: "msg-old" });
    insertMessage(testDb, { uid: "msg-new" });

    insertAlertMatch(testDb, "msg-old", "TERM", "text", 1_000_000);
    insertAlertMatch(testDb, "msg-new", "TERM", "text", 2_000_000);
  });

  it("should delete matches before the given timestamp", () => {
    const deleted = deleteOldAlertMatches(1_500_000);
    expect(deleted).toBe(1);

    const remaining = testDb.select().from(alertMatches).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].matchedAt).toBe(2_000_000);
  });

  it("should return 0 when no matches are older than the cutoff", () => {
    const deleted = deleteOldAlertMatches(500_000);
    expect(deleted).toBe(0);

    expect(testDb.select().from(alertMatches).all()).toHaveLength(2);
  });

  it("should delete all matches when cutoff is after the newest match", () => {
    const deleted = deleteOldAlertMatches(3_000_000);
    expect(deleted).toBe(2);

    expect(testDb.select().from(alertMatches).all()).toHaveLength(0);
  });

  it("should return 0 on an empty table", () => {
    sqliteDb.exec("DELETE FROM alert_matches");
    expect(deleteOldAlertMatches(9_999_999)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getAlertMatchesForMessage
// ---------------------------------------------------------------------------

describe("getAlertMatchesForMessage", () => {
  it("should return all matches for a specific message UID", () => {
    insertMessage(testDb, { uid: "msg-1" });
    insertMessage(testDb, { uid: "msg-2" });

    insertAlertMatch(testDb, "msg-1", "UAL", "icao", 1_700_000_000);
    insertAlertMatch(testDb, "msg-1", "UAL123", "flight", 1_700_000_001);
    insertAlertMatch(testDb, "msg-2", "OTHER", "text", 1_700_000_002);

    const matches = getAlertMatchesForMessage("msg-1");
    expect(matches).toHaveLength(2);
    for (const m of matches) {
      expect(m.messageUid).toBe("msg-1");
    }
  });

  it("should return an empty array when no matches exist for the UID", () => {
    insertMessage(testDb, { uid: "msg-1" });
    expect(getAlertMatchesForMessage("msg-1")).toHaveLength(0);
  });

  it("should return an empty array for a non-existent UID", () => {
    expect(getAlertMatchesForMessage("does-not-exist")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// regenerateAllAlertMatches
// ---------------------------------------------------------------------------

describe("regenerateAllAlertMatches", () => {
  // Helper: run regeneration and return stats
  function regen(
    terms: string[],
    ignore: string[] = [],
  ): ReturnType<typeof regenerateAllAlertMatches> {
    // Ensure alert_stats rows exist for each term so counts can be updated
    setAlertTerms(terms);
    return regenerateAllAlertMatches(terms, ignore);
  }

  it("should return zero stats when there are no messages", () => {
    const stats = regen(["UAL"]);
    expect(stats.total_messages).toBe(0);
    expect(stats.matched_messages).toBe(0);
    expect(stats.total_matches).toBe(0);
  });

  it("should return zero stats when alert terms are empty", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL123 departed on time" });

    const stats = regen([]);
    expect(stats.matched_messages).toBe(0);
    expect(stats.total_matches).toBe(0);
  });

  // ---- text matching ----

  it("should match message text by word boundary (case-insensitive)", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL123 departed on time" });

    const stats = regen(["UAL123"]);
    expect(stats.total_matches).toBe(1);
    expect(stats.matched_messages).toBe(1);

    const matches = testDb.select().from(alertMatches).all();
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("text");
    expect(matches[0].term).toBe("UAL123");
  });

  it("should match text term case-insensitively", () => {
    insertMessage(testDb, { uid: "msg-1", text: "ual123 departed on time" });

    const stats = regen(["UAL123"]);
    expect(stats.total_matches).toBe(1);
  });

  it("should NOT match text when term is a substring without word boundary", () => {
    // 'UAL' alone must not match 'UAL123' — word boundary required
    insertMessage(testDb, { uid: "msg-1", text: "UAL123 departed" });

    const stats = regen(["UAL"]);
    expect(stats.total_matches).toBe(0);
  });

  it("should match text term when it appears as a full word in a longer sentence", () => {
    insertMessage(testDb, {
      uid: "msg-1",
      text: "Flight UAL is on final approach",
    });

    const stats = regen(["UAL"]);
    expect(stats.total_matches).toBe(1);
  });

  it("should create one match per term that appears in the text", () => {
    insertMessage(testDb, {
      uid: "msg-1",
      text: "UAL DAL both on final",
    });

    const stats = regen(["UAL", "DAL"]);
    expect(stats.total_matches).toBe(2);
    expect(stats.matched_messages).toBe(1); // one message matched (twice)
  });

  // ---- ICAO matching ----

  it("should match ICAO by exact equality", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "A1B2C3" });

    const stats = regen(["A1B2C3"]);
    expect(stats.total_matches).toBe(1);

    const matches = testDb.select().from(alertMatches).all();
    expect(matches[0].matchType).toBe("icao");
  });

  it("should match ICAO by substring (term contained within ICAO)", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "A1B2C3D4" });

    const stats = regen(["A1B2"]);
    expect(stats.total_matches).toBe(1);
  });

  it("should NOT match ICAO when term is not a substring", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "A1B2C3" });

    const stats = regen(["ZZZZZ"]);
    expect(stats.total_matches).toBe(0);
  });

  it("should match ICAO case-insensitively", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "a1b2c3" });

    const stats = regen(["A1B2C3"]);
    expect(stats.total_matches).toBe(1);
  });

  // ---- tail matching ----

  it("should match tail by exact equality", () => {
    insertMessage(testDb, { uid: "msg-1", tail: "N12345" });

    const stats = regen(["N12345"]);
    expect(stats.total_matches).toBe(1);

    const matches = testDb.select().from(alertMatches).all();
    expect(matches[0].matchType).toBe("tail");
  });

  it("should match tail by substring", () => {
    insertMessage(testDb, { uid: "msg-1", tail: "N12345AB" });

    const stats = regen(["N123"]);
    expect(stats.total_matches).toBe(1);
  });

  it("should match tail case-insensitively", () => {
    insertMessage(testDb, { uid: "msg-1", tail: "n12345" });

    const stats = regen(["N12345"]);
    expect(stats.total_matches).toBe(1);
  });

  // ---- flight matching ----

  it("should match flight by exact equality", () => {
    insertMessage(testDb, { uid: "msg-1", flight: "UAL123" });

    const stats = regen(["UAL123"]);
    // Could match flight OR text — let's confirm at least one flight match
    const matches = testDb.select().from(alertMatches).all();
    const flightMatch = matches.find((m) => m.matchType === "flight");
    expect(flightMatch).toBeDefined();
    expect(stats.total_matches).toBeGreaterThanOrEqual(1);
  });

  it("should match flight by substring", () => {
    insertMessage(testDb, { uid: "msg-1", flight: "UAL123" });

    const stats = regen(["UAL"]);
    const matches = testDb.select().from(alertMatches).all();
    const flightMatch = matches.find((m) => m.matchType === "flight");
    expect(flightMatch).toBeDefined();
    expect(stats.total_matches).toBeGreaterThanOrEqual(1);
  });

  it("should match flight case-insensitively", () => {
    insertMessage(testDb, { uid: "msg-1", flight: "ual123" });

    const stats = regen(["UAL123"]);
    const matches = testDb.select().from(alertMatches).all();
    const flightMatch = matches.find((m) => m.matchType === "flight");
    expect(flightMatch).toBeDefined();
    expect(stats.total_matches).toBeGreaterThanOrEqual(1);
  });

  // ---- ignore term filtering ----

  it("should suppress a text match when an ignore term also appears in the text", () => {
    insertMessage(testDb, {
      uid: "msg-1",
      text: "UAL test flight",
    });

    const stats = regen(["UAL"], ["TEST"]);
    // "test" matches the ignore pattern \bTEST\b in "test flight" (case-insensitive)
    expect(stats.total_matches).toBe(0);
    expect(testDb.select().from(alertMatches).all()).toHaveLength(0);
  });

  it("should allow a text match when the ignore term does NOT appear", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL departed on time" });

    const stats = regen(["UAL"], ["NOISE"]);
    expect(stats.total_matches).toBe(1);
  });

  it("should suppress an ICAO match when ignore term matches the ICAO", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "A1B2C3" });

    const stats = regen(["A1B2C3"], ["A1B2C3"]);
    expect(stats.total_matches).toBe(0);
  });

  it("should suppress a tail match when ignore term matches the tail", () => {
    insertMessage(testDb, { uid: "msg-1", tail: "N12345" });

    const stats = regen(["N12345"], ["N12345"]);
    expect(stats.total_matches).toBe(0);
  });

  it("should suppress a flight match when ignore term matches the flight", () => {
    insertMessage(testDb, { uid: "msg-1", flight: "UAL123" });

    const _stats = regen(["UAL123"], ["UAL123"]);
    const matches = testDb.select().from(alertMatches).all();
    const flightMatch = matches.find((m) => m.matchType === "flight");
    expect(flightMatch).toBeUndefined();
  });

  // ---- delete + reset on each run ----

  it("should delete existing matches before regenerating", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL on approach" });

    // First run
    regen(["UAL"]);
    expect(testDb.select().from(alertMatches).all()).toHaveLength(1);

    // Second run — same data; should produce exactly 1 match, not 2
    regen(["UAL"]);
    expect(testDb.select().from(alertMatches).all()).toHaveLength(1);
  });

  it("should reset alert counts before regenerating", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL on approach" });
    setAlertTerms(["UAL"]);
    incrementAlertCount("UAL");
    incrementAlertCount("UAL"); // count is now 2

    regen(["UAL"]);

    // After regen, the count should reflect the fresh run (1 match, count = 1)
    const counts = getAlertCounts();
    expect(counts.find((c) => c.term === "UAL")?.count).toBe(1);
  });

  // ---- stats totals ----

  it("should report correct total_messages count", () => {
    insertMessage(testDb, { uid: "msg-1", text: "irrelevant" });
    insertMessage(testDb, { uid: "msg-2", text: "also irrelevant" });

    const stats = regen(["UAL"]);
    expect(stats.total_messages).toBe(2);
  });

  it("should report matched_messages = 0 when no messages match", () => {
    insertMessage(testDb, { uid: "msg-1", text: "nothing special here" });

    const stats = regen(["UAL"]);
    expect(stats.matched_messages).toBe(0);
  });

  it("should count matched_messages even when a message matches multiple terms", () => {
    insertMessage(testDb, { uid: "msg-1", text: "UAL DAL on approach" });

    const stats = regen(["UAL", "DAL"]);
    // Message matches twice (two terms), but matched_messages counts unique messages
    expect(stats.matched_messages).toBe(1);
    expect(stats.total_matches).toBe(2);
  });

  // ---- mixed fields ----

  it("should match across all field types in a single message", () => {
    insertMessage(testDb, {
      uid: "msg-1",
      text: "TEXTTERM on final",
      icao: "ICAOTERM",
      tail: "TAILTERM",
      flight: "FLIGHTTERM",
    });

    const stats = regen(["TEXTTERM", "ICAOTERM", "TAILTERM", "FLIGHTTERM"]);

    // Text: 1, ICAO: 1, tail: 1, flight: 1 = 4 matches
    expect(stats.total_matches).toBe(4);
    expect(stats.matched_messages).toBe(1);
  });

  it("should handle multiple messages each matching different terms", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "ABCDEF" });
    insertMessage(testDb, { uid: "msg-2", icao: "GHIJKL" });
    insertMessage(testDb, { uid: "msg-3", icao: "XXXXXX" }); // no match

    const stats = regen(["ABCDEF", "GHIJKL"]);
    expect(stats.total_messages).toBe(3);
    expect(stats.matched_messages).toBe(2);
    expect(stats.total_matches).toBe(2);
  });

  it("should update alert_stats counts for matched terms", () => {
    insertMessage(testDb, { uid: "msg-1", icao: "ABCDEF" });
    insertMessage(testDb, { uid: "msg-2", icao: "ABCDEF" });

    regen(["ABCDEF"]);

    const counts = getAlertCounts();
    const term = counts.find((c) => c.term === "ABCDEF");
    expect(term?.count).toBe(2);
  });
});

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

// ----------------------------------------------------------------------------
// station-ids.ts — covers the warm in-memory station-ID registry that backs
// the `station_ids` socket event.
//
// Coverage:
//   1. initializeStationIds()
//      - Loads distinct station IDs from messages newer than 2 days
//      - Trims whitespace; rejects empty / whitespace-only IDs
//      - Skips messages older than 2 days (the 2*24*3600 window)
//      - Survives DB errors (catches, logs, leaves registry unchanged)
//   2. getStationIds()
//      - Returns IDs in sorted order
//      - Returns a fresh array (caller cannot mutate the registry)
//   3. checkAndAddStationId()
//      - Returns true the first time it sees an ID, false thereafter
//      - Trims input; rejects empty / undefined / whitespace-only
//      - Adds to registry so subsequent getStationIds() reflects the addition
//   4. resetStationIdsForTesting()
//      - Empties the registry so tests start from a known state
// ----------------------------------------------------------------------------

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  checkAndAddStationId,
  getStationIds,
  initializeStationIds,
  resetStationIdsForTesting,
} from "../station-ids.js";

// ---------------------------------------------------------------------------
// Minimal messages-table DDL.
//
// Only `station_id` and `msg_time` are read; the rest get empty-string
// defaults so seed inserts can omit them.  Schema matches the Drizzle
// definition closely enough that selectDistinct().from(messages).where(...)
// works against this in-memory DB.
// ---------------------------------------------------------------------------

const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message_type  TEXT NOT NULL DEFAULT 'ACARS',
    msg_time      INTEGER NOT NULL DEFAULT 0,
    station_id    TEXT NOT NULL DEFAULT '',
    toaddr        TEXT NOT NULL DEFAULT '',
    fromaddr      TEXT NOT NULL DEFAULT '',
    depa          TEXT NOT NULL DEFAULT '',
    dsta          TEXT NOT NULL DEFAULT '',
    eta           TEXT NOT NULL DEFAULT '',
    gtout         TEXT NOT NULL DEFAULT '',
    gtin          TEXT NOT NULL DEFAULT '',
    wloff         TEXT NOT NULL DEFAULT '',
    wlin          TEXT NOT NULL DEFAULT '',
    lat           TEXT NOT NULL DEFAULT '',
    lon           TEXT NOT NULL DEFAULT '',
    alt           TEXT NOT NULL DEFAULT '',
    msg_text      TEXT NOT NULL DEFAULT '',
    tail          TEXT NOT NULL DEFAULT '',
    flight        TEXT NOT NULL DEFAULT '',
    icao          TEXT NOT NULL DEFAULT '',
    freq          TEXT NOT NULL DEFAULT '',
    ack           TEXT NOT NULL DEFAULT '',
    mode          TEXT NOT NULL DEFAULT '',
    label         TEXT NOT NULL DEFAULT '',
    block_id      TEXT NOT NULL DEFAULT '',
    msgno         TEXT NOT NULL DEFAULT '',
    is_response   TEXT NOT NULL DEFAULT '',
    is_onground   TEXT NOT NULL DEFAULT '',
    error         TEXT NOT NULL DEFAULT '',
    libacars      TEXT NOT NULL DEFAULT '',
    level         TEXT NOT NULL DEFAULT '',
    aircraft_id   TEXT
  );
`;

let sqliteDb: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

function seed(rows: Array<{ stationId: string; time: number }>): void {
  const stmt = sqliteDb.prepare(
    "INSERT INTO messages (station_id, msg_time) VALUES (?, ?)",
  );
  for (const row of rows) stmt.run(row.stationId, row.time);
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

beforeEach(() => {
  sqliteDb = new Database(":memory:");
  sqliteDb.exec(CREATE_MESSAGES_TABLE);
  testDb = drizzle(sqliteDb, { schema });
  vi.spyOn(clientModule, "getDatabase").mockReturnValue(testDb);
  // Singleton state survives across tests within the file — reset between
  // each so we measure the behaviour of one call, not the accumulated set.
  resetStationIdsForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  sqliteDb.close();
});

// ---------------------------------------------------------------------------
// initializeStationIds
// ---------------------------------------------------------------------------

describe("initializeStationIds", () => {
  it("loads distinct station IDs from messages newer than 2 days", async () => {
    seed([
      { stationId: "STATION-A", time: nowSec() - 60 },
      { stationId: "STATION-B", time: nowSec() - 3600 },
      { stationId: "STATION-A", time: nowSec() - 7200 }, // duplicate
    ]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["STATION-A", "STATION-B"]);
  });

  it("skips messages older than the 2-day window", async () => {
    const justInside = nowSec() - (2 * 24 * 3600 - 60); // 1 minute inside
    const justOutside = nowSec() - (2 * 24 * 3600 + 60); // 1 minute outside
    seed([
      { stationId: "FRESH", time: justInside },
      { stationId: "STALE", time: justOutside },
    ]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["FRESH"]);
  });

  it("trims whitespace from station IDs", async () => {
    seed([
      { stationId: "  PADDED  ", time: nowSec() },
      { stationId: "\tTABBED\t", time: nowSec() },
    ]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["PADDED", "TABBED"]);
  });

  it("ignores empty and whitespace-only station IDs", async () => {
    seed([
      { stationId: "", time: nowSec() },
      { stationId: "   ", time: nowSec() },
      { stationId: "REAL", time: nowSec() },
    ]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["REAL"]);
  });

  it("survives DB errors without throwing", async () => {
    vi.spyOn(clientModule, "getDatabase").mockImplementation(() => {
      throw new Error("boom — DB unreachable");
    });
    expect(() => {
      initializeStationIds();
    }).not.toThrow();
    expect(getStationIds()).toEqual([]);
  });

  it("is additive when called twice — preserves existing entries and adds new ones", async () => {
    // First call: seeds A and B.
    seed([
      { stationId: "A", time: nowSec() },
      { stationId: "B", time: nowSec() },
    ]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["A", "B"]);

    // Add a new row and reinitialise — the function does not clear; it
    // just adds whatever it sees, which is the documented "safe to call
    // multiple times" contract.
    seed([{ stationId: "C", time: nowSec() }]);
    initializeStationIds();
    expect(getStationIds()).toEqual(["A", "B", "C"]);
  });
});

// ---------------------------------------------------------------------------
// getStationIds
// ---------------------------------------------------------------------------

describe("getStationIds", () => {
  it("returns IDs in sorted order regardless of insertion order", async () => {
    checkAndAddStationId("ZULU");
    checkAndAddStationId("ALPHA");
    checkAndAddStationId("MIKE");
    expect(getStationIds()).toEqual(["ALPHA", "MIKE", "ZULU"]);
  });

  it("returns an empty array when the registry is empty", async () => {
    expect(getStationIds()).toEqual([]);
  });

  it("returns a fresh array each call so callers cannot mutate the registry", async () => {
    checkAndAddStationId("A");
    const first = getStationIds();
    first.push("INJECTED");
    const second = getStationIds();
    expect(second).toEqual(["A"]);
    expect(second).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------
// checkAndAddStationId
// ---------------------------------------------------------------------------

describe("checkAndAddStationId", () => {
  it("returns true the first time it sees a station ID", async () => {
    expect(checkAndAddStationId("NEW-STATION")).toBe(true);
  });

  it("returns false on subsequent calls with the same ID", async () => {
    checkAndAddStationId("STATION-X");
    expect(checkAndAddStationId("STATION-X")).toBe(false);
    expect(checkAndAddStationId("STATION-X")).toBe(false);
  });

  it("treats whitespace-padded IDs as equal to their trimmed form", async () => {
    expect(checkAndAddStationId("  PAD  ")).toBe(true);
    expect(checkAndAddStationId("PAD")).toBe(false);
    expect(checkAndAddStationId("\tPAD\t")).toBe(false);
  });

  it("returns false for undefined input", async () => {
    expect(checkAndAddStationId(undefined)).toBe(false);
    expect(getStationIds()).toEqual([]);
  });

  it("returns false for empty and whitespace-only input", async () => {
    expect(checkAndAddStationId("")).toBe(false);
    expect(checkAndAddStationId("   ")).toBe(false);
    expect(checkAndAddStationId("\t\n")).toBe(false);
    expect(getStationIds()).toEqual([]);
  });

  it("makes the new ID visible to getStationIds()", async () => {
    checkAndAddStationId("VISIBLE");
    expect(getStationIds()).toContain("VISIBLE");
  });
});

// ---------------------------------------------------------------------------
// resetStationIdsForTesting
// ---------------------------------------------------------------------------

describe("resetStationIdsForTesting", () => {
  it("empties the registry", async () => {
    checkAndAddStationId("A");
    checkAndAddStationId("B");
    expect(getStationIds()).toEqual(["A", "B"]);
    resetStationIdsForTesting();
    expect(getStationIds()).toEqual([]);
  });

  it("allows previously-known IDs to re-trigger 'new' detection", async () => {
    expect(checkAndAddStationId("A")).toBe(true);
    expect(checkAndAddStationId("A")).toBe(false);
    resetStationIdsForTesting();
    expect(checkAndAddStationId("A")).toBe(true);
  });
});

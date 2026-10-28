/**
 * IMSL message-type spelling coverage for the level/freqs migrations.
 *
 * Stored IMSL messages use the legacy message_type "IMS-L", but migrations
 * 2 and 3 originally matched only "IMSL", and the live insert path never fed
 * level_imsl either. These tests drive the step functions directly against
 * minimal in-memory schemas so each migration's behaviour is isolated from
 * the rest of the chain (migration 16 would otherwise mask migration 2).
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migration02_splitSignalLevelTable } from "../migrations/migration02.js";
import { migration03_splitFreqsTable } from "../migrations/migration03.js";
import { migration16_rebuildLevelImsl } from "../migrations/migration16.js";

interface LevelRow {
  level: number;
  count: number;
}

const LEVEL_TABLES = [
  "level_acars",
  "level_vdlm2",
  "level_hfdl",
  "level_imsl",
  "level_irdm",
] as const;

function createMessagesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type VARCHAR(32) NOT NULL,
      level VARCHAR(32)
    )
  `);
}

function insertMessages(
  db: Database.Database,
  rows: ReadonlyArray<readonly [string, string | null]>,
): void {
  const stmt = db.prepare(
    "INSERT INTO messages (message_type, level) VALUES (?, ?)",
  );
  for (const [type, level] of rows) {
    stmt.run(type, level);
  }
}

function readLevels(db: Database.Database, table: string): LevelRow[] {
  return db
    .prepare(`SELECT level, count FROM ${table} ORDER BY level`)
    .all() as LevelRow[];
}

describe("migration02: IMSL spellings", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createMessagesTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it("counts both IMS-L and IMSL messages into level_imsl", () => {
    insertMessages(db, [
      ["IMS-L", "-10.5"],
      ["IMS-L", "-10.5"],
      ["IMSL", "-10.5"],
      ["IMS-L", "-3"],
      ["ACARS", "-10.5"],
    ]);

    migration02_splitSignalLevelTable(db);

    expect(readLevels(db, "level_imsl")).toEqual([
      { level: -10.5, count: 3 },
      { level: -3, count: 1 },
    ]);
    expect(readLevels(db, "level_acars")).toEqual([{ level: -10.5, count: 1 }]);
  });

  it("merges VDL-M2 and VDLM2 spellings into level_vdlm2", () => {
    insertMessages(db, [
      ["VDL-M2", "-20"],
      ["VDLM2", "-20"],
    ]);

    migration02_splitSignalLevelTable(db);

    expect(readLevels(db, "level_vdlm2")).toEqual([{ level: -20, count: 2 }]);
  });
});

describe("migration03: IMSL spellings", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE freqs (
        it INTEGER PRIMARY KEY AUTOINCREMENT,
        freq VARCHAR(32),
        freq_type VARCHAR(32),
        count INTEGER
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("routes IMS-L and IMSL freq rows to freqs_imsl", () => {
    const insert = db.prepare(
      "INSERT INTO freqs (freq, freq_type, count) VALUES (?, ?, ?)",
    );
    insert.run("1545.0", "IMS-L", 11);
    insert.run("1626.5", "IMSL", 7);
    insert.run("131.550", "ACARS", 5);
    insert.run("999.9", "UNKNOWN", 1);

    migration03_splitFreqsTable(db);

    const imsl = db
      .prepare("SELECT freq, count FROM freqs_imsl ORDER BY freq")
      .all() as Array<{ freq: string; count: number }>;
    expect(imsl).toEqual([
      { freq: "1545.0", count: 11 },
      { freq: "1626.5", count: 7 },
    ]);
    const acars = db
      .prepare("SELECT freq, count FROM freqs_acars")
      .all() as Array<{ freq: string; count: number }>;
    expect(acars).toEqual([{ freq: "131.550", count: 5 }]);
  });
});

describe("migration16: rebuild_level_imsl", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createMessagesTable(db);
    // Empty messages: migration02 only creates the level_* tables here.
    migration02_splitSignalLevelTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it("is a no-op on an empty database", () => {
    expect(() => migration16_rebuildLevelImsl(db)).not.toThrow();
    for (const table of LEVEL_TABLES) {
      expect(readLevels(db, table)).toEqual([]);
    }
  });

  it("replaces level_imsl with counts rebuilt from IMS-L/IMSL messages", () => {
    insertMessages(db, [
      ["IMS-L", "-12.5"],
      ["IMS-L", "-12.5"],
      ["IMSL", "-12.5"],
      ["IMS-L", "-4"],
      ["IMS-L", ""],
      ["IMS-L", null],
      ["ACARS", "-12.5"],
    ]);
    db.exec(
      "INSERT INTO level_imsl (level, count) VALUES (-99, 1000), (-12.5, 42)",
    );
    db.exec("INSERT INTO level_acars (level, count) VALUES (-7, 3)");

    migration16_rebuildLevelImsl(db);

    expect(readLevels(db, "level_imsl")).toEqual([
      { level: -12.5, count: 3 },
      { level: -4, count: 1 },
    ]);
    expect(readLevels(db, "level_acars")).toEqual([{ level: -7, count: 3 }]);
    for (const table of ["level_vdlm2", "level_hfdl", "level_irdm"]) {
      expect(readLevels(db, table)).toEqual([]);
    }
  });

  it("skips without error when level_imsl does not exist", () => {
    db.exec("DROP TABLE level_imsl");
    insertMessages(db, [["IMS-L", "-8"]]);

    expect(() => migration16_rebuildLevelImsl(db)).not.toThrow();
  });

  it("is idempotent", () => {
    insertMessages(db, [
      ["IMS-L", "-8"],
      ["IMSL", "-8"],
      ["IMS-L", "-2.5"],
    ]);

    migration16_rebuildLevelImsl(db);
    const first = readLevels(db, "level_imsl");
    migration16_rebuildLevelImsl(db);

    expect(readLevels(db, "level_imsl")).toEqual(first);
    expect(first).toEqual([
      { level: -8, count: 2 },
      { level: -2.5, count: 1 },
    ]);
  });
});

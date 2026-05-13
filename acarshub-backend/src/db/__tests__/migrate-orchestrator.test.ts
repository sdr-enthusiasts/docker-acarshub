/**
 * Tests for the top-level orchestration logic inside `runMigrations()`.
 *
 * Individual migration steps are tested in `migrate-initial-state.test.ts`
 * and `migrate-fts-repair.test.ts`. This file pins the orchestrator-level
 * branches that decide *whether* and *from where* migrations run:
 *
 *   - Unknown alembic_version → throws.
 *   - Already at latest version → no-op log path (no VACUUM, no ANALYZE).
 *   - Tables exist but structure matches no known state → throws (corruption guard).
 *   - Stale FTS on a database already at the latest revision → triggers
 *     VACUUM/ANALYZE path even though no migrations ran.
 *   - Fresh empty database → applies every migration end-to-end.
 *   - Error inside a migration step → caught, logged, db closed, re-thrown.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../migrate.js";

const TEST_DB_PATH = path.join(
  process.cwd(),
  `test-migrate-orchestrator-${process.pid}.db`,
);

/**
 * Discovered in beforeAll().  We can't import the `MIGRATIONS` array
 * directly (it's not exported), and the `LATEST_REVISION` constant inside
 * migrate.ts is used only for log strings and has drifted from the actual
 * final array entry historically — see remediation log.  Running a fresh
 * migration once at startup and reading back the alembic_version row is
 * the most robust way to learn the current latest revision.
 */
let LATEST_REVISION = "";

function cleanup(): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

function createAlembicVersion(db: Database.Database, version: string): void {
  db.exec(
    "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)",
  );
  db.prepare("INSERT INTO alembic_version (version_num) VALUES (?)").run(
    version,
  );
}

describe("runMigrations() orchestrator", () => {
  beforeAll(() => {
    // Discover the current latest revision once.  See the LATEST_REVISION
    // declaration comment for why this isn't a static constant.
    const tmpPath = path.join(
      process.cwd(),
      `test-discover-latest-${process.pid}.db`,
    );
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      if (fs.existsSync(tmpPath + suffix)) {
        fs.unlinkSync(tmpPath + suffix);
      }
    }
    runMigrations(tmpPath);
    const db = new Database(tmpPath);
    const row = db.prepare("SELECT version_num FROM alembic_version").get() as {
      version_num: string;
    };
    db.close();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      if (fs.existsSync(tmpPath + suffix)) {
        fs.unlinkSync(tmpPath + suffix);
      }
    }
    LATEST_REVISION = row.version_num;
  });

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("throws when alembic_version contains an unknown revision string", () => {
    const db = new Database(TEST_DB_PATH);
    createAlembicVersion(db, "not-a-real-revision-id");
    db.close();

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(
      /Unknown Alembic version: not-a-real-revision-id/,
    );
  });

  it("is idempotent: running twice on a fresh db leaves the latest revision in place", () => {
    runMigrations(TEST_DB_PATH);
    runMigrations(TEST_DB_PATH);

    const db = new Database(TEST_DB_PATH);
    const result = db
      .prepare("SELECT version_num FROM alembic_version")
      .get() as { version_num: string };
    db.close();

    expect(result.version_num).toBe(LATEST_REVISION);
  });

  it("no-ops when the database is already at the latest revision and FTS is healthy", () => {
    // Run migrations once to reach latest state.
    runMigrations(TEST_DB_PATH);

    // Capture a "before" snapshot to assert nothing destructive happens on the
    // second pass.  Page count is a stable, side-effect-detecting metric:
    // VACUUM would change it; a clean no-op leaves it identical.
    const dbBefore = new Database(TEST_DB_PATH);
    const pagesBefore = (
      dbBefore.prepare("PRAGMA page_count").get() as { page_count: number }
    ).page_count;
    dbBefore.close();

    runMigrations(TEST_DB_PATH);

    const dbAfter = new Database(TEST_DB_PATH);
    const pagesAfter = (
      dbAfter.prepare("PRAGMA page_count").get() as { page_count: number }
    ).page_count;
    const version = (
      dbAfter.prepare("SELECT version_num FROM alembic_version").get() as {
        version_num: string;
      }
    ).version_num;
    dbAfter.close();

    expect(version).toBe(LATEST_REVISION);
    expect(pagesAfter).toBe(pagesBefore);
  });

  it("throws when tables exist but match no known migration state (corruption guard)", () => {
    // Create a database that has *some* tables but neither
    // alembic_version nor a structure matching the initial Alembic state.
    // The orchestrator must refuse rather than guess.
    const db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE some_random_table (
        id INTEGER PRIMARY KEY,
        data TEXT
      );
    `);
    db.close();

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(
      /Database has tables but structure doesn't match any known migration state/,
    );
  });

  it("applies every migration when starting from an empty database", () => {
    runMigrations(TEST_DB_PATH);

    const db = new Database(TEST_DB_PATH);
    const version = (
      db.prepare("SELECT version_num FROM alembic_version").get() as {
        version_num: string;
      }
    ).version_num;

    // Spot-check several tables created by different migration steps to
    // confirm the full sequence ran, not just the first step.
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    db.close();

    expect(version).toBe(LATEST_REVISION);
    expect(tableNames.has("messages")).toBe(true);
    expect(tableNames.has("alert_matches")).toBe(true); // migration 8
    expect(tableNames.has("timeseries_stats")).toBe(true); // migration 11
    expect(tableNames.has("rrd_import_registry")).toBe(true); // migration 11
  });

  it("triggers VACUUM/ANALYZE when FTS is stale even though no migrations ran", () => {
    // Reach latest revision first.
    runMigrations(TEST_DB_PATH);

    // Corrupt the FTS table into the legacy 8-column shape so the
    // verifyAndRepairFtsIfNeeded path triggers, which in turn forces the
    // "migrationsRan || ftsRepaired" branch to run VACUUM + ANALYZE.
    const db = new Database(TEST_DB_PATH);

    // Drop the modern FTS plumbing.
    db.exec("DROP TABLE IF EXISTS messages_fts");
    db.exec("DROP TRIGGER IF EXISTS messages_fts_insert");
    db.exec("DROP TRIGGER IF EXISTS messages_fts_delete");
    db.exec("DROP TRIGGER IF EXISTS messages_fts_update");

    // Recreate the legacy 8-column FTS table.  Schema borrowed from
    // migrate-fts-repair.test.ts which already pins this shape.
    db.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        msg_text, tail, flight, icao, toaddr, fromaddr, depa, dsta,
        content='messages',
        content_rowid='id'
      )
    `);
    db.close();

    // Run again — no migrations should run, but FTS repair must trigger
    // the VACUUM/ANALYZE block.  Smoke check: the call completes without
    // throwing and the FTS is back to the modern shape.
    runMigrations(TEST_DB_PATH);

    const dbAfter = new Database(TEST_DB_PATH);
    const ftsColumns = dbAfter
      .prepare("PRAGMA table_info(messages_fts)")
      .all() as Array<{ name: string }>;
    dbAfter.close();

    // Modern FTS has more than 8 columns (msg_text, station_id, toaddr,
    // fromaddr, depa, dsta, tail, flight, icao + extras).  The exact count
    // depends on the migration cadence; the legacy schema was strictly 8.
    expect(ftsColumns.length).toBeGreaterThan(8);
  });

  it("closes the database connection after the catch block re-throws", () => {
    // The orchestrator's error path is `catch (error) { logger.error(...);
    // db.close(); throw error; }`.  This test pins that db.close() runs by
    // confirming the file can be re-opened immediately after the throw
    // without a stale-handle "database is locked" error.
    const db = new Database(TEST_DB_PATH);
    createAlembicVersion(db, "definitely-not-a-revision");
    db.close();

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(/Unknown Alembic/);

    // If the catch block correctly closed the database, opening + querying
    // it again works without throwing.  This is a soft check on Linux
    // (advisory locking) but combined with the absence of a stale-handle
    // error from any subsequent test in the suite, it pins the close path.
    const db2 = new Database(TEST_DB_PATH);
    expect(() =>
      db2.prepare("SELECT version_num FROM alembic_version").get(),
    ).not.toThrow();
    db2.close();
  });
});

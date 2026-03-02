/**
 * Integration tests for RRD migration service
 *
 * WHY A PRE-BUILT FIXTURE
 * -----------------------
 * The original tests generated a fresh RRD file inside *each* `it` block by
 * calling `createTestRrdFile()`, which spawns `rrdtool update` with 120 data
 * points.  Six tests × ~20 s each pushed total runtime well past the CI
 * threshold, so all six were permanently skipped.
 *
 * The fix: `just seed-test-rrd` generates `test-fixtures/test.rrd` once and
 * commits it.  A single `beforeAll` copies that fixture into a temp path.
 * Every test reads from the copy, which takes < 100 ms total instead of ~2 min.
 *
 * Run `just seed-test-rrd` and commit the result whenever the RRD schema
 * changes.  See `scripts/generate-test-rrd.ts` for the fixture design.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  closeDatabase,
  getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/index.js";
import { timeseriesStats } from "../../db/schema.js";
import { isOldImportPath, type RrdArchive } from "../rrd-migration.js";

// ---------------------------------------------------------------------------
// Resolve the committed fixture path and load its metadata
// ---------------------------------------------------------------------------
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_RRD = resolve(__dirname, "../../../../test-fixtures/test.rrd");
const FIXTURE_META_PATH = resolve(
  __dirname,
  "../../../../test-fixtures/test.rrd.meta.json",
);

/**
 * Compact archive configuration for integration tests.
 *
 * WHY ABSOLUTE TIMESTAMPS
 * -----------------------
 * The production RRD_ARCHIVES use relative time ranges (e.g. "-25h") anchored
 * to "now". The committed fixture has data from a fixed past date (2024-01-01),
 * so a relative query like "-25h" returns only empty (NaN→0) time slots.
 *
 * We read the fixture metadata to obtain the exact start/end of the inserted
 * data window and build four small archives that only span 2–12 hours of that
 * window. Each archive fetches ≤120 points, the expansion yields ≤43 200 rows,
 * and the entire migration completes in under 5 seconds.
 */
function buildTestArchives(): RrdArchive[] {
  const meta = JSON.parse(readFileSync(FIXTURE_META_PATH, "utf-8")) as {
    anchorUnix: number;
    durationHours: number;
    stepSeconds: number;
  };

  const dataEnd = meta.anchorUnix + meta.durationHours * 3600;

  // Each archive covers a small window at the END of the fixture data so we
  // are guaranteed to hit real (non-NaN) values.
  return [
    {
      resolution: "1min",
      timeRange: String(dataEnd - 2 * 3600), // last 2 h at 1-min  → 120 pts
      endTime: String(dataEnd),
      step: 60,
    },
    {
      resolution: "5min",
      timeRange: String(dataEnd - 4 * 3600), // last 4 h at 5-min  →  48 pts
      endTime: String(dataEnd),
      step: 300,
    },
    {
      resolution: "1hour",
      timeRange: String(dataEnd - 6 * 3600), // last 6 h at 1-hour →   6 pts
      endTime: String(dataEnd),
      step: 3600,
    },
    {
      resolution: "6hour",
      timeRange: String(dataEnd - 12 * 3600), // last 12 h at 6-hour → 2 pts
      endTime: String(dataEnd),
      step: 21600,
    },
  ];
}

// Each test suite gets its own working copy so tests cannot interfere with
// each other even when run in parallel.
const WORK_DIR = join(tmpdir(), `rrd-integration-${process.pid}`);
const WORK_RRD = join(WORK_DIR, "test.rrd");

// ---------------------------------------------------------------------------
// Suite-level setup: copy fixture once, tear down after all tests
// ---------------------------------------------------------------------------
let TEST_ARCHIVES: RrdArchive[];

beforeAll(() => {
  if (!existsSync(FIXTURE_RRD)) {
    throw new Error(
      `RRD fixture not found at ${FIXTURE_RRD}.\n` +
        "Run `just seed-test-rrd` to generate it and commit the result.",
    );
  }
  if (!existsSync(FIXTURE_META_PATH)) {
    throw new Error(
      `RRD fixture metadata not found at ${FIXTURE_META_PATH}.\n` +
        "Run `just seed-test-rrd` to regenerate it.",
    );
  }

  TEST_ARCHIVES = buildTestArchives();

  mkdirSync(WORK_DIR, { recursive: true });
  copyFileSync(FIXTURE_RRD, WORK_RRD);
});

afterAll(() => {
  // Clean up the working copy and its .back counterpart (if any)
  for (const p of [WORK_RRD, `${WORK_RRD}.back`]) {
    if (existsSync(p)) unlinkSync(p);
  }
  // Remove work dir (best-effort)
  try {
    rmdirSync(WORK_DIR);
  } catch {
    // Ignore — temp dir cleanup is not critical
  }
});

// ---------------------------------------------------------------------------
// Per-test database setup
// ---------------------------------------------------------------------------
describe("RRD Migration Integration", () => {
  beforeEach(async () => {
    // Restore the working copy if a previous test renamed it to .back
    if (!existsSync(WORK_RRD)) {
      if (existsSync(`${WORK_RRD}.back`)) {
        copyFileSync(FIXTURE_RRD, WORK_RRD);
        unlinkSync(`${WORK_RRD}.back`);
      }
    }

    // Fresh in-memory database per test
    initDatabase(":memory:");

    const conn = getSqliteConnection();
    conn.exec(`
      CREATE TABLE IF NOT EXISTS timeseries_stats (
        timestamp   INTEGER PRIMARY KEY NOT NULL,
        acars_count INTEGER DEFAULT 0 NOT NULL,
        vdlm_count  INTEGER DEFAULT 0 NOT NULL,
        hfdl_count  INTEGER DEFAULT 0 NOT NULL,
        imsl_count  INTEGER DEFAULT 0 NOT NULL,
        irdm_count  INTEGER DEFAULT 0 NOT NULL,
        total_count INTEGER DEFAULT 0 NOT NULL,
        error_count INTEGER DEFAULT 0 NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rrd_import_registry (
        id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        file_hash     TEXT    NOT NULL UNIQUE,
        rrd_path      TEXT    NOT NULL,
        imported_at   INTEGER NOT NULL,
        rows_imported INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rrd_import_registry_hash
        ON rrd_import_registry (file_hash);
    `);
  });

  afterEach(() => {
    closeDatabase();

    // Restore working copy for the next test (migration renames it to .back)
    if (!existsSync(WORK_RRD)) {
      if (existsSync(`${WORK_RRD}.back`)) {
        copyFileSync(FIXTURE_RRD, WORK_RRD);
        unlinkSync(`${WORK_RRD}.back`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it("should migrate the pre-built RRD fixture", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    expect(existsSync(WORK_RRD)).toBe(true);

    const result = await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.rowsInserted).toBeGreaterThan(0);

    // Migration renames the file to .back (not .back2)
    expect(existsSync(`${WORK_RRD}.back`)).toBe(true);
    expect(existsSync(WORK_RRD)).toBe(false);

    // At least some rows were written to the database
    const db = getDatabase();
    const rows = db.select().from(timeseriesStats).all();

    expect(rows.length).toBeGreaterThan(0);

    // All counts must be non-negative integers
    for (const row of rows.slice(0, 20)) {
      expect(row.acarsCount).toBeGreaterThanOrEqual(0);
      expect(row.vdlmCount).toBeGreaterThanOrEqual(0);
      expect(row.totalCount).toBeGreaterThanOrEqual(0);
      expect(row.hfdlCount).toBeGreaterThanOrEqual(0);
      expect(row.errorCount).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("lifecycle: fresh import writes .back, second startup skips via registry rrd_path", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    // ── First startup: fresh import ──────────────────────────────────────────
    expect(existsSync(WORK_RRD)).toBe(true);
    const result1 = await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);
    expect(result1?.success).toBe(true);
    expect(result1?.rowsInserted).toBeGreaterThan(0);

    // After import the file is at .back and the canonical .rrd is gone.
    expect(existsSync(`${WORK_RRD}.back`)).toBe(true);
    expect(existsSync(WORK_RRD)).toBe(false);

    // Registry must record rrd_path = WORK_RRD (canonical path, not .back)
    const registryRow = getSqliteConnection()
      .prepare("SELECT rrd_path FROM rrd_import_registry LIMIT 1")
      .get() as { rrd_path: string } | undefined;

    expect(registryRow).toBeDefined();
    // Stored path must be the canonical .rrd path — does NOT end with ".back"
    expect(registryRow?.rrd_path).toBe(WORK_RRD);
    expect(isOldImportPath(registryRow?.rrd_path ?? "")).toBe(false);

    // ── Second startup: .back present with new rrd_path → skip ───────────────
    // The second call must detect the .back file, look up the registry, see
    // rrd_path does NOT end with ".back", and return null without re-importing.
    const rowsBefore = getDatabase().select().from(timeseriesStats).all().length;
    const result2 = await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);
    expect(result2).toBeNull();

    // Row count must be unchanged (no new rows inserted on skip)
    const rowsAfter = getDatabase().select().from(timeseriesStats).all().length;
    expect(rowsAfter).toBe(rowsBefore);
  }, 30000);

  it("old-import detection: .rrd.back with registry rrd_path ending .back triggers repair", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");
    const { createHash } = await import("node:crypto");

    // Simulate the state left by the OLD importer:
    //   1. Source file is at WORK_RRD.back (old importer renamed .rrd → .back)
    //   2. Registry has rrd_path = WORK_RRD.back (as tryRegisterBackupHash stored it)
    //   3. timeseries_stats has some rows (populated by old import)

    // Place the fixture at .back
    const WORK_BACK = `${WORK_RRD}.back`;
    copyFileSync(FIXTURE_RRD, WORK_BACK);

    // Ensure the canonical .rrd is absent so only .back triggers the branch
    if (existsSync(WORK_RRD)) unlinkSync(WORK_RRD);

    // Seed the DB with a "bad" row that looks like old-import output
    getSqliteConnection()
      .prepare(
        `INSERT OR IGNORE INTO timeseries_stats
         (timestamp, acars_count, vdlm_count, hfdl_count,
          imsl_count, irdm_count, total_count, error_count)
         VALUES (1735689900, 5, 3, 0, 0, 0, 8, 0)`,
      )
      .run();

    // Compute the hash of the backup file to populate the registry
    const backHash = createHash("sha256")
      .update(readFileSync(WORK_BACK))
      .digest("hex");

    // Register with the OLD path suffix — this is what tryRegisterBackupHash
    // stored under the previous sentinel strategy.
    getSqliteConnection()
      .prepare(
        `INSERT INTO rrd_import_registry (file_hash, rrd_path, imported_at, rows_imported)
         VALUES (?, ?, ?, ?)`,
      )
      .run(backHash, WORK_BACK, Date.now(), 1);

    // Confirm isOldImportPath classifies this path as an old import
    expect(isOldImportPath(WORK_BACK)).toBe(true);

    // Run migration — repair path must run, then re-import must succeed
    const result = await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.rowsInserted).toBeGreaterThan(0);

    // After repair + re-import, the file is at .back (new fixed import)
    expect(existsSync(`${WORK_RRD}.back`)).toBe(true);
    expect(existsSync(WORK_RRD)).toBe(false);

    // After repair, clearRegistryEntry deleted the old entry; the re-import
    // registered a new row under the canonical path (not .back).
    const newEntry = getSqliteConnection()
      .prepare(
        "SELECT rrd_path FROM rrd_import_registry ORDER BY imported_at DESC LIMIT 1",
      )
      .get() as { rrd_path: string } | undefined;

    expect(newEntry).toBeDefined();
    expect(isOldImportPath(newEntry?.rrd_path ?? "")).toBe(false);
    expect(newEntry?.rrd_path).toBe(WORK_RRD);
  }, 60000);

  it("should correctly expand 5-minute archive data to 1-minute resolution", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    const db = getDatabase();

    const rows = db
      .select()
      .from(timeseriesStats)
      .orderBy(timeseriesStats.timestamp)
      .all();

    expect(rows.length).toBeGreaterThan(0);

    // Consecutive timestamps must differ by exactly 60 seconds (all data is
    // expanded to 1-minute buckets — the resolution column was removed in
    // migration 12 since all data is always 1-minute).
    if (rows.length > 1) {
      const diff = Math.abs(rows[1].timestamp - rows[0].timestamp);
      expect(diff).toBe(60);
    }
  }, 30000);

  it("should skip all-NaN rows so no NaN values appear in the database", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    // RRD archives that extend beyond inserted data contain -nan values.
    // Previously these were converted to 0 and inserted, polluting the DB with
    // false zeros.  After the fix, all-NaN rows are skipped entirely — no row
    // is ever inserted for them.  The invariant we test here is unchanged: no
    // column in the database should be NaN (either because the row was skipped
    // or because only partial NaN was present and the NaN columns mapped to 0).
    await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    const db = getDatabase();
    const rows = db.select().from(timeseriesStats).limit(200).all();

    // At least some rows from the fixture's real data window must be present.
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(Number.isNaN(row.acarsCount)).toBe(false);
      expect(Number.isNaN(row.vdlmCount)).toBe(false);
      expect(Number.isNaN(row.hfdlCount)).toBe(false);
      expect(Number.isNaN(row.imslCount)).toBe(false);
      expect(Number.isNaN(row.irdmCount)).toBe(false);
      expect(Number.isNaN(row.totalCount)).toBe(false);
      expect(Number.isNaN(row.errorCount)).toBe(false);
    }
  }, 30000);

  it("should verify data values are within expected ranges", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    const db = getDatabase();

    // The fixture was generated by generate-test-rrd.ts with deterministic
    // sine/cosine values.  Known ranges (see dataValues() in the script):
    //   ACARS  :  1 – 15  (10 ± 5)
    //   VDLM   :  1 – 30  (20 ± 10)
    //   HFDL   :  0 –  8  (5.5 ± 2.5)
    //   IMSL   :  0 –  2
    //   IRDM   :  0 –  1
    //   TOTAL  = ACARS + VDLM + HFDL + IMSL + IRDM  ≤ ~56
    //
    // We only sample 1-min rows from the core of the dataset to avoid edge
    // rows that carry RRD NaN-padding (which maps to 0 after conversion).
    const rows = db
      .select()
      .from(timeseriesStats)
      .orderBy(timeseriesStats.timestamp)
      .all();

    // Filter to rows that look like real data (non-zero counts)
    const realRows = rows.filter((r) => r.acarsCount > 0 || r.vdlmCount > 0);
    expect(realRows.length).toBeGreaterThan(0);

    for (const row of realRows) {
      expect(row.acarsCount).toBeGreaterThanOrEqual(0);
      expect(row.acarsCount).toBeLessThanOrEqual(20);
      expect(row.vdlmCount).toBeGreaterThanOrEqual(0);
      expect(row.vdlmCount).toBeLessThanOrEqual(35);
      expect(row.hfdlCount).toBeGreaterThanOrEqual(0);
      expect(row.hfdlCount).toBeLessThanOrEqual(10);
      expect(row.totalCount).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("should return meaningful migration statistics", async () => {
    const { migrateRrdToSqlite } = await import("../rrd-migration.js");

    const result = await migrateRrdToSqlite(WORK_RRD, TEST_ARCHIVES);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.rowsInserted).toBeGreaterThan(0);
    // Duration should be a positive finite number (in milliseconds)
    expect(result?.duration).toBeGreaterThan(0);
    expect(Number.isFinite(result?.duration)).toBe(true);
    // Should complete within a reasonable time (30 s generous upper bound)
    expect(result?.duration).toBeLessThan(30_000);
  }, 30000);
});

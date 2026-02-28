/**
 * Unit tests for RRD migration service
 *
 * Tests RRD data parsing, batch insertion, and migration orchestration,
 * including the hash-based import registry that prevents re-importing the
 * same RRD content if a user renames .rrd.back back to .rrd.
 */

import * as child_process from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  type getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/index.js";

// Mock dependencies before importing the module
vi.mock("node:fs");
// Use a manual factory mock so that exec is a plain vi.fn() with NO
// util.promisify.custom symbol.  The auto-mock copies that symbol from
// the original exec, which causes promisify(execMock) to invoke the real
// exec internally (bypassing our implementation entirely).
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const MOCK_RRD_PATH = "/test/acarshub.rrd";
const MOCK_RRD_CONTENT = Buffer.from("fake-rrd-binary-content");
const MOCK_RRD_HASH = createHash("sha256")
  .update(MOCK_RRD_CONTENT)
  .digest("hex");

const SINGLE_LINE_RRD_OUTPUT = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0000000000e+00 2.0000000000e+00 3.0000000000e+00 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a getDatabase mock whose insert chain exposes .run(),
 * onConflictDoNothing(), and onConflictDoUpdate(), and whose select chain
 * returns the given row count.
 *
 * The select.from.where.get() path returns `undefined` (hash not found in
 * registry) by default.  Tests that need the hash to appear as registered
 * should use a real in-memory database instead.
 */
function makeDbMock(rowCount = 0) {
  const runFn = vi.fn();
  const insertChain = {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ run: runFn }),
      onConflictDoUpdate: vi.fn().mockReturnValue({ run: runFn }),
      run: runFn,
    }),
  };
  const deleteChain = {
    where: vi.fn().mockReturnValue({ run: runFn }),
  };
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(undefined), // registry: hash not found
        }),
        get: vi.fn().mockReturnValue({ count: rowCount }),
      }),
    }),
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
  };
}

/**
 * Spy getSqliteConnection() to return a stub whose exec() is a no-op.
 * This prevents ensureRegistryTable() from throwing in tests that mock
 * getDatabase() and never call initDatabase().
 */
async function stubSqliteConnection() {
  const execFn = vi.fn();
  vi.spyOn(
    await import("../../db/index.js"),
    "getSqliteConnection",
  ).mockReturnValue({
    exec: execFn,
  } as unknown as ReturnType<typeof getSqliteConnection>);
  return execFn;
}

/**
 * Wire up the standard fs/DB/exec mocks used by most migrateRrdToSqlite tests.
 * Returns the exec mock so callers can override behaviour per-test.
 */
async function setupMigrationMocks(
  opts: {
    rrdExists?: boolean;
    backExists?: boolean;
    back2Exists?: boolean;
    rrdContent?: Buffer;
    execOutput?: string;
  } = {},
) {
  const {
    rrdExists = true,
    backExists = false,
    back2Exists = false,
    rrdContent = MOCK_RRD_CONTENT,
    execOutput = SINGLE_LINE_RRD_OUTPUT,
  } = opts;

  vi.mocked(fs.existsSync).mockImplementation((p) => {
    if (p === MOCK_RRD_PATH) return rrdExists;
    if (p === `${MOCK_RRD_PATH}.back`) return backExists;
    if (p === `${MOCK_RRD_PATH}.back2`) return back2Exists;
    return false;
  });

  vi.mocked(fs.statSync).mockReturnValue({
    isFile: () => true,
    size: rrdContent.length,
  } as fs.Stats);

  vi.mocked(fs.renameSync).mockImplementation(() => {});

  // readFileSync is called by computeFileHash()
  vi.mocked(fs.readFileSync).mockReturnValue(rrdContent);

  vi.spyOn(
    await import("../../db/index.js"),
    "getDatabase",
  ).mockReturnValue(makeDbMock() as unknown as ReturnType<typeof getDatabase>);

  await stubSqliteConnection();

  const execMock = vi.fn(
    (
      _cmd: string,
      _options: unknown,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string } | null,
      ) => void,
    ) => {
      callback(null, { stdout: execOutput, stderr: "" });
    },
  );
  vi.mocked(child_process.exec).mockImplementation(
    execMock as unknown as typeof child_process.exec,
  );

  return execMock;
}

// ---------------------------------------------------------------------------
// Helper: set up a real in-memory DB with both tables the importer needs
// ---------------------------------------------------------------------------

function setupInMemoryDb() {
  initDatabase(":memory:");
  getSqliteConnection().exec(`
    CREATE TABLE IF NOT EXISTS timeseries_stats (
      timestamp   INTEGER PRIMARY KEY NOT NULL,
      acars_count INTEGER DEFAULT 0 NOT NULL,
      vdlm_count  INTEGER DEFAULT 0 NOT NULL,
      hfdl_count  INTEGER DEFAULT 0 NOT NULL,
      imsl_count  INTEGER DEFAULT 0 NOT NULL,
      irdm_count  INTEGER DEFAULT 0 NOT NULL,
      total_count INTEGER DEFAULT 0 NOT NULL,
      error_count INTEGER DEFAULT 0 NOT NULL
    )
  `);
  getSqliteConnection().exec(`
    CREATE TABLE IF NOT EXISTS rrd_import_registry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      file_hash     TEXT    NOT NULL UNIQUE,
      rrd_path      TEXT    NOT NULL,
      imported_at   INTEGER NOT NULL,
      rows_imported INTEGER NOT NULL DEFAULT 0
    )
  `);
  getSqliteConnection().exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rrd_import_registry_hash
    ON rrd_import_registry (file_hash)
  `);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("RRD Migration Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // parseRrdOutput (exercised indirectly via migrateRrdToSqlite)
  // =========================================================================

  describe("parseRrdOutput", () => {
    afterEach(() => {
      closeDatabase();
    });

    it("should parse valid RRD output and return data points", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 9.9723720000e-01 2.4930930000e+01 3.3906064800e+01 0.0000000000e+00 7.9778976000e+00 0.0000000000e+00 0.0000000000e+00
1771282320: 2.9898751667e+00 2.0025312083e+01 3.5989875167e+01 0.0000000000e+00 1.2974687917e+01 0.0000000000e+00 0.0000000000e+00`;

      await setupMigrationMocks({ execOutput: mockOutput });

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      // 2 data points × 4 archives = rows inserted (after expand each may differ,
      // but at least some rows must have been inserted)
      expect(result?.rowsInserted).toBeGreaterThan(0);
    });

    it("regression: all-NaN rows are skipped and do NOT produce zero-count DB rows", async () => {
      // BEFORE THE FIX: parseRrdOutput converted -nan to 0 and inserted the row.
      // AFTER THE FIX:  rows where every column is -nan are skipped entirely so
      //                 the DB is not polluted with false zeros and future timestamps
      //                 are not pre-occupied.
      //
      // We use a real in-memory DB so we can directly assert the inserted row count.
      // Only the 1-min archive (first exec call) returns the test data; the coarse
      // archives return empty output so their backward expansions cannot generate
      // sub-rows that land on nanTimestamp by coincidence.
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === MOCK_RRD_PATH) return true;
        if (p === `${MOCK_RRD_PATH}.back`) return false;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      // One all-NaN row followed by one valid row, fed only to the 1-min archive.
      // The NaN row must NOT appear in the DB after migration.
      // Timestamps chosen well in the past so they are below Date.now().
      const nanTimestamp = 1771282260;
      const validTimestamp = 1771282320;
      const realOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

${nanTimestamp}: -nan -nan -nan -nan -nan -nan -nan
${validTimestamp}: 2.9898751667e+00 2.0025312083e+01 3.5989875167e+01 0.0000000000e+00 1.2974687917e+01 0.0000000000e+00 0.0000000000e+00`;

      // Empty output for archives 1-min (index 0) only gets the real rows.
      // Coarse archives (5-min, 1-hour, 6-hour) return header-only so their
      // backward expansions cannot coincidentally produce a row at nanTimestamp.
      const emptyOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

`;
      let nanCallIndex = 0;
      vi.mocked(child_process.exec).mockImplementation(
        ((
          _cmd: string,
          _opts: unknown,
          cb: (e: Error | null, r: { stdout: string; stderr: string } | null) => void,
        ) => {
          const output = nanCallIndex === 0 ? realOutput : emptyOutput;
          nanCallIndex++;
          cb(null, { stdout: output, stderr: "" });
        }) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(true);

      // The NaN row must not appear in the database at all.
      const { getDatabase: getDb } = await import("../../db/index.js");
      const { timeseriesStats: tsStats } = await import("../../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      const nanRow = db
        .select()
        .from(tsStats)
        .where(eq(tsStats.timestamp, nanTimestamp))
        .get();
      expect(nanRow).toBeUndefined();

      // The valid 1-min row must be present (1 row, kept as-is — no expansion).
      expect(result?.rowsInserted).toBe(1);
    });

    it("regression: migration still succeeds when input contains only NaN rows", async () => {
      // If every row is NaN (e.g. stale RRD with no recent data), migration
      // should report 0 rows inserted and success: false (no data), not throw.
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === MOCK_RRD_PATH) return true;
        if (p === `${MOCK_RRD_PATH}.back`) return false;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      const allNanOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282200: -nan -nan -nan -nan -nan -nan -nan
1771282260: -nan -nan -nan -nan -nan -nan -nan
1771282320: -nan -nan -nan -nan -nan -nan -nan`;

      vi.mocked(child_process.exec).mockImplementation(
        ((
          _cmd: string,
          _opts: unknown,
          cb: (e: Error | null, r: { stdout: string; stderr: string } | null) => void,
        ) => cb(null, { stdout: allNanOutput, stderr: "" })) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // All-NaN input → no data points → migration reports failure (no rows)
      expect(result?.success).toBe(false);
      expect(result?.rowsInserted).toBe(0);
    });

    it("should round decimal values to integers", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 9.9723720000e-01 2.4930930000e+01 3.3906064800e+01 0.0000000000e+00 7.9778976000e+00 0.0000000000e+00 0.0000000000e+00`;

      await setupMigrationMocks({ execOutput: mockOutput });

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(true);
    });

    it("should skip malformed lines and still process valid ones", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0
NOT_A_TIMESTAMP: bad data here
1771282320: 4.0 5.0 6.0 0.0 0.0 0.0 0.0`;

      await setupMigrationMocks({ execOutput: mockOutput });

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(true);
      expect(result?.rowsInserted).toBeGreaterThan(0);
    });

    it("regression: 5-minute archive points expand BACKWARD to cover historical period", async () => {
      // BEFORE THE FIX: expandCoarseDataToOneMinute started expansion at T and
      //   went forward (T, T+60, T+120, T+180, T+240), shifting data into the
      //   future and creating rows beyond the RRD's last_update.
      // AFTER THE FIX:  expansion goes backward from the end-of-period timestamp T:
      //   T-240, T-180, T-120, T-60, T — matching the actual period [T-300, T].
      //
      // We use a real in-memory DB and a 5-min archive rrdtool output so we can
      // inspect the exact timestamps inserted.
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === MOCK_RRD_PATH) return true;
        if (p === `${MOCK_RRD_PATH}.back`) return false;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      // Use a timestamp well in the past (2025-01-01 00:05:00 UTC = 1735689900)
      // so all expanded rows are below Date.now() and pass the future-clamp filter.
      const fiveMinPoint = 1735689900; // T — end of the 5-min period [T-300, T]
      const fiveMinOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

${fiveMinPoint}: 5.0000000000e+00 1.0000000000e+01 1.5000000000e+01 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00`;

      // Override exec so the first archive call returns 5-min data and the others
      // return empty output (header only, no data rows).
      const emptyOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

`;
      let callIndex = 0;
      vi.mocked(child_process.exec).mockImplementation(
        ((
          _cmd: string,
          _opts: unknown,
          cb: (e: Error | null, r: { stdout: string; stderr: string } | null) => void,
        ) => {
          // Archives are fetched in order: 1min, 5min, 1hour, 6hour.
          // Return real data only for the 5-min archive (index 1).
          const output = callIndex === 1 ? fiveMinOutput : emptyOutput;
          callIndex++;
          cb(null, { stdout: output, stderr: "" });
        }) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      await migrateRrdToSqlite(MOCK_RRD_PATH);

      const { timeseriesStats } = await import("../../db/schema.js");
      const { asc } = await import("drizzle-orm");
      const { getDatabase: getDb2 } = await import("../../db/index.js");
      const db = getDb2();
      const rows = db
        .select()
        .from(timeseriesStats)
        .orderBy(asc(timeseriesStats.timestamp))
        .all();

      // A 5-min point at T should expand to exactly 5 rows:
      //   T-240, T-180, T-120, T-60, T
      const expectedTimestamps = [
        fiveMinPoint - 240,
        fiveMinPoint - 180,
        fiveMinPoint - 120,
        fiveMinPoint - 60,
        fiveMinPoint,
      ];

      expect(rows.length).toBe(5);
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].timestamp).toBe(expectedTimestamps[i]);
      }

      // The row AFTER T must NOT exist (old bug produced T+60, T+120, … instead).
      const { eq } = await import("drizzle-orm");
      const futureRow = db
        .select()
        .from(timeseriesStats)
        .where(eq(timeseriesStats.timestamp, fiveMinPoint + 60))
        .get();
      expect(futureRow).toBeUndefined();
    });

    it("regression: future-timestamp rows are clamped and not inserted", async () => {
      // Rows whose timestamp > Date.now() must be dropped by the clamp step
      // even if they somehow survive NaN-filtering and backward expansion.
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === MOCK_RRD_PATH) return true;
        if (p === `${MOCK_RRD_PATH}.back`) return false;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      // A 1-min point whose timestamp is 10 years in the future.
      const futureTs = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
      const futureOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

${futureTs}: 1.0000000000e+00 2.0000000000e+00 3.0000000000e+00 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00 0.0000000000e+00`;

      vi.mocked(child_process.exec).mockImplementation(
        ((
          _cmd: string,
          _opts: unknown,
          cb: (e: Error | null, r: { stdout: string; stderr: string } | null) => void,
        ) => cb(null, { stdout: futureOutput, stderr: "" })) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // No rows should have been inserted — the future timestamp is clamped.
      expect(result?.rowsInserted).toBe(0);

      const { timeseriesStats } = await import("../../db/schema.js");
      const { getDatabase: getDb3 } = await import("../../db/index.js");
      const db = getDb3();
      const allRows = db.select().from(timeseriesStats).all();
      expect(allRows.length).toBe(0);
    });
  });

  // =========================================================================
  // migrateRrdToSqlite — orchestration
  // =========================================================================

  describe("migrateRrdToSqlite", () => {
    afterEach(() => {
      closeDatabase();
    });

    it("should skip migration if .back2 file exists and timeseries_stats has data", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === `${MOCK_RRD_PATH}.back2`;
      });

      // .back2 file exists and DB has rows → already migrated with fixed code, skip
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ count: 42 }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      // .back2 file must be readable for tryRegisterBackupHash()
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);
      await stubSqliteConnection();

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result).toBeNull();
    });

    it("should re-migrate if .back2 file exists but timeseries_stats is empty", async () => {
      // Use a real in-memory database — avoids mock-chain fragility for the
      // COUNT query, INSERT, and registry table creation.
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        // Both .back2 and original appear to exist (renameSync is mocked as no-op)
        return p === `${MOCK_RRD_PATH}.back2` || p === MOCK_RRD_PATH;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: SINGLE_LINE_RRD_OUTPUT, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.rowsInserted).toBeGreaterThan(0);

      // Must restore the .back2 sentinel before re-migrating
      expect(fs.renameSync).toHaveBeenCalledWith(
        `${MOCK_RRD_PATH}.back2`,
        MOCK_RRD_PATH,
      );
    });

    it("should run repair and re-import when .back (old buggy import) file exists", async () => {
      // The .back sentinel means the file was imported with the old buggy code.
      // The repair path must: call rrdtool info, delete bad rows, clear registry,
      // restore .back → .rrd, then complete a fresh import → rename to .back2.
      setupInMemoryDb();

      // Simulate .back existing (old import), .rrd re-appears after rename mock
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === `${MOCK_RRD_PATH}.back` || p === MOCK_RRD_PATH;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      // rrdtool info is called first (repair), then 4 archive fetches follow.
      // Return a valid info block for the first call; real archive data for the rest.
      const RRD_INFO_OUTPUT = `filename = "${MOCK_RRD_PATH}.back"\nrrd_version = "0003"\nstep = 60\nlast_update = 1735689900\n`;
      let callIndex = 0;
      vi.mocked(child_process.exec).mockImplementation(
        ((
          _cmd: string,
          _opts: unknown,
          cb: (
            e: Error | null,
            r: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          const output =
            callIndex === 0 ? RRD_INFO_OUTPUT : SINGLE_LINE_RRD_OUTPUT;
          callIndex++;
          cb(null, { stdout: output, stderr: "" });
        }) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // Fresh import must succeed
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.rowsInserted).toBeGreaterThan(0);

      // Repair must have restored .back → .rrd
      expect(fs.renameSync).toHaveBeenCalledWith(
        `${MOCK_RRD_PATH}.back`,
        MOCK_RRD_PATH,
      );

      // Final rename must be to .back2 (not .back)
      const renameCalls = vi.mocked(fs.renameSync).mock.calls;
      const back2Rename = renameCalls.find(
        ([, dest]) => dest === `${MOCK_RRD_PATH}.back2`,
      );
      expect(back2Rename).toBeDefined();
      expect(back2Rename?.[0]).toBe(MOCK_RRD_PATH);
    });

    it("should skip migration if RRD file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result).toBeNull();
    });

    it("should handle corrupted RRD file (zero size)", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 0, // Empty file → invalid
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(false);
      expect(result?.rowsInserted).toBe(0);
      expect(fs.renameSync).toHaveBeenCalledWith(
        MOCK_RRD_PATH,
        `${MOCK_RRD_PATH}.corrupt`,
      );
    });

    it("should rename RRD file to .back2 on successful migration", async () => {
      await setupMigrationMocks();

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      await migrateRrdToSqlite(MOCK_RRD_PATH);

      // The final rename must produce .back2 (the clean-import sentinel)
      const renameCalls = vi.mocked(fs.renameSync).mock.calls;
      const back2Rename = renameCalls.find(
        ([, dest]) => dest === `${MOCK_RRD_PATH}.back2`,
      );
      expect(back2Rename).toBeDefined();
      expect(back2Rename?.[0]).toBe(MOCK_RRD_PATH);

      // .back must NOT be produced by a fresh import
      const backRename = renameCalls.find(
        ([, dest]) => dest === `${MOCK_RRD_PATH}.back`,
      );
      expect(backRename).toBeUndefined();
    });

    it("should handle rrdtool command failure gracefully", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);
      await stubSqliteConnection();
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(makeDbMock() as unknown as ReturnType<typeof getDatabase>);

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(new Error("rrdtool not found"), null);
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(false);
      expect(result?.rowsInserted).toBe(0);
    });

    it("should fetch all 4 archive resolutions", async () => {
      const execMock = await setupMigrationMocks();

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      await migrateRrdToSqlite(MOCK_RRD_PATH);

      // 4 archives → 4 rrdtool fetch calls
      expect(execMock).toHaveBeenCalledTimes(4);
    });

    it("should continue with other archives if one fails", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(makeDbMock() as unknown as ReturnType<typeof getDatabase>);
      await stubSqliteConnection();

      let callCount = 0;
      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callCount++;
          if (callCount === 2) {
            callback(new Error("Archive 2 failed"), null);
          } else {
            callback(null, { stdout: SINGLE_LINE_RRD_OUTPUT, stderr: "" });
          }
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // 3 archives succeed → migration still completes
      expect(result?.success).toBe(true);
      expect(execMock).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // RRD Import Registry
  // =========================================================================

  describe("RRD Import Registry", () => {
    afterEach(() => {
      closeDatabase();
    });

    it("regression: skips import when hash of presented .rrd matches a previously imported file", async () => {
      // Scenario: user ran migration successfully (hash registered), then
      // renamed .rrd.back2 back to .rrd.  The importer must detect the
      // content match and skip without inserting any rows.
      setupInMemoryDb();

      // Pre-populate registry with the hash of our mock RRD content
      getSqliteConnection()
        .prepare(
          `INSERT INTO rrd_import_registry (file_hash, rrd_path, imported_at, rows_imported)
           VALUES (?, ?, ?, ?)`,
        )
        .run(MOCK_RRD_HASH, `${MOCK_RRD_PATH}.back2`, Date.now(), 100);

      // File system: only the .rrd file exists (renamed from .back2)
      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      // readFileSync must return the same content so the hash matches
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      const execMock = vi.fn();
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // Must skip — hash was already registered
      expect(result).toBeNull();

      // rrdtool must never have been called
      expect(execMock).not.toHaveBeenCalled();

      // Must rename the file back to .back2 (belt-and-suspenders cleanup)
      expect(fs.renameSync).toHaveBeenCalledWith(
        MOCK_RRD_PATH,
        `${MOCK_RRD_PATH}.back2`,
      );
    });

    it("registers hash after successful import so future re-imports are blocked", async () => {
      setupInMemoryDb();

      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      vi.mocked(child_process.exec).mockImplementation(
        vi.fn(
          (
            _cmd: string,
            _options: unknown,
            callback: (
              error: Error | null,
              result: { stdout: string; stderr: string } | null,
            ) => void,
          ) => {
            callback(null, { stdout: SINGLE_LINE_RRD_OUTPUT, stderr: "" });
          },
        ) as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // Migration should succeed
      expect(result?.success).toBe(true);

      // Hash must now be in the registry
      const registryRow = getSqliteConnection()
        .prepare("SELECT file_hash FROM rrd_import_registry WHERE file_hash = ?")
        .get(MOCK_RRD_HASH) as { file_hash: string } | undefined;

      expect(registryRow).toBeDefined();
      expect(registryRow?.file_hash).toBe(MOCK_RRD_HASH);
    });

    it("proceeds with import when hash is not in registry (new file)", async () => {
      setupInMemoryDb();
      // Registry is empty — a genuinely new RRD file should be imported

      vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: MOCK_RRD_CONTENT.length,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: SINGLE_LINE_RRD_OUTPUT, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      expect(result?.success).toBe(true);
      expect(result?.rowsInserted).toBeGreaterThan(0);
      // rrdtool must have been called (all 4 archives)
      expect(execMock).toHaveBeenCalledTimes(4);
    });

    it("INSERT OR IGNORE prevents duplicate rows when same data is imported twice", async () => {
      // Verifies that even if the hash check is somehow bypassed,
      // the UNIQUE constraint + onConflictDoNothing() prevents doubling.
      setupInMemoryDb();

      const execImpl = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: SINGLE_LINE_RRD_OUTPUT, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execImpl as unknown as typeof child_process.exec,
      );

      const setupFs = () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_RRD_PATH);
        vi.mocked(fs.statSync).mockReturnValue({
          isFile: () => true,
          size: MOCK_RRD_CONTENT.length,
        } as fs.Stats);
        vi.mocked(fs.renameSync).mockImplementation(() => {});
        vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);
      };

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      // First import
      setupFs();
      const first = await migrateRrdToSqlite(MOCK_RRD_PATH);
      expect(first?.success).toBe(true);

      // Count rows after first import
      const rowsAfterFirst = (
        getSqliteConnection()
          .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
          .get() as { n: number }
      ).n;
      expect(rowsAfterFirst).toBeGreaterThan(0);

      // Clear registry so the hash check doesn't short-circuit the second import
      getSqliteConnection().exec("DELETE FROM rrd_import_registry");

      // Second import of the exact same content
      setupFs();
      vi.mocked(child_process.exec).mockImplementation(
        execImpl as unknown as typeof child_process.exec,
      );
      await migrateRrdToSqlite(MOCK_RRD_PATH);

      // Row count must be identical — INSERT OR IGNORE silently skipped all dupes
      const rowsAfterSecond = (
        getSqliteConnection()
          .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
          .get() as { n: number }
      ).n;

      expect(rowsAfterSecond).toBe(rowsAfterFirst);
    });

    it("registers .rrd.back2 hash on startup for pre-registry deployments", async () => {
      // Scenario: deployment has .rrd.back2 and rows but no registry entry
      // (e.g. the registry table was added after the initial import ran).
      // First startup after the registry feature ships must register the hash
      // of the .back2 file so a future rename-back is caught.
      setupInMemoryDb();

      // Insert a sentinel row so "rowCount > 0" is satisfied
      getSqliteConnection()
        .prepare(
          `INSERT INTO timeseries_stats
             (timestamp, acars_count, vdlm_count, hfdl_count,
              imsl_count, irdm_count, total_count, error_count)
           VALUES (1771282260, 1, 0, 0, 0, 0, 1, 0)`,
        )
        .run();

      // Only the .back2 file exists (clean import already done)
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === `${MOCK_RRD_PATH}.back2`,
      );
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RRD_CONTENT);

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");
      const result = await migrateRrdToSqlite(MOCK_RRD_PATH);

      // Migration is correctly skipped (data already present)
      expect(result).toBeNull();

      // Hash of .back2 file must now be in registry
      const registryRow = getSqliteConnection()
        .prepare("SELECT file_hash FROM rrd_import_registry WHERE file_hash = ?")
        .get(MOCK_RRD_HASH) as { file_hash: string } | undefined;

      expect(registryRow).toBeDefined();
      expect(registryRow?.file_hash).toBe(MOCK_RRD_HASH);
    });
  });

  // =========================================================================
  // queryTimeseriesData
  // =========================================================================

  describe("queryTimeseriesData", () => {
    beforeEach(() => {
      initDatabase(":memory:");
      getSqliteConnection().exec(`
        CREATE TABLE IF NOT EXISTS timeseries_stats (
          timestamp   INTEGER PRIMARY KEY NOT NULL,
          acars_count INTEGER DEFAULT 0 NOT NULL,
          vdlm_count  INTEGER DEFAULT 0 NOT NULL,
          hfdl_count  INTEGER DEFAULT 0 NOT NULL,
          imsl_count  INTEGER DEFAULT 0 NOT NULL,
          irdm_count  INTEGER DEFAULT 0 NOT NULL,
          total_count INTEGER DEFAULT 0 NOT NULL,
          error_count INTEGER DEFAULT 0 NOT NULL
        )
      `);
    });

    afterEach(() => {
      closeDatabase();
    });

    it("should return empty array when no data exists", async () => {
      const { queryTimeseriesData } = await import("../rrd-migration.js");
      const result = await queryTimeseriesData("1min", 1771282000, 1771283000);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getLatestTimeseriesData
  // =========================================================================

  describe("getLatestTimeseriesData", () => {
    beforeEach(() => {
      initDatabase(":memory:");
      getSqliteConnection().exec(`
        CREATE TABLE IF NOT EXISTS timeseries_stats (
          timestamp   INTEGER PRIMARY KEY NOT NULL,
          acars_count INTEGER DEFAULT 0 NOT NULL,
          vdlm_count  INTEGER DEFAULT 0 NOT NULL,
          hfdl_count  INTEGER DEFAULT 0 NOT NULL,
          imsl_count  INTEGER DEFAULT 0 NOT NULL,
          irdm_count  INTEGER DEFAULT 0 NOT NULL,
          total_count INTEGER DEFAULT 0 NOT NULL,
          error_count INTEGER DEFAULT 0 NOT NULL
        )
      `);
    });

    afterEach(() => {
      closeDatabase();
    });

    it("should return null when no data exists", async () => {
      const { getLatestTimeseriesData } = await import("../rrd-migration.js");
      const result = await getLatestTimeseriesData();
      expect(result).toBeNull();
    });

    it("should return null for empty table (1min default resolution)", async () => {
      const { getLatestTimeseriesData } = await import("../rrd-migration.js");
      const result = await getLatestTimeseriesData("1min");
      expect(result).toBeNull();
    });
  });
});

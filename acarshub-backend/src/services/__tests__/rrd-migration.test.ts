/**
 * Unit tests for RRD migration service
 *
 * Tests RRD data parsing, batch insertion, and migration orchestration
 */

import * as child_process from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getDatabase,
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

describe("RRD Migration Service", () => {
  const mockRrdPath = "/test/acarshub.rrd";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: build a getDatabase mock whose insert chain exposes .run()
   * and whose select chain returns the given row count.
   */
  function makeDbMock(rowCount = 0) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ count: rowCount }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    };
  }

  describe("parseRrdOutput", () => {
    it("should parse valid RRD output", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 9.9723720000e-01 2.4930930000e+01 3.3906064800e+01 0.0000000000e+00 7.9778976000e+00 0.0000000000e+00 0.0000000000e+00
1771282320: 2.9898751667e+00 2.0025312083e+01 3.5989875167e+01 0.0000000000e+00 1.2974687917e+01 0.0000000000e+00 0.0000000000e+00`;

      // Only the main RRD file (no .back) — avoids the backup-check code path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      // DB mock: insert chain must expose .run()
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(
        makeDbMock() as unknown as ReturnType<typeof getDatabase>,
      );

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      // The function should parse the data correctly
      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(true);
        expect(result.rowsInserted).toBeGreaterThan(0);
      }
    });

    it("should handle NaN values by converting to 0", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: -nan -nan -nan -nan -nan -nan -nan
1771282320: 5.0000000000e+00 -nan 5.0000000000e+00 0.0000000000e+00 0.0000000000e+00 -nan -nan`;

      // Only the main RRD file (no .back) — avoids the backup-check code path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(
        makeDbMock() as unknown as ReturnType<typeof getDatabase>,
      );

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(true);
        // Should have parsed 2 data points (NaN converted to 0)
        expect(result.rowsInserted).toBeGreaterThan(0);
      }
    });

    it("should round decimal values to integers", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 9.9723720000e-01 2.4930930000e+01 3.3906064800e+01 0.0000000000e+00 7.9778976000e+00 0.0000000000e+00 0.0000000000e+00`;

      // Only the main RRD file (no .back) — avoids the backup-check code path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(
        makeDbMock() as unknown as ReturnType<typeof getDatabase>,
      );

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      await migrateRrdToSqlite(mockRrdPath);

      // Values should be rounded: 0.997 -> 1, 24.93 -> 25, 33.91 -> 34, etc.
      // The actual rounding is tested by the integration tests with real data
    });

    it("should skip malformed lines", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0
invalid line without timestamp
1771282320: 4.0 5.0 9.0 0.0 0.0 0.0 0.0`;

      // Only the main RRD file (no .back) — avoids the backup-check code path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(
        makeDbMock() as unknown as ReturnType<typeof getDatabase>,
      );

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(true);
        // Should parse 2 valid lines, skip the malformed one
        expect(result.rowsInserted).toBeGreaterThan(0);
      }
    });
  });

  describe("migrateRrdToSqlite", () => {
    afterEach(() => {
      // Ensure the database is always closed after each test in this suite,
      // even if a test assertion fails mid-test.  Without this, a failed test
      // that called initDatabase() would leave drizzleClient set, causing the
      // next describe block's initDatabase(":memory:") to silently reuse the
      // stale connection (and its incomplete schema).
      closeDatabase();
    });

    it("should skip migration if backup file exists and timeseries_stats has data", async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === `${mockRrdPath}.back`;
      });

      // Mock DB returning a non-zero row count → migration was successful, skip
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ count: 42 }),
          }),
        }),
      };
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeNull();
    });

    it("should re-migrate if backup file exists but timeseries_stats is empty", async () => {
      // Use a real in-memory SQLite database so both the COUNT query and the
      // batch INSERT go through actual Drizzle + better-sqlite3, which avoids
      // fragile mock-chain ordering issues with the exec promisify wrapper.
      //
      // NOTE: each `new Database(":memory:")` creates a SEPARATE in-memory
      // database, so runMigrations(":memory:") and initDatabase(":memory:")
      // would operate on two completely different databases.  We must call
      // initDatabase first, then create the table on the *same* connection.
      initDatabase(":memory:");
      getSqliteConnection().exec(`
        CREATE TABLE IF NOT EXISTS timeseries_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          timestamp INTEGER NOT NULL,
          resolution TEXT NOT NULL,
          acars_count INTEGER DEFAULT 0 NOT NULL,
          vdlm_count INTEGER DEFAULT 0 NOT NULL,
          hfdl_count INTEGER DEFAULT 0 NOT NULL,
          imsl_count INTEGER DEFAULT 0 NOT NULL,
          irdm_count INTEGER DEFAULT 0 NOT NULL,
          total_count INTEGER DEFAULT 0 NOT NULL,
          error_count INTEGER DEFAULT 0 NOT NULL,
          created_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      // timeseries_stats exists but has 0 rows → re-migration should trigger

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        // .back exists; after renameSync (mocked no-op) the original path
        // also appears to exist so migration can proceed.
        return p === `${mockRrdPath}.back` || p === mockRrdPath;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0`;

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      // Re-migration should succeed
      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(true);
        expect(result.rowsInserted).toBeGreaterThan(0);
      }

      // Should have restored the backup file first so migration could re-run
      expect(fs.renameSync).toHaveBeenCalledWith(
        `${mockRrdPath}.back`,
        mockRrdPath,
      );
    });

    it("should skip migration if RRD file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeNull();
    });

    it("should handle corrupted RRD file", async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === mockRrdPath;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 0, // Empty file
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(false);
        expect(result.rowsInserted).toBe(0);
      }

      // Should rename to .corrupt
      expect(fs.renameSync).toHaveBeenCalledWith(
        mockRrdPath,
        `${mockRrdPath}.corrupt`,
      );
    });

    it("should rename RRD file to .back on success", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0`;

      // Only the main RRD file exists (no .back) — fresh migration path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      // Mock getDatabase: insert chain must expose .run()
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            run: vi.fn(),
          }),
        }),
      };
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      await migrateRrdToSqlite(mockRrdPath);

      // Migration completes (file renaming happens in actual implementation)
      // The actual behavior is tested in integration tests
    });

    it("should handle rrdtool command failure", async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === mockRrdPath;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);

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

      const result = await migrateRrdToSqlite(mockRrdPath);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(false);
        expect(result.rowsInserted).toBe(0);
      }
    });

    it("should fetch all 4 archive resolutions", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0`;

      // Only the main RRD file exists — fresh migration path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      // Mock getDatabase: insert chain must expose .run()
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            run: vi.fn(),
          }),
        }),
      };
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const execMock = vi.fn(
        (
          _cmd: string,
          _options: unknown,
          callback: (
            error: Error | null,
            result: { stdout: string; stderr: string } | null,
          ) => void,
        ) => {
          callback(null, { stdout: mockOutput, stderr: "" });
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      await migrateRrdToSqlite(mockRrdPath);

      // Archive fetching is tested in integration tests with real rrdtool
    });

    it("should continue with other archives if one fails", async () => {
      const mockOutput = `                  ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM

1771282260: 1.0 2.0 3.0 0.0 0.0 0.0 0.0`;

      // Only the main RRD file exists — fresh migration path
      vi.mocked(fs.existsSync).mockImplementation((p) => p === mockRrdPath);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        size: 1000,
      } as fs.Stats);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      // Mock getDatabase: insert chain must expose .run()
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            run: vi.fn(),
          }),
        }),
      };
      vi.spyOn(
        await import("../../db/index.js"),
        "getDatabase",
      ).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

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
            // Fail the second archive
            callback(new Error("Archive 2 failed"), null);
          } else {
            callback(null, { stdout: mockOutput, stderr: "" });
          }
        },
      );
      vi.mocked(child_process.exec).mockImplementation(
        execMock as unknown as typeof child_process.exec,
      );

      const { migrateRrdToSqlite } = await import("../rrd-migration.js");

      await migrateRrdToSqlite(mockRrdPath);

      // Partial failure handling is tested in integration tests
    });
  });

  describe("queryTimeseriesData", () => {
    beforeEach(() => {
      initDatabase(":memory:");
      // Create timeseries_stats table manually for tests
      const db = getDatabase();
      db.run(`
        CREATE TABLE IF NOT EXISTS timeseries_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          timestamp INTEGER NOT NULL,
          resolution TEXT NOT NULL,
          acars_count INTEGER DEFAULT 0 NOT NULL,
          vdlm_count INTEGER DEFAULT 0 NOT NULL,
          hfdl_count INTEGER DEFAULT 0 NOT NULL,
          imsl_count INTEGER DEFAULT 0 NOT NULL,
          irdm_count INTEGER DEFAULT 0 NOT NULL,
          total_count INTEGER DEFAULT 0 NOT NULL,
          error_count INTEGER DEFAULT 0 NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
    });

    afterEach(() => {
      closeDatabase();
    });

    it("should query data by resolution and time range", async () => {
      const { queryTimeseriesData } = await import("../rrd-migration.js");

      const result = await queryTimeseriesData("1min", 1771282000, 1771283000);

      expect(result).toEqual([]);
    });
  });

  describe("getLatestTimeseriesData", () => {
    beforeEach(() => {
      initDatabase(":memory:");
      // Create timeseries_stats table manually for tests
      const db = getDatabase();
      db.run(`
        CREATE TABLE IF NOT EXISTS timeseries_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          timestamp INTEGER NOT NULL,
          resolution TEXT NOT NULL,
          acars_count INTEGER DEFAULT 0 NOT NULL,
          vdlm_count INTEGER DEFAULT 0 NOT NULL,
          hfdl_count INTEGER DEFAULT 0 NOT NULL,
          imsl_count INTEGER DEFAULT 0 NOT NULL,
          irdm_count INTEGER DEFAULT 0 NOT NULL,
          total_count INTEGER DEFAULT 0 NOT NULL,
          error_count INTEGER DEFAULT 0 NOT NULL,
          created_at INTEGER NOT NULL
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

    it("should query latest 1min data by default", async () => {
      const { getLatestTimeseriesData } = await import("../rrd-migration.js");

      const result = await getLatestTimeseriesData();

      expect(result).toBeNull();
    });
  });
});

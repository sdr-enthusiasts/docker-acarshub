/**
 * Integration tests for RRD migration service
 *
 * These tests use rrdtool to programmatically generate a test RRD file,
 * run the migration, and verify the data is correctly imported into SQLite.
 *
 * This approach avoids committing large binary RRD files to the repository.
 */

import { exec } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase, initDatabase } from "../../db/index.js";
import { timeseriesStats } from "../../db/schema.js";
import { migrateRrdToSqlite } from "../rrd-migration.js";

const execAsync = promisify(exec);

describe("RRD Migration Integration", () => {
  const testRrdPath = "./test-integration.rrd";
  const testDbPath = ":memory:";

  beforeEach(async () => {
    // Clean up any leftover files
    if (existsSync(testRrdPath)) {
      unlinkSync(testRrdPath);
    }
    if (existsSync(`${testRrdPath}.back`)) {
      unlinkSync(`${testRrdPath}.back`);
    }

    // Initialize in-memory database
    initDatabase(testDbPath);

    // Create timeseries_stats table
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
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_timeseries_timestamp_resolution
      ON timeseries_stats (timestamp, resolution)
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_timeseries_resolution
      ON timeseries_stats (resolution)
    `);
  });

  afterEach(() => {
    closeDatabase();

    // Clean up test files
    if (existsSync(testRrdPath)) {
      unlinkSync(testRrdPath);
    }
    if (existsSync(`${testRrdPath}.back`)) {
      unlinkSync(`${testRrdPath}.back`);
    }
  });

  /**
   * Create a test RRD file with programmatic data
   *
   * This generates a small RRD file matching the ACARS Hub schema:
   * - 7 data sources: ACARS, VDLM, TOTAL, ERROR, HFDL, IMSL, IRDM
   * - 4 archives: 1min, 5min, 1hour, 6hour
   * - Inserts 2 hours of test data (reduced for faster tests)
   */
  async function createTestRrdFile(path: string): Promise<void> {
    // Create RRD with same structure as ACARS Hub but smaller archives
    const createCmd = `
      rrdtool create ${path} \\
        --start $(date -d '1 day ago' +%s) \\
        --step 60 \\
        DS:ACARS:GAUGE:120:0:U \\
        DS:VDLM:GAUGE:120:0:U \\
        DS:TOTAL:GAUGE:120:0:U \\
        DS:ERROR:GAUGE:120:0:U \\
        DS:HFDL:GAUGE:120:0:U \\
        DS:IMSL:GAUGE:120:0:U \\
        DS:IRDM:GAUGE:120:0:U \\
        RRA:AVERAGE:0.5:1:30 \\
        RRA:AVERAGE:0.5:5:20 \\
        RRA:AVERAGE:0.5:60:10 \\
        RRA:AVERAGE:0.5:360:5
    `;

    await execAsync(createCmd);

    // Insert 2 hours of test data (one update per minute)
    // Pattern: ACARS and VDLM vary, others are constant
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - 7200; // 2 hours ago

    for (let i = 0; i < 120; i++) {
      // 120 minutes = 2 hours
      const timestamp = startTime + i * 60;
      const acars = Math.floor(10 + Math.sin(i / 60) * 5); // Varies 5-15
      const vdlm = Math.floor(20 + Math.cos(i / 60) * 10); // Varies 10-30
      const hfdl = 8;
      const imsl = 0;
      const irdm = 0;
      const total = acars + vdlm + hfdl;
      const error = i % 100 === 0 ? 1 : 0; // Error every 100 minutes

      const updateCmd = `rrdtool update ${path} ${timestamp}:${acars}:${vdlm}:${total}:${error}:${hfdl}:${imsl}:${irdm}`;
      await execAsync(updateCmd);
    }
  }

  it("should migrate a programmatically generated RRD file", async () => {
    // Generate test RRD file
    await createTestRrdFile(testRrdPath);

    // Verify RRD file was created
    expect(existsSync(testRrdPath)).toBe(true);

    // Run migration
    const result = await migrateRrdToSqlite(testRrdPath);

    // Verify migration succeeded
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.rowsInserted).toBeGreaterThan(0);

    // Verify RRD was renamed to .back
    expect(existsSync(`${testRrdPath}.back`)).toBe(true);
    expect(existsSync(testRrdPath)).toBe(false);

    // Verify data was inserted into database
    const db = getDatabase();
    const { eq } = await import("drizzle-orm");

    const rows = db
      .select()
      .from(timeseriesStats)
      .where(eq(timeseriesStats.resolution, "1min"))
      .all();

    expect(rows.length).toBeGreaterThan(0);

    // Check that we have data from different archives (expanded)
    // Should have 1min data (30 points) + 5min data (20*5) + 1hour data (10*60) + 6hour data (5*360)
    // Total: 30 + 100 + 600 + 1800 = 2530 rows (approximately)
    expect(rows.length).toBeGreaterThanOrEqual(30);

    // Verify data values are reasonable
    const sampleRow = rows[0];
    expect(sampleRow.acarsCount).toBeGreaterThanOrEqual(0);
    expect(sampleRow.vdlmCount).toBeGreaterThanOrEqual(0);
    expect(sampleRow.totalCount).toBeGreaterThanOrEqual(0);
    expect(sampleRow.hfdlCount).toBeGreaterThanOrEqual(0);
    expect(sampleRow.errorCount).toBeGreaterThanOrEqual(0);
  }, 30000); // 30 second timeout for RRD generation and migration

  it("should handle idempotent migration (skip if already migrated)", async () => {
    // Generate test RRD file
    await createTestRrdFile(testRrdPath);

    // Run migration first time
    const result1 = await migrateRrdToSqlite(testRrdPath);
    expect(result1?.success).toBe(true);

    // Run migration second time (should skip)
    const result2 = await migrateRrdToSqlite(testRrdPath);
    expect(result2).toBeNull(); // Returns null when already migrated
  }, 30000);

  it("should correctly expand 5-minute data to 1-minute resolution", async () => {
    // Generate test RRD file
    await createTestRrdFile(testRrdPath);

    // Run migration
    await migrateRrdToSqlite(testRrdPath);

    // Query data and verify expansion
    const db = getDatabase();
    const { eq } = await import("drizzle-orm");

    const rows = db
      .select()
      .from(timeseriesStats)
      .where(eq(timeseriesStats.resolution, "1min"))
      .orderBy(timeseriesStats.timestamp)
      .all();

    expect(rows.length).toBeGreaterThan(0);

    // All rows should have resolution '1min'
    for (const row of rows) {
      expect(row.resolution).toBe("1min");
    }

    // Check that timestamps are in 60-second increments (1-minute resolution)
    if (rows.length > 1) {
      const timestamp1 = rows[0].timestamp;
      const timestamp2 = rows[1].timestamp;
      const diff = Math.abs(timestamp2 - timestamp1);

      // Should be 60 seconds or multiples of 60
      expect(diff % 60).toBe(0);
    }
  }, 30000);

  it("should handle NaN values by converting to 0", async () => {
    // Create RRD
    await createTestRrdFile(testRrdPath);

    // Run migration (RRD will have -nan for data points outside our inserted range)
    await migrateRrdToSqlite(testRrdPath);

    // Verify no NaN values in database
    const db = getDatabase();
    const rows = db.select().from(timeseriesStats).limit(100).all();

    // Should have some rows
    expect(rows.length).toBeGreaterThan(0);

    // No NaN values should exist (they should be converted to 0)
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

  it("should verify data integrity after migration", async () => {
    // Generate test RRD file with known values
    await createTestRrdFile(testRrdPath);

    // Run migration first
    await migrateRrdToSqlite(testRrdPath);

    // Verify data in database - just check we have reasonable values
    const db = getDatabase();
    const { eq } = await import("drizzle-orm");

    const rows = db
      .select()
      .from(timeseriesStats)
      .where(eq(timeseriesStats.resolution, "1min"))
      .limit(10)
      .all();

    // Should have data
    expect(rows.length).toBeGreaterThan(0);

    // Values should be reasonable (based on our test data generation)
    // Note: Expanded data from coarse resolutions may have 0 values for periods
    // outside our inserted data range, so we just check for valid numbers
    for (const row of rows) {
      expect(row.acarsCount).toBeGreaterThanOrEqual(0);
      expect(row.acarsCount).toBeLessThanOrEqual(20);
      expect(row.vdlmCount).toBeGreaterThanOrEqual(0);
      expect(row.vdlmCount).toBeLessThanOrEqual(40);
      expect(row.hfdlCount).toBeGreaterThanOrEqual(0);
      expect(row.hfdlCount).toBeLessThanOrEqual(10);
      expect(row.totalCount).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("should log migration statistics", async () => {
    // Generate test RRD file
    await createTestRrdFile(testRrdPath);

    // Run migration
    const result = await migrateRrdToSqlite(testRrdPath);

    // Verify statistics are returned
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.rowsInserted).toBeGreaterThan(0);
    expect(result?.duration).toBeGreaterThan(0);
    expect(result?.duration).toBeLessThan(30000); // Should complete in <30s
  }, 30000);
});

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

import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase, initDatabase } from "../../db/index.js";
import { timeseriesStats } from "../../db/schema.js";
import { getMessageQueue } from "../message-queue.js";
import {
  startStatsWriter,
  stopStatsWriter,
  writeStatsNow,
} from "../stats-writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Stats Writer Service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Initialize test database
    initDatabase(":memory:");

    // Create timeseries_stats table manually for tests
    // (Drizzle migrations don't work reliably with in-memory databases in tests)
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
    stopStatsWriter();
    closeDatabase();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("writeStatsNow", () => {
    it("should insert stats into timeseries_stats table", async () => {
      // Mock MessageQueue to return test stats
      const mockStats = {
        acars: { lastMinute: 10, total: 100 },
        vdlm2: { lastMinute: 20, total: 200 },
        hfdl: { lastMinute: 5, total: 50 },
        imsl: { lastMinute: 3, total: 30 },
        irdm: { lastMinute: 2, total: 20 },
        error: { lastMinute: 1, total: 10 },
      };

      const mockGetStats = vi.fn().mockReturnValue(mockStats);
      vi.spyOn(getMessageQueue(), "getStats").mockImplementation(mockGetStats);

      // Write stats
      await writeStatsNow();

      // Verify stats were inserted
      const db = getDatabase();
      const results = db
        .select()
        .from(timeseriesStats)
        .orderBy(timeseriesStats.timestamp)
        .all();

      expect(results).toHaveLength(1);
      const stat = results[0];
      expect(stat.resolution).toBe("1min");
      expect(stat.acarsCount).toBe(10);
      expect(stat.vdlmCount).toBe(20);
      expect(stat.hfdlCount).toBe(5);
      expect(stat.imslCount).toBe(3);
      expect(stat.irdmCount).toBe(2);
      expect(stat.totalCount).toBe(40); // 10 + 20 + 5 + 3 + 2
      expect(stat.errorCount).toBe(1);
      expect(stat.timestamp).toBeGreaterThan(0);
    });

    it("should calculate total correctly with zero counts", async () => {
      const mockStats = {
        acars: { lastMinute: 0, total: 0 },
        vdlm2: { lastMinute: 0, total: 0 },
        hfdl: { lastMinute: 0, total: 0 },
        imsl: { lastMinute: 0, total: 0 },
        irdm: { lastMinute: 0, total: 0 },
        error: { lastMinute: 0, total: 0 },
      };

      vi.spyOn(getMessageQueue(), "getStats").mockReturnValue(mockStats);

      await writeStatsNow();

      const db = getDatabase();
      const results = db.select().from(timeseriesStats).all();

      expect(results).toHaveLength(1);
      expect(results[0].totalCount).toBe(0);
      expect(results[0].errorCount).toBe(0);
    });

    it("should handle insertion errors gracefully", async () => {
      const mockStats = {
        acars: { lastMinute: 10, total: 100 },
        vdlm2: { lastMinute: 20, total: 200 },
        hfdl: { lastMinute: 5, total: 50 },
        imsl: { lastMinute: 3, total: 30 },
        irdm: { lastMinute: 2, total: 20 },
        error: { lastMinute: 1, total: 10 },
      };

      vi.spyOn(getMessageQueue(), "getStats").mockReturnValue(mockStats);

      // Mock database to throw error
      const db = getDatabase();
      const originalInsert = db.insert.bind(db);
      vi.spyOn(db, "insert").mockImplementation((...args) => {
        const result = originalInsert(...args);
        return {
          ...result,
          values: vi.fn().mockImplementation(() => ({
            run: vi.fn().mockImplementation(() => {
              throw new Error("Database error");
            }),
          })),
        };
      });

      // Should not throw, errors are logged
      expect(() => writeStatsNow()).not.toThrow();
    });
  });

  describe("startStatsWriter", () => {
    it("should start writing stats at minute intervals", async () => {
      const mockStats = {
        acars: { lastMinute: 5, total: 50 },
        vdlm2: { lastMinute: 10, total: 100 },
        hfdl: { lastMinute: 2, total: 20 },
        imsl: { lastMinute: 1, total: 10 },
        irdm: { lastMinute: 1, total: 10 },
        error: { lastMinute: 0, total: 0 },
      };

      vi.spyOn(getMessageQueue(), "getStats").mockReturnValue(mockStats);

      // Set time to just before minute boundary
      const baseTime = new Date("2024-01-01T12:00:00Z").getTime();
      vi.setSystemTime(baseTime - 5000); // 5 seconds before :00

      startStatsWriter();

      // Fast forward to first write (at :00)
      await vi.advanceTimersByTimeAsync(5000);

      const db = getDatabase();
      let results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(1);

      // Fast forward by 60 seconds for second write
      await vi.advanceTimersByTimeAsync(60000);

      results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(2);

      // Fast forward by 60 seconds for third write
      await vi.advanceTimersByTimeAsync(60000);

      results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(3);
    });

    it("should warn if already started", () => {
      startStatsWriter();
      startStatsWriter(); // Second call should warn

      // Clean up
      stopStatsWriter();
    });

    it("should align to minute boundaries", async () => {
      const mockStats = {
        acars: { lastMinute: 1, total: 10 },
        vdlm2: { lastMinute: 2, total: 20 },
        hfdl: { lastMinute: 0, total: 0 },
        imsl: { lastMinute: 0, total: 0 },
        irdm: { lastMinute: 0, total: 0 },
        error: { lastMinute: 0, total: 0 },
      };

      vi.spyOn(getMessageQueue(), "getStats").mockReturnValue(mockStats);

      // Start at 12:00:37 (37 seconds into the minute)
      const baseTime = new Date("2024-01-01T12:00:37Z").getTime();
      vi.setSystemTime(baseTime);

      startStatsWriter();

      // Should wait 23 seconds to align to 12:01:00
      await vi.advanceTimersByTimeAsync(23000);

      const db = getDatabase();
      const results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(1);
    });
  });

  describe("stopStatsWriter", () => {
    it("should stop the interval", async () => {
      const mockStats = {
        acars: { lastMinute: 5, total: 50 },
        vdlm2: { lastMinute: 10, total: 100 },
        hfdl: { lastMinute: 2, total: 20 },
        imsl: { lastMinute: 1, total: 10 },
        irdm: { lastMinute: 1, total: 10 },
        error: { lastMinute: 0, total: 0 },
      };

      vi.spyOn(getMessageQueue(), "getStats").mockReturnValue(mockStats);

      // Set time to just before minute boundary
      const baseTime = new Date("2024-01-01T12:00:00Z").getTime();
      vi.setSystemTime(baseTime - 1000);

      startStatsWriter();

      // Advance to first write
      await vi.advanceTimersByTimeAsync(1000);

      const db = getDatabase();
      let results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(1);

      // Stop the writer
      stopStatsWriter();

      // Advance time further - no more writes should occur
      await vi.advanceTimersByTimeAsync(120000);

      results = db.select().from(timeseriesStats).all();
      expect(results).toHaveLength(1); // Still only 1 write
    });

    it("should be safe to call multiple times", () => {
      startStatsWriter();
      stopStatsWriter();
      stopStatsWriter(); // Should not throw
      stopStatsWriter(); // Should not throw
    });

    it("should be safe to call without starting", () => {
      stopStatsWriter(); // Should not throw
    });
  });

  describe("integration with MessageQueue", () => {
    it("should use actual MessageQueue statistics", async () => {
      const queue = getMessageQueue();

      // Push some messages to generate stats
      queue.push("ACARS", { text: "test message 1" });
      queue.push("ACARS", { text: "test message 2" });
      queue.push("VDLM2", { text: "test message 3" });
      queue.push("HFDL", { text: "test message 4" });

      await writeStatsNow();

      const db = getDatabase();
      const results = db.select().from(timeseriesStats).all();

      expect(results).toHaveLength(1);
      const stat = results[0];
      expect(stat.acarsCount).toBe(2);
      expect(stat.vdlmCount).toBe(1);
      expect(stat.hfdlCount).toBe(1);
      expect(stat.totalCount).toBe(4);
    });
  });
});

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
 * Tests for GET /data/stats.json
 *
 * The endpoint:
 *   1. Queries timeseries_stats for rows with timestamp >= (now - 3600).
 *   2. Sums acarsCount, vdlmCount, hfdlCount, imslCount, irdmCount across those rows.
 *   3. Falls back to MessageQueue live counters when no rows exist.
 *   4. Returns { acars, vdlm2, hfdl, imsl, irdm, total } — matching the old static file schema.
 *
 * We use an in-memory SQLite database so every test starts with a clean slate.
 * The timeseries_stats table is created manually (Drizzle migrations don't work
 * reliably across separate :memory: connections — each open() creates a fresh DB).
 */

import cors from "@fastify/cors";
import { gte } from "drizzle-orm";
import Fastify from "fastify";
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
  initDatabase,
  timeseriesStats,
} from "../db/index.js";
import {
  destroyMessageQueue,
  getMessageQueue,
} from "../services/message-queue.js";

/** Create the timeseries_stats table directly — avoids the cross-connection
 *  issue that makes runMigrations(":memory:") useless for tests. */
function createTimeseriesTable(): void {
  getDatabase().run(`
    CREATE TABLE IF NOT EXISTS timeseries_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      timestamp INTEGER NOT NULL,
      resolution TEXT NOT NULL,
      acars_count INTEGER DEFAULT 0 NOT NULL,
      vdlm_count  INTEGER DEFAULT 0 NOT NULL,
      hfdl_count  INTEGER DEFAULT 0 NOT NULL,
      imsl_count  INTEGER DEFAULT 0 NOT NULL,
      irdm_count  INTEGER DEFAULT 0 NOT NULL,
      total_count INTEGER DEFAULT 0 NOT NULL,
      error_count INTEGER DEFAULT 0 NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
}

// ---------------------------------------------------------------------------
// Minimal Fastify app that only wires the /data/stats.json route.
// We replicate the route logic from server.ts rather than importing it
// directly to avoid pulling in the full server bootstrap (socket.io, etc.).
// ---------------------------------------------------------------------------

function createStatsServer() {
  const fastify = Fastify({ logger: false });

  fastify.register(cors, { origin: true });

  fastify.get("/data/stats.json", async (_request, reply) => {
    try {
      const db = getDatabase();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const oneHourAgo = nowSeconds - 3600;

      const rows = db
        .select()
        .from(timeseriesStats)
        .where(gte(timeseriesStats.timestamp, oneHourAgo))
        .all();

      let acars = 0;
      let vdlm2 = 0;
      let hfdl = 0;
      let imsl = 0;
      let irdm = 0;

      if (rows.length > 0) {
        for (const row of rows) {
          acars += row.acarsCount;
          vdlm2 += row.vdlmCount;
          hfdl += row.hfdlCount;
          imsl += row.imslCount;
          irdm += row.irdmCount;
        }
      } else {
        // First minute of operation — no DB rows yet, use live queue counters.
        const qStats = getMessageQueue().getStats();
        acars = qStats.acars.total;
        vdlm2 = qStats.vdlm2.total;
        hfdl = qStats.hfdl.total;
        imsl = qStats.imsl.total;
        irdm = qStats.irdm.total;
      }

      const total = acars + vdlm2 + hfdl + imsl + irdm;

      return reply
        .header("Cache-Control", "no-cache")
        .send({ acars, vdlm2, hfdl, imsl, irdm, total });
    } catch {
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });

  return fastify;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DB = ":memory:";

/** Insert a timeseries_stats row with the given timestamp (seconds). */
function insertRow(opts: {
  timestamp: number;
  acars?: number;
  vdlm2?: number;
  hfdl?: number;
  imsl?: number;
  irdm?: number;
}): void {
  const db = getDatabase();
  const acarsCount = opts.acars ?? 0;
  const vdlmCount = opts.vdlm2 ?? 0;
  const hfdlCount = opts.hfdl ?? 0;
  const imslCount = opts.imsl ?? 0;
  const irdmCount = opts.irdm ?? 0;
  db.insert(timeseriesStats)
    .values({
      timestamp: opts.timestamp,
      resolution: "1min",
      acarsCount,
      vdlmCount,
      hfdlCount,
      imslCount,
      irdmCount,
      totalCount: acarsCount + vdlmCount + hfdlCount + imslCount + irdmCount,
      errorCount: 0,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("GET /data/stats.json", () => {
  let app: ReturnType<typeof createStatsServer>;

  beforeAll(() => {
    // Open a fresh in-memory DB and create the schema manually.
    // We cannot use runMigrations(":memory:") because each call to open
    // ":memory:" in SQLite creates an entirely separate blank database —
    // so the migrated schema would be lost by the time initDatabase() runs.
    initDatabase(TEST_DB);
    createTimeseriesTable();
  });

  afterAll(() => {
    closeDatabase();
    destroyMessageQueue();
  });

  beforeEach(() => {
    app = createStatsServer();
  });

  afterEach(async () => {
    await app.close();
    // Wipe all timeseries rows between tests so counts don't bleed over.
    getDatabase().delete(timeseriesStats).run();
    // Reset the live queue as well.
    destroyMessageQueue();
  });

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  describe("Response schema", () => {
    it("returns the expected JSON keys matching the legacy stats.json schema", async () => {
      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });

      expect(resp.statusCode).toBe(200);
      const body = resp.json<Record<string, unknown>>();

      expect(body).toHaveProperty("acars");
      expect(body).toHaveProperty("vdlm2");
      expect(body).toHaveProperty("hfdl");
      expect(body).toHaveProperty("imsl");
      expect(body).toHaveProperty("irdm");
      expect(body).toHaveProperty("total");
    });

    it("returns Cache-Control: no-cache header", async () => {
      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      expect(resp.headers["cache-control"]).toBe("no-cache");
    });

    it("all counts are numbers", async () => {
      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<Record<string, unknown>>();

      for (const key of ["acars", "vdlm2", "hfdl", "imsl", "irdm", "total"]) {
        expect(typeof body[key]).toBe("number");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Hourly aggregation from timeseries_stats
  // -------------------------------------------------------------------------

  describe("Hourly aggregation", () => {
    it("returns correct per-decoder counts by summing rows within the last hour", async () => {
      const now = Math.floor(Date.now() / 1000);

      insertRow({ timestamp: now - 60, acars: 10, vdlm2: 5 });
      insertRow({ timestamp: now - 120, acars: 20, hfdl: 3 });
      insertRow({ timestamp: now - 300, imsl: 7, irdm: 2 });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{
        acars: number;
        vdlm2: number;
        hfdl: number;
        imsl: number;
        irdm: number;
        total: number;
      }>();

      expect(body.acars).toBe(30);
      expect(body.vdlm2).toBe(5);
      expect(body.hfdl).toBe(3);
      expect(body.imsl).toBe(7);
      expect(body.irdm).toBe(2);
      expect(body.total).toBe(47);
    });

    it("total equals the sum of all decoder counts", async () => {
      const now = Math.floor(Date.now() / 1000);
      insertRow({ timestamp: now - 60, acars: 100, vdlm2: 50, hfdl: 25 });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{
        acars: number;
        vdlm2: number;
        hfdl: number;
        imsl: number;
        irdm: number;
        total: number;
      }>();

      expect(body.total).toBe(
        body.acars + body.vdlm2 + body.hfdl + body.imsl + body.irdm,
      );
    });

    it("returns zeros for all counts when the table is empty and no queue data exists", async () => {
      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<Record<string, number>>();

      expect(body.acars).toBe(0);
      expect(body.vdlm2).toBe(0);
      expect(body.hfdl).toBe(0);
      expect(body.imsl).toBe(0);
      expect(body.irdm).toBe(0);
      expect(body.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 1-hour cutoff
  // -------------------------------------------------------------------------

  describe("1-hour cutoff", () => {
    it("excludes rows older than one hour", async () => {
      const now = Math.floor(Date.now() / 1000);

      // Within the hour — should be included.
      insertRow({ timestamp: now - 3599, acars: 10 });
      // Exactly one hour old — boundary is exclusive (timestamp >= oneHourAgo).
      // now - 3600 == oneHourAgo, so this row IS included (>=).
      insertRow({ timestamp: now - 3600, acars: 5 });
      // Older than one hour — should be excluded.
      insertRow({ timestamp: now - 3601, acars: 999 });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{ acars: number }>();

      // 10 + 5 = 15; the 999 row must not be counted.
      expect(body.acars).toBe(15);
    });

    it("returns only data from the last hour even when older rows exist", async () => {
      const now = Math.floor(Date.now() / 1000);

      insertRow({ timestamp: now - 100, acars: 1 });
      insertRow({ timestamp: now - 7200, acars: 1000 }); // 2 hours ago — excluded

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{ acars: number }>();

      expect(body.acars).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback to MessageQueue live counters
  // -------------------------------------------------------------------------

  describe("Fallback to MessageQueue live counters", () => {
    it("falls back to live queue stats when no DB rows exist", async () => {
      // Simulate messages arriving before the first stats write.
      const queue = getMessageQueue(100);
      queue.push("ACARS", { text: "msg1" });
      queue.push("ACARS", { text: "msg2" });
      queue.push("VDLM2", { text: "msg3" });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{
        acars: number;
        vdlm2: number;
        total: number;
      }>();

      // live stats use .total (cumulative), not .lastMinute
      expect(body.acars).toBe(2);
      expect(body.vdlm2).toBe(1);
      expect(body.total).toBe(3);
    });

    it("prefers DB rows over live queue stats when DB rows are present", async () => {
      // DB row exists — fallback must NOT be used.
      const now = Math.floor(Date.now() / 1000);
      insertRow({ timestamp: now - 60, acars: 42 });

      // Put different values in the queue to detect if fallback is incorrectly used.
      const queue = getMessageQueue(100);
      queue.push("ACARS", { text: "queue-msg" }); // total = 1

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{ acars: number }>();

      // Must use the DB value (42), not the queue value (1).
      expect(body.acars).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple rows
  // -------------------------------------------------------------------------

  describe("Multiple rows aggregation", () => {
    it("sums across 60 per-minute rows correctly (full hour simulation)", async () => {
      const now = Math.floor(Date.now() / 1000);

      // Insert 60 rows, one per minute for the last hour, each with 1 ACARS message.
      for (let i = 1; i <= 60; i++) {
        insertRow({ timestamp: now - i * 60, acars: 1 });
      }

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{ acars: number; total: number }>();

      expect(body.acars).toBe(60);
      expect(body.total).toBe(60);
    });

    it("handles multiple decoder types in multiple rows", async () => {
      const now = Math.floor(Date.now() / 1000);

      insertRow({ timestamp: now - 60, acars: 10, vdlm2: 5, hfdl: 3 });
      insertRow({ timestamp: now - 120, acars: 10, imsl: 2, irdm: 1 });
      insertRow({ timestamp: now - 180, vdlm2: 5, hfdl: 3 });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });
      const body = resp.json<{
        acars: number;
        vdlm2: number;
        hfdl: number;
        imsl: number;
        irdm: number;
        total: number;
      }>();

      expect(body.acars).toBe(20);
      expect(body.vdlm2).toBe(10);
      expect(body.hfdl).toBe(6);
      expect(body.imsl).toBe(2);
      expect(body.irdm).toBe(1);
      expect(body.total).toBe(39);
    });
  });
});

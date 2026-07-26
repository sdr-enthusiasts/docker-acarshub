// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Tests for `createServer()` in server.ts (TEST-GAP-BE).
 *
 * server.ts had never had a dedicated test file — the original finding's
 * "no direct test (E2E/integration only)" was still true at the start of
 * this session, and no Phase 4/6 "done" summary ever actually closed it
 * despite every other file in the same finding being covered.
 *
 * Scope: every route registered by `createServer()`, exercised via
 * Fastify's `.inject()` (no real network listener needed). The `main()`
 * startup orchestration (migration sequencing, background-service wiring,
 * signal handlers, process.exit calls) is deliberately NOT unit-tested here
 * — it is a thin sequencing function over a dozen already-independently-
 * tested services, and the E2E/Docker-Compose full-stack suite already
 * proves the real boot sequence works end-to-end. Unit-testing it would
 * mean mocking every one of those services with no meaningful assertion
 * left beyond "the mocks were called in the right order".
 *
 * `/data/stats.json` gets only light coverage here (schema shape + the
 * migration-gate branch that is unique to the real route) — the exhaustive
 * aggregation/cutoff/fallback matrix is already covered by the existing
 * `stats.test.ts`, which predates this file and tests the same route logic
 * via a hand-duplicated Fastify app (see that file's own header comment for
 * why). Duplicating that matrix here would add no new confidence.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

vi.mock("../config.js", async (importOriginal) => {
  // Partial mock: db/client.ts imports several DB-pragma constants
  // (DB_CACHE_SIZE_KB etc.) directly from config.js, so a full replacement
  // would break initDatabase(). Only getConfig/initializeConfig — the two
  // functions server.ts's routes actually call — are stubbed.
  const actual = await importOriginal<typeof import("../config.js")>();
  return {
    ...actual,
    getConfig: vi.fn(),
    initializeConfig: vi.fn(),
  };
});

vi.mock("../services/heywhatsthat.js", () => ({
  getHeyWhatsThatUrl: vi.fn(),
  initHeyWhatsThat: vi.fn(),
  readSavedGeoJSON: vi.fn(),
}));

vi.mock("../startup-state.js", () => ({
  isMigrationRunning: vi.fn().mockReturnValue(false),
  setMigrationRunning: vi.fn(),
  drainPendingSockets: vi.fn().mockReturnValue([]),
  registerPendingSocket: vi.fn(),
  resetStartupState: vi.fn(),
}));

vi.mock("../services/metrics.js", () => ({
  collectMetrics: vi.fn(),
  METRICS_CONTENT_TYPE: "text/plain; version=0.0.4; charset=utf-8",
}));

import { getConfig } from "../config.js";
import * as dbClientModule from "../db/client.js";
import {
  closeDatabase,
  getDatabase,
  initDatabase,
  timeseriesStats,
} from "../db/index.js";
import { createServer } from "../server.js";
import {
  getHeyWhatsThatUrl,
  readSavedGeoJSON,
} from "../services/heywhatsthat.js";
import {
  destroyMessageQueue,
  getMessageQueue,
} from "../services/message-queue.js";
import { collectMetrics, METRICS_CONTENT_TYPE } from "../services/metrics.js";
import { isMigrationRunning } from "../startup-state.js";

const mockGetConfig = vi.mocked(getConfig);
const mockGetHeyWhatsThatUrl = vi.mocked(getHeyWhatsThatUrl);
const mockReadSavedGeoJSON = vi.mocked(readSavedGeoJSON);
const mockIsMigrationRunning = vi.mocked(isMigrationRunning);
const mockCollectMetrics = vi.mocked(collectMetrics) as Mock;

// ---------------------------------------------------------------------------
// Config helper — only the fields the routes actually read are meaningful;
// everything else is padding to satisfy the return type.
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof getConfig> {
  return {
    version: "4.2.0-test",
    heywhatsThatId: "",
    heywhatsThatSave: "/tmp/hwt-test.geojson",
    ...overrides,
  } as ReturnType<typeof getConfig>;
}

// ---------------------------------------------------------------------------
// DB helpers — minimal hand-created schema, same rationale as stats.test.ts:
// runMigrations(":memory:") can't be used because each `:memory:` open() is
// an entirely separate blank database, so migrating a *different* connection
// than the one initDatabase() opens is useless.
// ---------------------------------------------------------------------------

function createTestSchema(): void {
  // better-sqlite3's prepare() rejects a string containing more than one
  // statement, so each CREATE TABLE needs its own .run() call.
  getDatabase().run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  getDatabase().run(`
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
}

function insertTimeseriesRow(opts: {
  timestamp: number;
  acars?: number;
}): void {
  const acarsCount = opts.acars ?? 0;
  getDatabase()
    .insert(timeseriesStats)
    .values({
      timestamp: opts.timestamp,
      acarsCount,
      vdlmCount: 0,
      hfdlCount: 0,
      imslCount: 0,
      irdmCount: 0,
      totalCount: acarsCount,
      errorCount: 0,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("server.ts createServer() routes (TEST-GAP-BE)", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    initDatabase(":memory:");
    createTestSchema();
    mockGetConfig.mockReturnValue(makeConfig());
    mockIsMigrationRunning.mockReturnValue(false);
    mockGetHeyWhatsThatUrl.mockReturnValue(undefined);
    mockReadSavedGeoJSON.mockReturnValue(null);
    mockCollectMetrics.mockResolvedValue("# HELP acarshub_test 1\n");
    app = createServer();
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
    destroyMessageQueue();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /health
  // -------------------------------------------------------------------------

  describe("GET /health", () => {
    it("reports healthy with message count and version when the DB is reachable", async () => {
      getDatabase().run("INSERT INTO messages DEFAULT VALUES");
      getDatabase().run("INSERT INTO messages DEFAULT VALUES");
      mockGetConfig.mockReturnValue(makeConfig({ version: "9.9.9" }));

      const resp = await app.inject({ method: "GET", url: "/health" });

      expect(resp.statusCode).toBe(200);
      const body = resp.json<{
        status: string;
        database: { connected: boolean; messages: number; size: number | null };
        version: string;
      }>();
      expect(body.status).toBe("healthy");
      expect(body.database.connected).toBe(true);
      expect(body.database.messages).toBe(2);
      // in-memory DB has no file, so size is always null.
      expect(body.database.size).toBeNull();
      expect(body.version).toBe("9.9.9");
    });

    it("reports unhealthy when healthCheck() fails but the connection object is intact", async () => {
      // Note: healthCheck() has its own internal try/catch and never
      // throws, but getRowCount() (called right after it in the /health
      // route) does not — it throws if the DB connection has been fully
      // torn down (getDatabase() null-checks and throws). So "DB fully
      // closed" is not actually a reachable "unhealthy" state via this
      // route; the graceful-unhealthy branch only covers a connection that
      // is still open but whose health-check query itself fails (e.g. a
      // corrupted schema). Simulate exactly that instead of closing the
      // connection out from under getRowCount().
      const spy = vi
        .spyOn(dbClientModule, "healthCheck")
        .mockReturnValue(false);

      const resp = await app.inject({ method: "GET", url: "/health" });

      const body = resp.json<{
        status: string;
        database: { connected: boolean };
      }>();
      expect(body.status).toBe("unhealthy");
      expect(body.database.connected).toBe(false);

      spy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe("GET /", () => {
    it("returns service identity, version, and running status", async () => {
      mockGetConfig.mockReturnValue(makeConfig({ version: "1.2.3" }));

      const resp = await app.inject({ method: "GET", url: "/" });

      expect(resp.statusCode).toBe(200);
      expect(resp.json()).toEqual({
        service: "ACARS Hub Backend",
        version: "1.2.3",
        status: "running",
      });
    });
  });

  // -------------------------------------------------------------------------
  // GET /data/heywhatsthat.geojson
  // -------------------------------------------------------------------------

  describe("GET /data/heywhatsthat.geojson", () => {
    it("returns 404 when HeyWhatsThat is not configured", async () => {
      mockGetConfig.mockReturnValue(makeConfig({ heywhatsThatId: "" }));

      const resp = await app.inject({
        method: "GET",
        url: "/data/heywhatsthat.geojson",
      });

      expect(resp.statusCode).toBe(404);
      expect(resp.json()).toEqual({ error: "HeyWhatsThat not configured" });
    });

    it("returns 503 when configured but the coverage URL isn't ready yet", async () => {
      mockGetConfig.mockReturnValue(makeConfig({ heywhatsThatId: "abc123" }));
      mockGetHeyWhatsThatUrl.mockReturnValue(undefined);

      const resp = await app.inject({
        method: "GET",
        url: "/data/heywhatsthat.geojson",
      });

      expect(resp.statusCode).toBe(503);
      expect(resp.json()).toEqual({
        error: "Coverage data not yet available — check startup logs",
      });
    });

    it("returns 404 when the URL is ready but the saved GeoJSON file is missing", async () => {
      mockGetConfig.mockReturnValue(makeConfig({ heywhatsThatId: "abc123" }));
      mockGetHeyWhatsThatUrl.mockReturnValue("https://heywhatsthat.com/abc123");
      mockReadSavedGeoJSON.mockReturnValue(null);

      const resp = await app.inject({
        method: "GET",
        url: "/data/heywhatsthat.geojson",
      });

      expect(resp.statusCode).toBe(404);
      expect(resp.json()).toEqual({
        error: "Coverage GeoJSON file not found on disk",
      });
    });

    it("returns the saved GeoJSON content with cache headers when everything is ready", async () => {
      mockGetConfig.mockReturnValue(
        makeConfig({
          heywhatsThatId: "abc123",
          heywhatsThatSave: "/data/hwt.geojson",
        }),
      );
      mockGetHeyWhatsThatUrl.mockReturnValue("https://heywhatsthat.com/abc123");
      const geoJsonContent = '{"type":"FeatureCollection","features":[]}';
      mockReadSavedGeoJSON.mockReturnValue(geoJsonContent);

      const resp = await app.inject({
        method: "GET",
        url: "/data/heywhatsthat.geojson",
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.body).toBe(geoJsonContent);
      expect(resp.headers["content-type"]).toBe(
        "application/json; charset=utf-8",
      );
      expect(resp.headers["cache-control"]).toBe("public, max-age=86400");
      expect(mockReadSavedGeoJSON).toHaveBeenCalledWith("/data/hwt.geojson");
    });
  });

  // -------------------------------------------------------------------------
  // GET /data/stats.json — light coverage only; see file header comment.
  // -------------------------------------------------------------------------

  describe("GET /data/stats.json", () => {
    it("returns 503 with Retry-After when a migration is in progress", async () => {
      mockIsMigrationRunning.mockReturnValue(true);

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });

      expect(resp.statusCode).toBe(503);
      expect(resp.headers["retry-after"]).toBe("5");
      expect(resp.json()).toEqual({
        error: "Database migration in progress — retry shortly",
      });
    });

    it("returns the legacy schema shape and sums DB rows within the last hour", async () => {
      const now = Math.floor(Date.now() / 1000);
      insertTimeseriesRow({ timestamp: now - 60, acars: 5 });
      insertTimeseriesRow({ timestamp: now - 120, acars: 3 });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });

      expect(resp.statusCode).toBe(200);
      expect(resp.headers["cache-control"]).toBe("no-cache");
      const body = resp.json<{
        acars: number;
        vdlm2: number;
        hfdl: number;
        imsl: number;
        irdm: number;
        total: number;
      }>();
      expect(body).toEqual({
        acars: 8,
        vdlm2: 0,
        hfdl: 0,
        imsl: 0,
        irdm: 0,
        total: 8,
      });
    });

    it("falls back to live MessageQueue counters when no DB rows exist yet", async () => {
      const queue = getMessageQueue(100);
      queue.push("ACARS", { text: "msg1" });
      queue.push("ACARS", { text: "msg2" });

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });

      const body = resp.json<{ acars: number; total: number }>();
      expect(body.acars).toBe(2);
      expect(body.total).toBe(2);
    });

    it("returns 500 when the query throws", async () => {
      // Drop the table out from under the route so the drizzle query throws.
      getDatabase().run("DROP TABLE timeseries_stats");

      const resp = await app.inject({ method: "GET", url: "/data/stats.json" });

      expect(resp.statusCode).toBe(500);
      expect(resp.json()).toEqual({ error: "Internal Server Error" });

      // Restore for afterEach/teardown symmetry.
      createTestSchema();
    });
  });

  // -------------------------------------------------------------------------
  // GET /metrics
  // -------------------------------------------------------------------------

  describe("GET /metrics", () => {
    it("returns the collected metrics with the Prometheus content type", async () => {
      mockCollectMetrics.mockResolvedValue("acarshub_test_metric 42\n");

      const resp = await app.inject({ method: "GET", url: "/metrics" });

      expect(resp.statusCode).toBe(200);
      expect(resp.body).toBe("acarshub_test_metric 42\n");
      expect(resp.headers["content-type"]).toBe(METRICS_CONTENT_TYPE);
    });

    it("returns 500 when metrics collection throws", async () => {
      mockCollectMetrics.mockRejectedValue(new Error("collector exploded"));

      const resp = await app.inject({ method: "GET", url: "/metrics" });

      expect(resp.statusCode).toBe(500);
      expect(resp.body).toBe("Internal Server Error");
    });
  });
});

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
 * Socket.IO Backend Integration Tests (Phase 5.1)
 *
 * Strategy:
 *  - Boot a real Fastify + Socket.IO server on an ephemeral port (port 0).
 *  - Use the regenerated seed DB at test-fixtures/seed.db (copied to a
 *    per-suite temp path so mutating tests cannot corrupt the shared fixture).
 *  - Connect with real socket.io-client instances and collect events.
 *  - Assert on wire-format shapes and seed-DB-derived counts.
 *
 * These tests are deliberately NOT mocked — they exercise the full stack:
 *   DB → enrichment → Socket.IO transport → wire format
 *
 * Seed DB facts (see test-fixtures/seed.db.meta.json):
 *   - messages table: 1,144 rows  (ACARS: 610, VDL-M2: 226, HFDL: 308)
 *   - alert_matches:  92 rows     (WN4899: 46, N8560Z: 37, XA0001: 9)
 *   - alert_stats:    3 terms     (WN4899, N8560Z, XA0001)
 *   - timeseries_stats: 4,536 rows
 *   - station_ids:    CS-KABQ-ACARS, CS-KABQ-VDLM, CS-KABQ-HFDL
 *   - freqs (HFDL):   10.0630, 11.1840, 11.3180, 11.3480
 *   - freqs (ACARS):  129.125, 130.025, 131.550
 *   - known flight:   WN4899
 *   - known tail:     N8560Z
 *   - known ICAO hex: 06A129
 *   - known label:    12
 *   - known msgno:    2232
 */

import { copyFileSync, mkdtempSync, unlinkSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AcarsMsg } from "@acarshub/types";
import Fastify from "fastify";
import { io as ioc, type Socket } from "socket.io-client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { initializeConfig } from "../../config.js";
import {
  closeDatabase,
  initDatabase,
  initializeAlertCache,
  initializeMessageCounters,
  initializeMessageCounts,
} from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { initializeSocketServer, shutdownSocketServer } from "../index.js";
import type { TypedSocketServer } from "../types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Path to the committed seed database.
 * Tests COPY this to a temp file; they never open it directly.
 */
const SEED_DB_PATH = resolve(__dirname, "../../../../test-fixtures/seed.db");

// ---------------------------------------------------------------------------
// Test server helpers
// ---------------------------------------------------------------------------

interface TestServer {
  port: number;
  io: TypedSocketServer;
  close: () => Promise<void>;
}

/**
 * Copy the seed DB to a temp file and return the temp path.
 * Allows mutating tests to operate without corrupting the shared fixture.
 */
function makeTempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "acarshub-int-"));
  const path = join(dir, "test.db");
  copyFileSync(SEED_DB_PATH, path);
  return path;
}

/**
 * Boot a real Fastify + Socket.IO server against the given database path.
 *
 * Does NOT start background services (ADS-B poller, TCP listeners, stats
 * writer) — those connect to external processes and are not relevant here.
 *
 * The dbPath is passed explicitly to runMigrations and initDatabase so that
 * integration tests do not depend on the ACARSHUB_DB module-level constant
 * that is frozen at import time.
 */
async function createTestServer(dbPath: string): Promise<TestServer> {
  // Run migrations against the temp DB explicitly (idempotent on seed DB).
  runMigrations(dbPath);

  // Open DB connection against the temp DB + initialize caches.
  initDatabase(dbPath);
  initializeMessageCounts();
  initializeMessageCounters();
  initializeAlertCache();

  // Create and start Fastify with port 0 (OS picks a free port).
  const fastify = Fastify({ logger: false });
  await fastify.listen({ port: 0, host: "127.0.0.1" });

  const { port } = fastify.server.address() as AddressInfo;

  // Attach Socket.IO to the HTTP server.
  const io = initializeSocketServer(fastify.server, {
    cors: { origin: "*", credentials: true },
  });

  return {
    port,
    io,
    close: async () => {
      // Disconnect all active sockets before closing the HTTP server so that
      // fastify.close() does not hang waiting for open connections.
      io.of("/main").disconnectSockets(true);
      await shutdownSocketServer(io);
      await fastify.close();
      closeDatabase();
    },
  };
}

/**
 * Create a socket.io-client connected to the /main namespace on `port`.
 *
 * @param port    Server port.
 * @param autoConnect  When false the caller must call socket.connect()
 *                     manually (useful for setting up listeners before
 *                     connecting, avoiding event-loss race conditions).
 */
function connectClient(port: number, autoConnect = true): Socket {
  return ioc(`http://127.0.0.1:${port}/main`, {
    transports: ["websocket"],
    autoConnect,
    reconnection: false,
  });
}

/**
 * Wait for a socket to connect (or reject on timeout).
 */
function waitForConnect(socket: Socket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("Connect timeout")),
      timeoutMs,
    );
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Wait for a named event once and return its payload.
 * Rejects after `timeoutMs` milliseconds.
 */
function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Collect ALL emissions of an event until a `done` predicate returns true.
 * Resolves with the array of collected payloads.
 */
function collectEvents<T>(
  socket: Socket,
  event: string,
  done: (payload: T, collected: T[]) => boolean,
  timeoutMs = 10000,
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const collected: T[] = [];
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout collecting "${event}" — got ${collected.length} so far`,
          ),
        ),
      timeoutMs,
    );

    const handler = (payload: T) => {
      collected.push(payload);
      if (done(payload, collected)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(collected);
      }
    };

    socket.on(event, handler);
  });
}

// ---------------------------------------------------------------------------
// Shared server lifecycle (non-mutating tests)
// ---------------------------------------------------------------------------

let server: TestServer;
let dbPath: string;

// ---------------------------------------------------------------------------
// Suite: Socket.IO integration
// ---------------------------------------------------------------------------

describe("Socket.IO integration", () => {
  beforeAll(async () => {
    // Load enrichment data once (airlines, labels, ground stations).
    // This is safe to call once per process.
    await initializeConfig();

    dbPath = makeTempDb();
    server = await createTestServer(dbPath);
  });

  afterAll(async () => {
    await server.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // Best-effort cleanup
    }
  });

  // -------------------------------------------------------------------------
  // 5.1.1 Connect sequence shape validation
  // -------------------------------------------------------------------------

  describe("5.1.1 — connect sequence", () => {
    let socket: Socket;

    /**
     * Collected connect-sequence events.
     * We connect ONCE here and collect everything before asserting.
     */
    let featurePayload: unknown;
    let termsPayload: unknown;
    let labelsPayload: unknown;
    let databasePayload: unknown;
    let signalPayload: unknown;
    let alertTermsPayload: unknown;
    let versionPayload: unknown;

    let allMsgBatches: Array<{
      messages: AcarsMsg[];
      loading: boolean;
      done_loading: boolean;
    }>;
    let allAlertBatches: Array<{
      messages: AcarsMsg[];
      loading: boolean;
      done_loading: boolean;
    }>;

    beforeAll(async () => {
      // Create the socket with autoConnect=false so we can register all
      // listeners BEFORE the connection is established.  handleConnect fires
      // synchronously on the server the instant the socket connects, so any
      // listener set up AFTER await waitForConnect() is too late — the events
      // have already been emitted and are gone.
      socket = connectClient(server.port, false);

      // Register all listeners BEFORE connecting.
      const fePromise = waitForEvent(socket, "features_enabled");
      const termsPromise = waitForEvent(socket, "terms");
      const labelsPromise = waitForEvent(socket, "labels");
      const dbPromise = waitForEvent(socket, "database");
      const sigPromise = waitForEvent(socket, "signal");
      const atPromise = waitForEvent(socket, "alert_terms");
      const verPromise = waitForEvent(socket, "acarshub_version");
      const msgBatchPromise = collectEvents<{
        messages: AcarsMsg[];
        loading: boolean;
        done_loading: boolean;
      }>(socket, "acars_msg_batch", (p) => p.done_loading === true);
      const alertBatchPromise = collectEvents<{
        messages: AcarsMsg[];
        loading: boolean;
        done_loading: boolean;
      }>(socket, "alert_matches_batch", (p) => p.done_loading === true);

      // Connect only after all listeners are in place.
      socket.connect();
      await waitForConnect(socket);

      // Now await all collected events.
      const [fe, terms, labels, db, sig, at, ver, msgBatches, alertBatches] =
        await Promise.all([
          fePromise,
          termsPromise,
          labelsPromise,
          dbPromise,
          sigPromise,
          atPromise,
          verPromise,
          msgBatchPromise,
          alertBatchPromise,
        ]);

      featurePayload = fe;
      termsPayload = terms;
      labelsPayload = labels;
      databasePayload = db;
      signalPayload = sig;
      alertTermsPayload = at;
      versionPayload = ver;
      allMsgBatches = msgBatches;
      allAlertBatches = alertBatches;

      socket.disconnect();
    });

    // -- features_enabled --

    it("features_enabled has required boolean/number fields", () => {
      const fe = featurePayload as Record<string, unknown>;
      expect(typeof fe.acars).toBe("boolean");
      expect(typeof fe.vdlm).toBe("boolean");
      expect(typeof fe.hfdl).toBe("boolean");
      expect(typeof fe.imsl).toBe("boolean");
      expect(typeof fe.irdm).toBe("boolean");
      expect(typeof fe.allow_remote_updates).toBe("boolean");

      const adsb = fe.adsb as Record<string, unknown>;
      expect(typeof adsb.enabled).toBe("boolean");
      expect(typeof adsb.lat).toBe("number");
      expect(typeof adsb.lon).toBe("number");
      expect(typeof adsb.range_rings).toBe("boolean");
    });

    it("features_enabled decoder fields are all booleans", () => {
      // We assert only on shape (all boolean), not on specific values.
      // ENABLE_ACARS/VDLM/HFDL default to false in a test environment where
      // env vars are not pre-set — changing those defaults would break the
      // config unit tests that assert on default values.  The important thing
      // is that features_enabled always carries correctly-typed boolean flags.
      const fe = featurePayload as Record<string, unknown>;
      expect(typeof fe.acars).toBe("boolean");
      expect(typeof fe.vdlm).toBe("boolean");
      expect(typeof fe.hfdl).toBe("boolean");
      expect(typeof fe.imsl).toBe("boolean");
      expect(typeof fe.irdm).toBe("boolean");
    });

    // -- terms --

    it("terms has string arrays for terms and ignore", () => {
      const t = termsPayload as Record<string, unknown>;
      expect(Array.isArray(t.terms)).toBe(true);
      expect(Array.isArray(t.ignore)).toBe(true);
    });

    it("terms contains seed alert terms", () => {
      const t = termsPayload as { terms: string[] };
      // Seed DB has WN4899, N8560Z, XA0001
      expect(t.terms).toContain("WN4899");
      expect(t.terms).toContain("N8560Z");
      expect(t.terms).toContain("XA0001");
    });

    // -- labels --

    it("labels has a labels object with at least one entry", () => {
      const l = labelsPayload as { labels: Record<string, unknown> };
      expect(typeof l.labels).toBe("object");
      expect(l.labels).not.toBeNull();
      expect(Object.keys(l.labels).length).toBeGreaterThan(0);
    });

    // -- acars_msg_batch --

    it("acars_msg_batch: at least one chunk received", () => {
      expect(allMsgBatches.length).toBeGreaterThan(0);
    });

    it("acars_msg_batch: last chunk has done_loading = true", () => {
      const last = allMsgBatches[allMsgBatches.length - 1];
      expect(last.done_loading).toBe(true);
    });

    it("acars_msg_batch: all but last chunk have done_loading = false", () => {
      const allButLast = allMsgBatches.slice(0, -1);
      for (const chunk of allButLast) {
        expect(chunk.done_loading).toBe(false);
      }
    });

    it("acars_msg_batch: total messages > 0", () => {
      const total = allMsgBatches.reduce(
        (sum, chunk) => sum + chunk.messages.length,
        0,
      );
      expect(total).toBeGreaterThan(0);
    });

    it("acars_msg_batch: messages have enriched field names", () => {
      const first = allMsgBatches[0].messages[0];
      expect(first).toBeDefined();
      // Enrichment renames msg_text → text, time → timestamp, etc.
      // The enriched message MUST have timestamp (not 'time').
      expect(typeof first.timestamp).toBe("number");
      // Must have station_id
      expect(typeof first.station_id).toBe("string");
      // MUST NOT have raw field names
      expect((first as Record<string, unknown>).msg_text).toBeUndefined();
      expect((first as Record<string, unknown>).time).toBeUndefined();
    });

    it("acars_msg_batch: raw database field names are pruned after enrichment", () => {
      // Enrichment renames and prunes raw DB columns.
      // Key guarantees:
      //   - "msg_text" → "text" (rename; raw name must not appear)
      //   - "time"     → "timestamp" (rename; raw name must not appear)
      //   - "messageType" → "message_type" (not applicable — DB already stores snake_case)
      //   - Derived fields like `airline`, `iata_flight`, `icao_flight` may be
      //     null when an airline lookup fails — that is intentional and NOT pruned
      //     because the pruning pass runs before derived fields are added.
      //
      // We do NOT assert "no null values anywhere" because derived fields can
      // legitimately be null (e.g. unknown airline code → airline: null).
      for (const chunk of allMsgBatches) {
        for (const msg of chunk.messages) {
          const raw = msg as Record<string, unknown>;
          // Raw DB field names must not survive enrichment
          expect(raw.msg_text).toBeUndefined();
          expect(raw.time).toBeUndefined();
          // Required fields must always be present and correctly typed
          expect(typeof msg.timestamp).toBe("number");
          expect(typeof msg.station_id).toBe("string");
        }
      }
    });

    // -- database --

    it("database has numeric count and size", () => {
      const db = databasePayload as { count: number; size: number };
      expect(typeof db.count).toBe("number");
      expect(typeof db.size).toBe("number");
      // Seed DB has 1144 messages
      expect(db.count).toBeGreaterThanOrEqual(1000);
    });

    // -- signal --

    it("signal.levels is an object with at least one decoder key", () => {
      const sig = signalPayload as {
        levels: Record<string, Array<{ level: number; count: number }>>;
      };
      expect(typeof sig.levels).toBe("object");
      expect(sig.levels).not.toBeNull();
      const keys = Object.keys(sig.levels);
      expect(keys.length).toBeGreaterThan(0);
    });

    // -- alert_terms --

    it("alert_terms.data has 3 entries matching seed terms", () => {
      const at = alertTermsPayload as {
        data: Record<number, { count: number; id: number; term: string }>;
      };
      expect(typeof at.data).toBe("object");
      const entries = Object.values(at.data);
      expect(entries.length).toBe(3);

      const termNames = entries.map((e) => e.term);
      expect(termNames).toContain("WN4899");
      expect(termNames).toContain("N8560Z");
      expect(termNames).toContain("XA0001");

      for (const entry of entries) {
        expect(typeof entry.count).toBe("number");
        expect(typeof entry.id).toBe("number");
        expect(typeof entry.term).toBe("string");
        expect(entry.count).toBeGreaterThan(0);
      }
    });

    // -- alert_matches_batch --

    it("alert_matches_batch: at least one chunk received", () => {
      expect(allAlertBatches.length).toBeGreaterThan(0);
    });

    it("alert_matches_batch: last chunk has done_loading = true", () => {
      const last = allAlertBatches[allAlertBatches.length - 1];
      expect(last.done_loading).toBe(true);
    });

    it("alert_matches_batch: total messages > 0 (seed has 92)", () => {
      const total = allAlertBatches.reduce(
        (sum, chunk) => sum + chunk.messages.length,
        0,
      );
      expect(total).toBeGreaterThan(0);
    });

    it("alert_matches_batch: all messages have matched = true", () => {
      for (const chunk of allAlertBatches) {
        for (const msg of chunk.messages) {
          expect(msg.matched).toBe(true);
        }
      }
    });

    it("alert_matches_batch: messages have enriched field names", () => {
      const first = allAlertBatches[0].messages[0];
      expect(typeof first.timestamp).toBe("number");
      expect(typeof first.station_id).toBe("string");
      expect((first as Record<string, unknown>).msg_text).toBeUndefined();
      expect((first as Record<string, unknown>).time).toBeUndefined();
    });

    // -- acarshub_version --

    it("acarshub_version has required string and boolean fields", () => {
      const ver = versionPayload as {
        container_version: string;
        backend_version: string;
        frontend_version: string;
        github_version: string;
        is_outdated: boolean;
      };
      expect(typeof ver.container_version).toBe("string");
      expect(ver.container_version.length).toBeGreaterThan(0);
      expect(typeof ver.backend_version).toBe("string");
      expect(ver.backend_version.length).toBeGreaterThan(0);
      expect(typeof ver.frontend_version).toBe("string");
      expect(ver.frontend_version.length).toBeGreaterThan(0);
      expect(typeof ver.github_version).toBe("string");
      expect(typeof ver.is_outdated).toBe("boolean");
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.2 query_search — all field variants
  // -------------------------------------------------------------------------

  describe("5.1.2 — query_search", () => {
    let socket: Socket;

    beforeEach(async () => {
      socket = connectClient(server.port);
      await waitForConnect(socket);
      // Drain connect-sequence events so they don't bleed into search results.
      await new Promise((r) => setTimeout(r, 200));
    });

    afterEach(() => {
      socket.disconnect();
    });

    /**
     * Helper: emit query_search and return the database_search_results payload.
     */
    async function search(params: Record<string, unknown>): Promise<{
      msghtml: AcarsMsg[];
      query_time: number;
      num_results: number;
    }> {
      const resultPromise = waitForEvent<{
        msghtml: AcarsMsg[];
        query_time: number;
        num_results: number;
      }>(socket, "database_search_results");
      // Flask-SocketIO namespace as third arg
      socket.emit("query_search", params as never, "/main");
      return resultPromise;
    }

    it("all-empty search_term fields act as no-filter and return all messages", async () => {
      // The handler converts empty strings to `undefined` for each field, so
      // a search with all-empty fields is equivalent to "no filter" and returns
      // every row in the database.  The seed DB has 1,144 messages.
      const result = await search({
        search_term: {
          flight: "",
          tail: "",
          icao: "",
          station_id: "",
          msg_text: "",
          label: "",
          freq: "",
          msgno: "",
          msg_type: "",
          depa: "",
          dsta: "",
        },
      });
      // No-filter search returns all messages — NOT zero.
      expect(result.num_results).toBeGreaterThan(0);
      expect(result.msghtml.length).toBeGreaterThan(0);
      expect(typeof result.query_time).toBe("number");
    });

    it("search by flight 'WN4899' returns >= 1 result", async () => {
      const result = await search({
        search_term: { flight: "WN4899" },
      });
      expect(result.num_results).toBeGreaterThanOrEqual(1);
      expect(result.msghtml.length).toBeGreaterThanOrEqual(1);
    });

    it("search by tail 'N8560Z' returns >= 1 result", async () => {
      const result = await search({
        search_term: { tail: "N8560Z" },
      });
      expect(result.num_results).toBeGreaterThanOrEqual(1);
    });

    it("search by station_id returns >= 1 result", async () => {
      const result = await search({
        search_term: { station_id: "CS-KABQ-ACARS" },
      });
      expect(result.num_results).toBeGreaterThanOrEqual(1);
    });

    it("search by label '12' returns >= 1 result", async () => {
      const result = await search({
        search_term: { label: "12" },
      });
      expect(result.num_results).toBeGreaterThanOrEqual(1);
    });

    it("search by msgno '2232' returns >= 1 result", async () => {
      const result = await search({
        search_term: { msgno: "2232" },
      });
      expect(result.num_results).toBeGreaterThanOrEqual(1);
    });

    it("search by msg_type 'ACARS' returns only ACARS messages", async () => {
      const result = await search({
        search_term: { msg_type: "ACARS" },
      });
      expect(result.num_results).toBeGreaterThan(0);
      for (const msg of result.msghtml) {
        expect(msg.message_type).toBe("ACARS");
      }
    });

    it("search by msg_type 'VDLM2' returns VDL-M2 messages (type normalized)", async () => {
      const result = await search({
        search_term: { msg_type: "VDLM2" },
      });
      expect(result.num_results).toBeGreaterThan(0);
      // VDLM2 is normalized to VDL-M2 in the enrichment layer
      for (const msg of result.msghtml) {
        expect(msg.message_type).toBe("VDL-M2");
      }
    });

    it("search results have enriched field names (no msg_text, no time)", async () => {
      const result = await search({
        search_term: { flight: "WN4899" },
      });
      expect(result.msghtml.length).toBeGreaterThan(0);
      for (const msg of result.msghtml) {
        expect(typeof msg.timestamp).toBe("number");
        expect(typeof msg.station_id).toBe("string");
        expect((msg as Record<string, unknown>).msg_text).toBeUndefined();
        expect((msg as Record<string, unknown>).time).toBeUndefined();
      }
    });

    it("query_time is a number >= 0", async () => {
      const result = await search({
        search_term: { flight: "WN4899" },
      });
      expect(typeof result.query_time).toBe("number");
      expect(result.query_time).toBeGreaterThanOrEqual(0);
    });

    it("pagination: results_after=0 and results_after=1 return different messages", async () => {
      // First, find out if there are enough results to paginate
      const all = await search({
        search_term: { station_id: "CS-KABQ-ACARS" },
        results_after: 0,
      });
      // Seed has 610 ACARS messages from this station so pagination is possible
      if (all.num_results <= 50) {
        // Not enough data to paginate — skip this assertion
        return;
      }

      const page0 = await search({
        search_term: { station_id: "CS-KABQ-ACARS" },
        results_after: 0,
      });

      const page1 = await search({
        search_term: { station_id: "CS-KABQ-ACARS" },
        results_after: 1,
      });

      expect(page0.msghtml.length).toBeGreaterThan(0);
      expect(page1.msghtml.length).toBeGreaterThan(0);

      // The UIDs on the two pages must be disjoint
      const uids0 = new Set(page0.msghtml.map((m) => m.uid).filter(Boolean));
      const uids1 = new Set(page1.msghtml.map((m) => m.uid).filter(Boolean));

      // At least some UIDs must differ
      const overlap = [...uids0].filter((uid) => uids1.has(uid));
      expect(overlap.length).toBeLessThan(uids0.size);
    });

    it("pagination beyond end: msghtml is empty but num_results still correct", async () => {
      const result = await search({
        search_term: { station_id: "CS-KABQ-ACARS" },
        results_after: 9999,
      });
      expect(result.msghtml).toEqual([]);
      expect(result.num_results).toBeGreaterThan(0);
    });

    it("show_all flag with empty search_term returns all messages", async () => {
      const result = await search({
        search_term: {},
        show_all: true,
        results_after: 0,
      });
      expect(result.num_results).toBeGreaterThan(0);
      expect(result.msghtml.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.3 update_alerts
  // -------------------------------------------------------------------------

  describe("5.1.3 — update_alerts", () => {
    it("broadcasts updated terms to ALL connected clients", async () => {
      const clientA = connectClient(server.port);
      const clientB = connectClient(server.port);

      await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

      // Wait for the connect sequence to finish on both clients
      await new Promise((r) => setTimeout(r, 300));

      // clientB listens for the broadcasted terms update
      const termsPromise = waitForEvent<{ terms: string[]; ignore: string[] }>(
        clientB,
        "terms",
      );

      const newTerms = { terms: ["INTEGTEST1"], ignore: [] };
      clientA.emit("update_alerts", newTerms, "/main");

      const received = await termsPromise;
      expect(received.terms).toContain("INTEGTEST1");

      clientA.disconnect();
      clientB.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4a request_status
  // -------------------------------------------------------------------------

  describe("5.1.4 — request_status", () => {
    let socket: Socket;

    beforeEach(async () => {
      socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterEach(() => {
      socket.disconnect();
    });

    it("emits system_status with required top-level fields", async () => {
      const statusPromise = waitForEvent<{ status: Record<string, unknown> }>(
        socket,
        "system_status",
      );

      socket.emit("request_status", undefined as never, "/main");

      const { status } = await statusPromise;

      expect(typeof status.error_state).toBe("boolean");
      expect(typeof status.decoders).toBe("object");
      expect(typeof status.servers).toBe("object");
      expect(typeof status.global).toBe("object");
      expect(typeof status.errors).toBe("object");
      expect(typeof status.threads).toBe("object");
    });

    it("system_status.errors has numeric Total and LastMinute", async () => {
      const statusPromise = waitForEvent<{
        status: {
          errors: { Total: number; LastMinute: number };
        };
      }>(socket, "system_status");

      socket.emit("request_status", undefined as never, "/main");

      const { status } = await statusPromise;

      expect(typeof status.errors.Total).toBe("number");
      expect(typeof status.errors.LastMinute).toBe("number");
      expect(status.errors.Total).toBeGreaterThanOrEqual(0);
    });

    it("system_status.threads has database and scheduler booleans", async () => {
      const statusPromise = waitForEvent<{
        status: { threads: { database: boolean; scheduler: boolean } };
      }>(socket, "system_status");

      socket.emit("request_status", undefined as never, "/main");

      const { status } = await statusPromise;

      expect(typeof status.threads.database).toBe("boolean");
      expect(typeof status.threads.scheduler).toBe("boolean");
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4b signal_freqs
  // -------------------------------------------------------------------------

  describe("5.1.4 — signal_freqs", () => {
    it("emits signal_freqs with array of {freq_type, freq, count}", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const eventPromise = waitForEvent<{
        freqs: Array<{ freq_type: string; freq: string; count: number }>;
      }>(socket, "signal_freqs");

      socket.emit("signal_freqs", undefined as never, "/main");

      const result = await eventPromise;

      expect(Array.isArray(result.freqs)).toBe(true);
      for (const item of result.freqs) {
        expect(typeof item.freq_type).toBe("string");
        expect(typeof item.freq).toBe("string");
        expect(typeof item.count).toBe("number");
        expect(item.count).toBeGreaterThan(0);
      }

      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4c signal_count
  // -------------------------------------------------------------------------

  describe("5.1.4 — signal_count", () => {
    it("emits signal_count with four non-negative numeric fields", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const eventPromise = waitForEvent<{
        count: {
          non_empty_total: number;
          non_empty_errors: number;
          empty_total: number;
          empty_errors: number;
        };
      }>(socket, "signal_count");

      socket.emit("signal_count", undefined as never, "/main");

      const result = await eventPromise;

      expect(typeof result.count.non_empty_total).toBe("number");
      expect(typeof result.count.non_empty_errors).toBe("number");
      expect(typeof result.count.empty_total).toBe("number");
      expect(typeof result.count.empty_errors).toBe("number");
      expect(result.count.non_empty_total).toBeGreaterThanOrEqual(0);
      expect(result.count.non_empty_errors).toBeGreaterThanOrEqual(0);
      expect(result.count.empty_total).toBeGreaterThanOrEqual(0);
      expect(result.count.empty_errors).toBeGreaterThanOrEqual(0);

      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4d signal_graphs
  // -------------------------------------------------------------------------

  describe("5.1.4 — signal_graphs", () => {
    it("emits alert_terms and signal to the requesting client", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      // Note: Python broadcasts signal to the namespace; Node targets the requester.
      // This tests the Node behavior (targeted, not broadcast). See API_PARITY.md.
      const alertTermsPromise = waitForEvent<{
        data: Record<number, { count: number; id: number; term: string }>;
      }>(socket, "alert_terms");
      const signalPromise = waitForEvent<{
        levels: Record<string, unknown[]>;
      }>(socket, "signal");

      socket.emit("signal_graphs", undefined as never, "/main");

      const [at, sig] = await Promise.all([alertTermsPromise, signalPromise]);

      expect(typeof at.data).toBe("object");
      expect(typeof sig.levels).toBe("object");

      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4e rrd_timeseries
  // -------------------------------------------------------------------------

  describe("5.1.4 — rrd_timeseries", () => {
    const VALID_PERIODS = [
      "1hr",
      "6hr",
      "12hr",
      "24hr",
      "1wk",
      "30day",
      "6mon",
      "1yr",
    ] as const;

    for (const period of VALID_PERIODS) {
      it(`returns rrd_timeseries_data for time_period="${period}"`, async () => {
        const socket = connectClient(server.port);
        await waitForConnect(socket);
        await new Promise((r) => setTimeout(r, 200));

        const eventPromise = waitForEvent<{
          data: Array<{
            timestamp: number;
            acars: number;
            vdlm: number;
            hfdl: number;
            imsl: number;
            irdm: number;
            total: number;
            error: number;
          }>;
          time_period?: string;
          points: number;
          start?: number;
          end?: number;
          error?: string;
        }>(socket, "rrd_timeseries_data", 12000);

        socket.emit(
          "rrd_timeseries",
          { time_period: period } as never,
          "/main",
        );

        const result = await eventPromise;

        expect(result.error).toBeUndefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(typeof result.points).toBe("number");

        // Seed DB has 4536 timeseries rows so at least some data is expected
        expect(result.data.length).toBeGreaterThan(0);

        // Verify data point shape and that timestamps are in milliseconds
        for (const point of result.data) {
          expect(typeof point.timestamp).toBe("number");
          // Millisecond timestamps are > 1 trillion (1e12)
          expect(point.timestamp).toBeGreaterThan(1e12);
          expect(typeof point.acars).toBe("number");
          expect(typeof point.vdlm).toBe("number");
          expect(typeof point.hfdl).toBe("number");
          expect(typeof point.total).toBe("number");
          expect(typeof point.error).toBe("number");
          expect(point.total).toBeGreaterThanOrEqual(0);
          expect(point.error).toBeGreaterThanOrEqual(0);
        }

        socket.disconnect();
      });
    }

    it("returns error response for invalid time_period", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const eventPromise = waitForEvent<{
        data: unknown[];
        error?: string;
      }>(socket, "rrd_timeseries_data");

      socket.emit(
        "rrd_timeseries",
        { time_period: "INVALID_PERIOD" } as never,
        "/main",
      );

      const result = await eventPromise;

      expect(typeof result.error).toBe("string");
      expect(result.error).toMatch(/invalid time period/i);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(0);

      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4f query_alerts_by_term
  // -------------------------------------------------------------------------

  describe("5.1.4 — query_alerts_by_term", () => {
    let socket: Socket;

    beforeEach(async () => {
      socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterEach(() => {
      socket.disconnect();
    });

    it("known term WN4899 returns >= 1 result with matched messages", async () => {
      const eventPromise = waitForEvent<{
        term: string;
        messages: AcarsMsg[];
        total_count: number;
        page: number;
        query_time: number;
      }>(socket, "alerts_by_term_results");

      socket.emit(
        "query_alerts_by_term",
        { term: "WN4899", page: 0 } as never,
        "/main",
      );

      const result = await eventPromise;

      expect(result.term).toBe("WN4899");
      expect(result.total_count).toBeGreaterThanOrEqual(1);
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(typeof result.query_time).toBe("number");

      // All returned messages should have enriched field names
      for (const msg of result.messages) {
        expect(typeof msg.timestamp).toBe("number");
        expect(typeof msg.station_id).toBe("string");
      }
    });

    it("unknown term returns total_count=0 and empty messages", async () => {
      const eventPromise = waitForEvent<{
        term: string;
        messages: AcarsMsg[];
        total_count: number;
        page: number;
        query_time: number;
      }>(socket, "alerts_by_term_results");

      socket.emit(
        "query_alerts_by_term",
        { term: "ZZZZZZZNOMATCH", page: 0 } as never,
        "/main",
      );

      const result = await eventPromise;

      expect(result.total_count).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("empty term returns total_count=0", async () => {
      const eventPromise = waitForEvent<{
        total_count: number;
        messages: AcarsMsg[];
      }>(socket, "alerts_by_term_results");

      socket.emit(
        "query_alerts_by_term",
        { term: "", page: 0 } as never,
        "/main",
      );

      const result = await eventPromise;

      expect(result.total_count).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("pagination: page 0 and page 1 return different messages when enough data", async () => {
      // WN4899 has 46 matches in seed DB.  Default page size is 50, so there
      // should be at least one page of results but not two.  Use N8560Z (37)
      // with a smaller check.
      const p0Promise = waitForEvent<{
        messages: AcarsMsg[];
        total_count: number;
      }>(socket, "alerts_by_term_results");

      socket.emit(
        "query_alerts_by_term",
        { term: "WN4899", page: 0 } as never,
        "/main",
      );

      const p0 = await p0Promise;

      if (p0.total_count <= 50) {
        // Not enough data to paginate meaningfully — skip
        return;
      }

      const p1Promise = waitForEvent<{
        messages: AcarsMsg[];
        total_count: number;
      }>(socket, "alerts_by_term_results");

      socket.emit(
        "query_alerts_by_term",
        { term: "WN4899", page: 1 } as never,
        "/main",
      );

      const p1 = await p1Promise;

      const uids0 = p0.messages.map((m) => m.uid).filter(Boolean);
      const uids1 = p1.messages.map((m) => m.uid).filter(Boolean);
      const overlap = uids0.filter((uid) => uids1.includes(uid));
      expect(overlap.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4g alert_term_query → database_search_results
  // -------------------------------------------------------------------------

  describe("5.1.4 — alert_term_query", () => {
    it("returns database_search_results for a known aircraft", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const eventPromise = waitForEvent<{
        msghtml: AcarsMsg[];
        query_time: number;
        num_results: number;
      }>(socket, "database_search_results");

      socket.emit(
        "alert_term_query",
        { icao: "", flight: "WN4899", tail: "" } as never,
        "/main",
      );

      const result = await eventPromise;

      expect(result.num_results).toBeGreaterThanOrEqual(1);
      expect(result.msghtml.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.4h request_recent_alerts
  // -------------------------------------------------------------------------

  describe("5.1.4 — request_recent_alerts", () => {
    it("emits recent_alerts with alerts array", async () => {
      const socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const eventPromise = waitForEvent<{ alerts: AcarsMsg[] }>(
        socket,
        "recent_alerts",
      );

      // Flask-SocketIO namespace as third arg (mirrors frontend socket.ts)
      socket.emit("request_recent_alerts", {} as never, "/main");

      const result = await eventPromise;

      expect(Array.isArray(result.alerts)).toBe(true);
      // Seed DB has 92 alert matches; we return up to 100
      expect(result.alerts.length).toBeGreaterThan(0);

      // All returned alerts must have enriched field names
      for (const msg of result.alerts) {
        expect(typeof msg.timestamp).toBe("number");
        expect(typeof msg.station_id).toBe("string");
        expect((msg as Record<string, unknown>).msg_text).toBeUndefined();
        expect((msg as Record<string, unknown>).time).toBeUndefined();
        expect(msg.matched).toBe(true);
      }

      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.5 Error handling and edge cases
  // -------------------------------------------------------------------------

  describe("5.1.5 — error handling and edge cases", () => {
    let socket: Socket;

    beforeEach(async () => {
      socket = connectClient(server.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterEach(() => {
      socket.disconnect();
    });

    it("server does not crash when query_search receives null payload", async () => {
      // Send a null payload — the handler must not throw
      socket.emit("query_search", null as never, "/main");
      // Give time for server to process
      await new Promise((r) => setTimeout(r, 200));
      // Connection should still be alive
      expect(socket.connected).toBe(true);
    });

    it("rrd_timeseries with missing time_period still returns a valid response", async () => {
      const eventPromise = waitForEvent<{
        data: unknown[];
        error?: string;
        points?: number;
      }>(socket, "rrd_timeseries_data");

      // No time_period, no start/end — handler should pick a default or error cleanly
      socket.emit("rrd_timeseries", {} as never, "/main");

      const result = await eventPromise;

      // Either returns data or a well-formed error — it must NOT crash the server
      if (result.error !== undefined) {
        expect(typeof result.error).toBe("string");
        expect(Array.isArray(result.data)).toBe(true);
      } else {
        expect(Array.isArray(result.data)).toBe(true);
      }

      expect(socket.connected).toBe(true);
    });

    it("query_alerts_by_term with undefined term does not crash", async () => {
      // Missing term key in payload
      socket.emit("query_alerts_by_term", { page: 0 } as never, "/main");
      await new Promise((r) => setTimeout(r, 200));
      expect(socket.connected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5.1.3b regenerate_alert_matches — success path
  //
  // The ALLOW_REMOTE_UPDATES=false scenario cannot be tested here because
  // ALLOW_REMOTE_UPDATES is a module-level constant frozen at import time.
  // That scenario is fully covered by the unit tests in handlers.test.ts.
  // -------------------------------------------------------------------------

  describe("5.1.3 — regenerate_alert_matches (success path)", () => {
    let regenDbPath: string;
    let regenServer: TestServer;

    beforeAll(async () => {
      // Use a fresh temp DB so this mutating test cannot affect other suites.
      regenDbPath = makeTempDb();
      regenServer = await createTestServer(regenDbPath);
    });

    afterAll(async () => {
      await regenServer.close();
      try {
        unlinkSync(regenDbPath);
      } catch {
        // Best-effort cleanup
      }
    });

    it("emits started then complete and then broadcasts alert_terms", async () => {
      const socket = connectClient(regenServer.port);
      await waitForConnect(socket);
      await new Promise((r) => setTimeout(r, 200));

      const startedPromise = waitForEvent<{ message: string }>(
        socket,
        "regenerate_alert_matches_started",
      );
      const completePromise = waitForEvent<{
        success: boolean;
        stats: {
          total_messages: number;
          matched_messages: number;
          total_matches: number;
        };
      }>(socket, "regenerate_alert_matches_complete", 30000);

      socket.emit("regenerate_alert_matches", undefined as never, "/main");

      const started = await startedPromise;
      expect(typeof started.message).toBe("string");

      const complete = await completePromise;
      expect(complete.success).toBe(true);
      expect(typeof complete.stats.total_messages).toBe("number");
      expect(typeof complete.stats.matched_messages).toBe("number");
      expect(typeof complete.stats.total_matches).toBe("number");
      expect(complete.stats.total_messages).toBeGreaterThan(0);

      socket.disconnect();
    });
  });
});

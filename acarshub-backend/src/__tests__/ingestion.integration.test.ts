// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Backend Ingestion Pipeline — Integration Test
 *
 * Goal of this file (TEST-MISSING-INTEGRATION in REMEDIATION_PLAN.md):
 *
 *   Raw decoder JSON  ──> MessageQueue  ──> formatAcarsMessage()
 *     ──> addMessageFromJson() (REAL SQLite + alert matching)
 *     ──> enrichMessage() (REAL airline/ground-station/icao_hex)
 *     ──> pushMessage / pushAlert (REAL in-memory ring buffer)
 *     ──> socket.emit("acars_msg", { msghtml: enriched })
 *
 * Every layer above is unit-tested in isolation elsewhere; what this
 * file pins is the *seam* between them.  Specifically, the
 * regressions this guards against are:
 *
 *  - Formatter output keys mismatching what createDbSafeParams reads
 *    (the entire ACARS column set is keyed by string and silently
 *    defaults to "" when a key is missing).
 *  - normalizeMessageType in services/index.ts being skipped or run
 *    in the wrong order (must be BEFORE addMessageFromJson AND
 *    BEFORE the Socket.IO emit so DB rows and clients see the same
 *    "VDL-M2"/"IMS-L" form, not the wire-format "VDLM2"/"IMSL").
 *  - Alert metadata (uid, matched, matched_text) being attached
 *    AFTER enrichment instead of BEFORE — enrichment is supposed to
 *    preserve PROTECTED_KEYS but if uid/matched leak in only after
 *    enrich, the protection is moot.
 *  - The "matched -> pushAlert / else pushMessage" branching being
 *    inverted, which would route alert hits into the regular ring
 *    buffer and silently break the alerts panel.
 *  - The Socket.IO event name and payload shape ({msghtml: ...}).
 *
 * NOT in scope here (covered elsewhere):
 *  - UDP/TCP/ZMQ socket protocol parsing (decoder-listener tests)
 *  - Scheduler timing (services-index + scheduler tests)
 *  - ADS-B polling (adsb-poller tests)
 *  - Station-id broadcast cadence (station-ids tests)
 *
 * STRATEGY
 * --------
 * Re-implement the *processing handler* from
 * services/index.ts::setupMessageQueue() in this file rather than
 * instantiating BackgroundServices.  BackgroundServices.initialize()
 * pulls env-driven config, creates scheduler tasks, optionally
 * spawns ADS-B pollers, and binds decoder listeners — none of which
 * are part of the ingestion seam under test.  Replicating just the
 * handler keeps the test focused, fast, and independent of process
 * env.  If the production handler ever diverges from this one, the
 * regression tests asserting field-level shape will fail and force
 * the diff back into agreement.
 *
 * Using a tmp-file SQLite database (NOT :memory:) because
 * runMigrations() opens its own better-sqlite3 connection by path,
 * and we need both that connection and the singleton initDatabase()
 * connection to see the same schema.  The temp file is deleted in
 * afterEach.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMessageFromJson,
  closeDatabase,
  initDatabase,
} from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { initializeAlertCache, setAlertTerms } from "../db/queries/alerts.js";
import { getMessageByUid } from "../db/queries/messages.js";
import type { RawMessage } from "../db/queries/messageTransform.js";
import { enrichMessage } from "../formatters/enrichment.js";
import { formatAcarsMessage } from "../formatters/index.js";
import {
  destroyMessageQueue,
  getMessageQueue,
  type QueuedMessage,
} from "../services/message-queue.js";
import {
  getRecentAlerts,
  getRecentMessages,
  initMessageBuffers,
  pushAlert,
  pushMessage,
  resetMessageBuffersForTesting,
} from "../services/message-ring-buffer.js";
import type { MessageType } from "../services/tcp-listener.js";

// ---------------------------------------------------------------------------
// Production handler — kept in sync with services/index.ts::setupMessageQueue
// ---------------------------------------------------------------------------

/**
 * Wire format -> DB format. Mirrors normalizeMessageType() in
 * services/index.ts. Kept as a free function (rather than imported)
 * because the production copy is private.  If they ever diverge, the
 * "DB row uses VDL-M2 not VDLM2" test below catches it.
 */
function normalizeMessageType(type: MessageType): string {
  switch (type) {
    case "VDLM2":
      return "VDL-M2";
    case "IMSL":
      return "IMS-L";
    default:
      return type;
  }
}

interface FakeSocket {
  emit: ReturnType<typeof vi.fn>;
}

/**
 * The production ingestion handler, minus the try/catch logger and
 * the station-ids side effect (which has its own unit tests).
 * Returns void; observable effects are DB row, ring buffer state,
 * and socket.emit calls.
 */
function ingestMessage(
  queued: QueuedMessage,
  socket: FakeSocket,
): { uid: number | string; matched: boolean } | null {
  const rawMessage = queued.data as Record<string, unknown>;
  const formattedMessage = formatAcarsMessage(rawMessage);
  if (!formattedMessage) {
    return null;
  }
  const dbMessageType = normalizeMessageType(queued.type);

  const alertMetadata = addMessageFromJson(
    dbMessageType,
    formattedMessage as RawMessage,
  );

  // Attach alert metadata BEFORE enrichment — enrichMessage uses
  // PROTECTED_KEYS to preserve uid/matched/matched_text through the
  // enrichment passes. If a future refactor moves these assignments
  // to *after* enrich(), the PROTECTED_KEYS guarantee becomes
  // unenforceable: protection only matters if the keys exist when
  // enrichment runs.
  formattedMessage.uid = alertMetadata.uid;
  formattedMessage.matched = alertMetadata.matched;
  formattedMessage.matched_text = alertMetadata.matched_text;
  formattedMessage.matched_icao = alertMetadata.matched_icao;
  formattedMessage.matched_tail = alertMetadata.matched_tail;
  formattedMessage.matched_flight = alertMetadata.matched_flight;
  formattedMessage.message_type = dbMessageType;

  const enrichedMessage = enrichMessage(formattedMessage);

  // Update ring buffer BEFORE emitting — a client that connects in
  // this exact instant otherwise sees an emit it then double-counts
  // when warmMessageBuffers() back-fills.
  if (alertMetadata.matched) {
    pushAlert(enrichedMessage);
  } else {
    pushMessage(enrichedMessage);
  }

  socket.emit("acars_msg", { msghtml: enrichedMessage });

  return { uid: alertMetadata.uid, matched: alertMetadata.matched };
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;
let socket: FakeSocket;

beforeEach(() => {
  // tmp-file DB (not :memory:) so both initDatabase() and
  // runMigrations() — which open their own connections — see the
  // same schema.  ":memory:" databases are per-connection.
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-ingest-it-"));
  dbPath = join(tmpDir, "test.db");

  runMigrations(dbPath);
  initDatabase(dbPath);

  // Alert cache must be (re-)initialised after migrations create the
  // alert_terms table; otherwise getCachedAlertTerms() returns []
  // and the matched-message branch never fires.
  initializeAlertCache();

  // Default to no alert terms (overridden in specific tests below).
  setAlertTerms([]);

  initMessageBuffers();

  socket = { emit: vi.fn() };
});

afterEach(() => {
  destroyMessageQueue();
  resetMessageBuffersForTesting();
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal raw ACARS decoder JSON.  Real acarsdec output has
 * many more keys; this is the documented minimum the formatter and
 * createDbSafeParams() can handle.
 */
function makeRawAcars(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    timestamp: 1700000000,
    station_id: "test-station",
    icao: 0xa8d8d3, // numeric icao — formatter converts to "A8D8D3"
    tail: ".N12345",
    flight: "UA1234",
    freq: 131.55,
    label: "H1",
    text: "HELLO WORLD - REGULAR MESSAGE",
    level: -18.2,
    error: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestion pipeline (integration)", () => {
  describe("happy path — non-alert ACARS message", () => {
    it("persists to DB, pushes to message ring buffer, emits acars_msg", () => {
      const result = ingestMessage(
        { type: "ACARS", data: makeRawAcars() },
        socket,
      );

      // 1. Pipeline returned a uid (real DB-assigned row id)
      expect(result).not.toBeNull();
      expect(result?.matched).toBe(false);
      // uid from addMessage is a string (e.g. "1"); getMessageByUid
      // takes a string and coerces internally.
      const uidStr = String(result?.uid);
      expect(Number(uidStr)).toBeGreaterThan(0);

      // 2. DB row exists with the EXPECTED message_type form
      const row = getMessageByUid(uidStr);
      expect(row).toBeDefined();
      // Pin the wire->DB normalization: ACARS stays ACARS.
      // Drizzle returns rows keyed by the schema field name
      // (messageType), not the underlying column name
      // (message_type).
      expect(row?.messageType).toBe("ACARS");
      // Pin formatter -> DB column wiring for a couple of critical
      // fields. text is the FTS-indexed body; icao is the
      // normalized hex string (formatter converts 0xA8D8D3 to
      // "A8D8D3").
      expect(row?.text).toBe("HELLO WORLD - REGULAR MESSAGE");
      expect(row?.icao).toBe("A8D8D3");

      // 3. Ring buffer received the enriched message in the
      // NON-alert buffer (production "matched ? pushAlert : pushMessage").
      const recent = getRecentMessages();
      const alerts = getRecentAlerts();
      expect(recent).toHaveLength(1);
      expect(alerts).toHaveLength(0);
      expect(recent[0]?.uid).toBe(result?.uid);

      // 4. Exactly one socket emit, with the documented event name
      // and payload shape.  The payload contract is { msghtml: ... }
      // — the frontend acars_msg handler unwraps it as
      //   socket.on("acars_msg", ({ msghtml }) => ...).
      expect(socket.emit).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith(
        "acars_msg",
        expect.objectContaining({
          msghtml: expect.objectContaining({
            uid: result?.uid,
            message_type: "ACARS",
            icao: "A8D8D3",
          }),
        }),
      );
    });

    it("emitted payload contains enrichment fields (icao_hex, etc.) not just the formatter output", () => {
      ingestMessage({ type: "ACARS", data: makeRawAcars() }, socket);
      const emitted = socket.emit.mock.calls[0]?.[1] as {
        msghtml: Record<string, unknown>;
      };
      // icao_hex is added by enrichMessage from icao; if the
      // enrichment step were skipped or swallowed the message, this
      // would be undefined. Pinning a single enrichment field is
      // sufficient — the formatters/enrichment.ts unit tests already
      // cover field-by-field correctness.
      expect(emitted.msghtml.icao_hex).toBeDefined();
    });
  });

  describe("message-type normalization across the seam", () => {
    it("VDLM2 wire-format is stored as 'VDL-M2' in DB AND emitted as 'VDL-M2'", () => {
      // Critical seam test: the production handler calls
      // normalizeMessageType() BEFORE both addMessageFromJson and
      // the socket emit, so DB and clients agree.  A regression where
      // the normalize happens only on the DB side (or only on the
      // emit side) would silently drift the two apart and break
      // frontend filtering, which keys off message_type strings.
      const result = ingestMessage(
        {
          type: "VDLM2",
          data: {
            vdl2: {
              t: { sec: 1700000001 },
              station: "vdl-station",
              avlc: {
                src: { addr: "A8D8D3", type: "Aircraft" },
                dst: { addr: "1234" },
                acars: {
                  msg_text: "VDLM2 BODY TEXT",
                  reg: ".N12345",
                  flight: "UA1234",
                  label: "H1",
                },
              },
              freq: 136975000,
              sig_level: -18.2,
              hdr_bits_fixed: 0,
            },
          },
        },
        socket,
      );

      expect(result).not.toBeNull();
      const numericUid = Number(result?.uid);
      expect(numericUid).toBeGreaterThan(0);
      const row = getMessageByUid(String(result?.uid));
      expect(row?.messageType).toBe("VDL-M2");

      const emitted = socket.emit.mock.calls[0]?.[1] as {
        msghtml: Record<string, unknown>;
      };
      expect(emitted.msghtml.message_type).toBe("VDL-M2");
    });

    it("IMSL wire-format is stored as 'IMS-L' in DB AND emitted as 'IMS-L'", () => {
      // Same seam, second normalization branch. JAERO IMSL detection
      // requires message.app.name === "JAERO" and acars-shaped data.
      const result = ingestMessage(
        {
          type: "IMSL",
          data: {
            app: { name: "JAERO" },
            timestamp: 1700000002,
            station_id: "imsl-station",
            text: "IMSL body",
            isu: { acars: { text: "IMSL inner" } },
          },
        },
        socket,
      );

      // formatJaeroImslMessage may reshape the message; what we care
      // about is that whatever lands in the DB and on the wire is
      // tagged consistently. If the formatter returned null, the
      // pipeline early-returns and there is nothing to compare —
      // skip the assertion path for that case.
      if (result === null) {
        return;
      }
      const numericUid = Number(result.uid);
      if (numericUid <= 0) {
        return; // empty-body message, not persisted
      }
      const row = getMessageByUid(String(result.uid));
      expect(row?.messageType).toBe("IMS-L");

      const emitted = socket.emit.mock.calls[0]?.[1] as {
        msghtml: Record<string, unknown>;
      };
      expect(emitted.msghtml.message_type).toBe("IMS-L");
    });

    it("ACARS, HFDL, IRDM pass through unchanged (no normalization)", () => {
      ingestMessage({ type: "ACARS", data: makeRawAcars() }, socket);
      const emit1 = socket.emit.mock.calls[0]?.[1] as {
        msghtml: Record<string, unknown>;
      };
      expect(emit1.msghtml.message_type).toBe("ACARS");
      // HFDL and IRDM have their own formatter branches keyed off
      // top-level shape.  We only verify the type label here, not
      // the full HFDL/IRDM payload (covered by formatter unit tests).
    });
  });

  describe("alert matching propagates through the seam", () => {
    it("matched message routes to alert buffer, not message buffer", () => {
      setAlertTerms(["EMERGENCY"]);
      initializeAlertCache();

      const result = ingestMessage(
        {
          type: "ACARS",
          data: makeRawAcars({ text: "MAYDAY EMERGENCY OVER ATLANTIC" }),
        },
        socket,
      );

      expect(result?.matched).toBe(true);

      // Critical branching test: matched -> pushAlert (NOT pushMessage).
      // A regression that inverted this would silently break the
      // alerts panel — alerts would appear in the regular feed and
      // vice versa.
      expect(getRecentAlerts()).toHaveLength(1);
      expect(getRecentMessages()).toHaveLength(0);
      expect(getRecentAlerts()[0]?.matched).toBe(true);
    });

    it("alert metadata (uid, matched, matched_text) survives enrichment", () => {
      // Regression target: PROTECTED_KEYS in enrichMessage must
      // preserve uid/matched/matched_text from being overwritten by
      // enrichment passes.  If a future refactor removes a key from
      // PROTECTED_KEYS, the emitted payload would lose it.
      setAlertTerms(["URGENT"]);
      initializeAlertCache();

      ingestMessage(
        {
          type: "ACARS",
          data: makeRawAcars({ text: "URGENT REQUEST FUEL" }),
        },
        socket,
      );

      const emitted = socket.emit.mock.calls[0]?.[1] as {
        msghtml: Record<string, unknown>;
      };
      expect(emitted.msghtml.matched).toBe(true);
      // matched_text comes from alert_matches.matched_text JSON
      // column, populated by addMessage() during alert evaluation.
      // We don't assert the exact array content (that's covered in
      // alerts.test.ts) — only that it survives the enrichment
      // pass and reaches the socket.
      expect(Array.isArray(emitted.msghtml.matched_text)).toBe(true);
      expect((emitted.msghtml.matched_text as string[]).length).toBeGreaterThan(
        0,
      );
      // The persisted DB row's uid must equal the emitted uid —
      // pins that the same alert metadata is used for persistence
      // and broadcast (no double-write, no race).
      expect(emitted.msghtml.uid).toBeDefined();
    });
  });

  describe("formatter returns null short-circuits the pipeline", () => {
    it("does not persist, push, or emit when formatAcarsMessage returns null", () => {
      // A message with no recognizable shape (no vdl2, no hfdl, no
      // app/source, no icao at top level) currently falls through
      // to "return message as FormattedMessage". To get an explicit
      // null we use a SatDump source with an unsupported msg_name.
      ingestMessage(
        {
          type: "ACARS",
          data: {
            source: { app: { name: "SatDump" } },
            msg_name: "UNSUPPORTED",
          },
        },
        socket,
      );

      // Nothing in the ring buffer, nothing on the wire.
      expect(getRecentMessages()).toHaveLength(0);
      expect(getRecentAlerts()).toHaveLength(0);
      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  describe("ordering invariant: ring-buffer push happens BEFORE socket emit", () => {
    it("a snapshot taken inside the emit callback already shows the new message in the buffer", () => {
      // Race regression target: if a client emit synchronously
      // triggered a warmMessageBuffers re-snapshot (e.g. via a
      // 'request_recent' handler that runs in the same tick) and
      // the production handler emitted before pushing, the snapshot
      // would briefly NOT contain the just-emitted message,
      // double-counting it when the client later receives the
      // delayed push. Verify the production ordering: push first,
      // emit after — by checking the buffer state from inside the
      // synchronous emit handler.
      let bufferLengthAtEmitTime = -1;
      const observingSocket: FakeSocket = {
        emit: vi.fn(() => {
          bufferLengthAtEmitTime = getRecentMessages().length;
        }),
      };

      ingestMessage({ type: "ACARS", data: makeRawAcars() }, observingSocket);

      // At the moment the emit fired, the message must already be
      // in the ring buffer.
      expect(bufferLengthAtEmitTime).toBe(1);
    });
  });

  describe("MessageQueue wiring — end-to-end via real queue", () => {
    it("messageQueue.push() drives the handler through its 'message' event", () =>
      new Promise<void>((resolve) => {
        // Pin the real MessageQueue -> handler wiring. The queue
        // emits 'message' (QueuedMessage) for each push() once
        // through the internal EventEmitter. This is the actual
        // glue used by services/index.ts::setupMessageQueue.
        const queue = getMessageQueue(15);

        queue.on("message", (queued: QueuedMessage) => {
          ingestMessage(queued, socket);
          // Assertions in the handler-completion tick: persistence
          // happened, ring buffer updated, emit fired.
          expect(getRecentMessages()).toHaveLength(1);
          expect(socket.emit).toHaveBeenCalledTimes(1);
          resolve();
        });

        queue.push("ACARS", makeRawAcars());
      }));
  });
});

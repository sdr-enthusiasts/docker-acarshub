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
 * v4.3 Phase 6 — ACARS Message Session Linking (ingest wiring).
 *
 * These tests exercise the REAL production code path: a genuine
 * `BackgroundServices` instance, driven through the real `MessageQueue`,
 * against a real migrated file-backed SQLite database (`:memory:` is
 * per-connection, so runMigrations() and a separate assertion connection
 * would never see the same schema — same reasoning as
 * ingestion.integration.test.ts). Decoder listeners and ADS-B polling are
 * inert because `ENABLE_ACARS`/`ENABLE_ADSB`/etc default to false when
 * unset — nothing here needs to be reimplemented or hand-mocked to get
 * coverage of setupMessageQueue()'s session-linking block.
 *
 * Session matching itself runs through the real session-service.ts
 * (`findOrCreateSession`), so these tests double as end-to-end coverage of
 * D1–D3 as actually wired, not a hand-typed copy of the wiring.
 *
 * The ONE thing deliberately stubbed is the Phase 4 search-index rebuilder.
 * `BackgroundServices.initialize()` calls `scheduleIfNeeded()`, and on a
 * freshly migrated test database `system_config` holds no decoder version, so
 * the real implementation correctly concludes the version has changed and
 * fires a full background rebuild over this database — sweeping `messages`,
 * decoding, and writing `decoded_messages` rows on `setImmediate` batches that
 * interleave with these tests' assertions and can outlive `closeDatabase()` in
 * teardown. That is right in production and wrong in a test: it makes these
 * tests non-hermetic and racy against a service they are not testing. Stubbing
 * the singleton factory is the narrowest way to keep the rest of the wiring
 * real. Phase 4's own behaviour is covered by search-index-rebuild.test.ts.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  initializeAlertCache,
  setAlertTerms,
} from "../../db/queries/alerts.js";
import { BackgroundServices } from "../background-services.js";
import { destroyMessageQueue, getMessageQueue } from "../message-queue.js";
import * as messageRingBufferModule from "../message-ring-buffer.js";
import {
  initMessageBuffers,
  resetMessageBuffersForTesting,
} from "../message-ring-buffer.js";
import { destroyScheduler } from "../scheduler.js";
import * as sessionServiceModule from "../session-service.js";
import type { MessageType } from "../tcp-listener.js";

// See the file header for why the rebuilder — and only the rebuilder — is
// stubbed here.
vi.mock("../search-index-rebuild.js", () => ({
  getSearchIndexRebuilder: (): { scheduleIfNeeded: () => boolean } => ({
    scheduleIfNeeded: (): boolean => false,
  }),
  destroySearchIndexRebuilder: (): void => {},
}));

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

interface FakeSocket {
  emit: ReturnType<typeof vi.fn>;
}

let tmpDir: string;
let dbPath: string;
let socket: FakeSocket;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-session-linking-"));
  dbPath = join(tmpDir, "test.db");

  runMigrations(dbPath);
  initDatabase(dbPath);

  // Alert cache must be (re-)initialized after migrations create the
  // alert_terms table; see ingestion.integration.test.ts for the same note.
  initializeAlertCache();
  setAlertTerms([]);

  initMessageBuffers();

  socket = { emit: vi.fn() };
  const services = new BackgroundServices({ socketio: socket });
  await services.initialize();
});

afterEach(() => {
  vi.restoreAllMocks();
  destroyMessageQueue();
  destroyScheduler();
  resetMessageBuffersForTesting();
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Raw decoder payload fixtures — one per decoder type, matching the shapes
// formatters/index.ts's dispatcher recognizes. Modeled on
// ingestion.integration.test.ts's makeRawAcars()/VDLM2/IMSL fixtures.
// ---------------------------------------------------------------------------

function makeRawAcars(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    timestamp: Math.floor(Date.now() / 1000),
    station_id: "test-station",
    icao: "ABC123",
    tail: ".N12345",
    flight: "UA1234",
    freq: 131.55,
    label: "H1",
    text: "TEST MESSAGE BODY",
    level: -18.2,
    error: 0,
    ...overrides,
  };
}

function makeRawVdlm2(hex: string): Record<string, unknown> {
  return {
    vdl2: {
      t: { sec: Math.floor(Date.now() / 1000) },
      station: "vdl-station",
      avlc: {
        src: { addr: hex, type: "Aircraft" },
        dst: { addr: "1234" },
        acars: {
          msg_text: "VDLM2 BODY TEXT",
          reg: ".N54321",
          flight: "UA5678",
          label: "H1",
        },
      },
      freq: 136975000,
      sig_level: -18.2,
      hdr_bits_fixed: 0,
    },
  };
}

function makeRawHfdl(hex: string): Record<string, unknown> {
  return {
    hfdl: {
      t: { sec: Math.floor(Date.now() / 1000) },
      station: "hfdl-station",
      freq: 8927000,
      sig_level: -20,
      lpdu: {
        src: { addr: "aabb" },
        dst: { addr: "ccdd" },
        ac_info: { icao: hex },
        hfnpdu: { flight_id: "UA9012" },
      },
    },
  };
}

function makeRawImsl(tail: string): Record<string, unknown> {
  return {
    app: { name: "JAERO" },
    t: { sec: Math.floor(Date.now() / 1000) },
    station: "imsl-station",
    isu: {
      acars: { msg_text: "IMSL BODY TEXT", reg: tail },
    },
  };
}

function makeRawIrdm(tail: string): Record<string, unknown> {
  return {
    app: { name: "iridium-toolkit" },
    freq: 1616000000,
    level: -20,
    source: { station_id: "irdm-station" },
    acars: {
      timestamp: new Date().toISOString(),
      tail,
      flight: "UA3456",
      text: "IRDM BODY TEXT",
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Push a message onto the real (singleton) MessageQueue and let the real
 * setupMessageQueue() handler run. MessageQueue.push() emits its 'message'
 * event synchronously, and the handler contains no `await`, so it completes
 * within the same synchronous call in practice — the tick is a defensive
 * margin, matching the idiom used elsewhere in this test suite
 * (background-services.test.ts's "Message routing" tests).
 */
async function ingest(type: MessageType, data: unknown): Promise<void> {
  getMessageQueue().push(type, data);
  await new Promise((resolve) => setImmediate(resolve));
}

interface MessageRow {
  id: number;
  session_id: number | null;
}

function getMessageRow(uid: number): MessageRow | undefined {
  return getSqliteConnection()
    .prepare("SELECT id, session_id FROM messages WHERE id = ?")
    .get(uid) as MessageRow | undefined;
}

/**
 * Look up a message row by its `icao` column rather than by uid. Needed by
 * tests that force a throw BEFORE the acars_msg emit — the emit is where
 * these tests would normally read the uid off `lastAcarsMsgEmit()`, so a
 * throw upstream of it means that path is unavailable and the row has to be
 * found by a value the test chose itself instead.
 */
function getMessageRowByIcao(icao: string): MessageRow | undefined {
  return getSqliteConnection()
    .prepare(
      "SELECT id, session_id FROM messages WHERE icao = ? ORDER BY id DESC LIMIT 1",
    )
    .get(icao) as MessageRow | undefined;
}

interface AircraftRow {
  id: number;
  icao_hex: string | null;
  callsign: string | null;
  tail: string | null;
  first_seen: number;
  last_seen: number;
  is_active: number;
  session_type: string;
  pairing_method: string | null;
}

function getSession(id: number): AircraftRow | undefined {
  return getSqliteConnection()
    .prepare("SELECT * FROM aircraft WHERE id = ?")
    .get(id) as AircraftRow | undefined;
}

function countSessions(): number {
  const row = getSqliteConnection()
    .prepare("SELECT COUNT(*) AS c FROM aircraft")
    .get() as { c: number };
  return row.c;
}

/** Manually push a session's last_seen into the past, bypassing
 * findOrCreateSession() entirely, so a subsequent real ingest (using the
 * actual wall clock) produces an observably later last_seen without the
 * test needing to sleep in real time. */
function ageSession(id: number, secondsAgo: number): void {
  getSqliteConnection()
    .prepare("UPDATE aircraft SET last_seen = last_seen - ? WHERE id = ?")
    .run(secondsAgo, id);
}

type EmitCall = [string, unknown];

function emitCalls(event: string): EmitCall[] {
  return socket.emit.mock.calls.filter(
    (call: EmitCall) => call[0] === event,
  ) as EmitCall[];
}

function lastAcarsMsgEmit(): { msghtml: Record<string, unknown> } | undefined {
  const calls = emitCalls("acars_msg");
  return calls[calls.length - 1]?.[1] as
    | { msghtml: Record<string, unknown> }
    | undefined;
}

function lastSessionEvent():
  | { sessionId: number; messages: Array<Record<string, unknown>> }
  | undefined {
  const calls = emitCalls("session_messages_updated");
  return calls[calls.length - 1]?.[1] as
    | { sessionId: number; messages: Array<Record<string, unknown>> }
    | undefined;
}

// ---------------------------------------------------------------------------
// 1. Linking to an existing active session
// ---------------------------------------------------------------------------

describe("session linking — existing session match", () => {
  it("links a message with a known hex to an EXISTING active session, advancing last_seen, without creating a second session row", async () => {
    await ingest("ACARS", makeRawAcars({ icao: "AAAAA1" }));
    const firstSession = lastSessionEvent();
    expect(firstSession).toBeDefined();
    const sessionId = firstSession?.sessionId as number;

    const before = getSession(sessionId);
    expect(before).toBeDefined();

    // Push last_seen into the past so the second ingest's real-wall-clock
    // update is observably later, without sleeping in real time.
    ageSession(sessionId, 100);
    const aged = getSession(sessionId);
    expect(aged?.last_seen).toBe((before?.last_seen ?? 0) - 100);

    expect(countSessions()).toBe(1);

    await ingest("ACARS", makeRawAcars({ icao: "AAAAA1" }));
    const secondSession = lastSessionEvent();
    expect(secondSession?.sessionId).toBe(sessionId);

    // Still exactly one session row — matched, not duplicated.
    expect(countSessions()).toBe(1);

    const after = getSession(sessionId);
    expect(after?.last_seen).toBeGreaterThan(aged?.last_seen ?? 0);

    // Both messages point at the same session.
    const secondUid = Number(lastAcarsMsgEmit()?.msghtml.uid);
    expect(getMessageRow(secondUid)?.session_id).toBe(sessionId);
  });
});

// ---------------------------------------------------------------------------
// 2. No matching session -> new acars_only session
// ---------------------------------------------------------------------------

describe("session linking — no existing match", () => {
  it("creates a NEW acars_only session and points messages.session_id at it", async () => {
    const before = countSessions();

    await ingest("ACARS", makeRawAcars({ icao: "BBBBB2" }));

    expect(countSessions()).toBe(before + 1);

    const event = lastSessionEvent();
    expect(event).toBeDefined();
    const session = getSession(event?.sessionId as number);
    expect(session).toBeDefined();
    expect(session?.session_type).toBe("acars_only");
    expect(session?.pairing_method).toBe("hex");
    expect(session?.icao_hex).toBe("BBBBB2");

    const uid = Number(lastAcarsMsgEmit()?.msghtml.uid);
    expect(getMessageRow(uid)?.session_id).toBe(session?.id);
  });
});

// ---------------------------------------------------------------------------
// 3. D2 mapping — session_type per decoder type, and upgrade precedence
// ---------------------------------------------------------------------------

describe("session linking — D2 decoder-type -> session_type mapping", () => {
  it.each([
    [
      "ACARS" as MessageType,
      () => makeRawAcars({ icao: "CCCC01" }),
      "acars_only",
    ],
    ["VDLM2" as MessageType, () => makeRawVdlm2("CCCC02"), "vdlm2"],
    ["HFDL" as MessageType, () => makeRawHfdl("CCCC03"), "hfdl"],
    ["IMSL" as MessageType, () => makeRawImsl("N-CCCC04"), "adsc"],
    ["IRDM" as MessageType, () => makeRawIrdm("N-CCCC05"), "adsc"],
  ])(
    "%s maps to session_type '%s'",
    async (type, buildData, expectedSessionType) => {
      await ingest(type, buildData());

      const event = lastSessionEvent();
      expect(event).toBeDefined();
      const session = getSession(event?.sessionId as number);
      expect(session?.session_type).toBe(expectedSessionType);
    },
  );

  it("upgrades an acars_only session to a more authoritative type when a later message arrives on a better source", async () => {
    await ingest("ACARS", makeRawAcars({ icao: "DDDDD1" }));
    const firstEvent = lastSessionEvent();
    const sessionId = firstEvent?.sessionId as number;
    expect(getSession(sessionId)?.session_type).toBe("acars_only");

    await ingest("VDLM2", makeRawVdlm2("DDDDD1"));
    const secondEvent = lastSessionEvent();

    // Same session, matched by hex — not a new row.
    expect(secondEvent?.sessionId).toBe(sessionId);
    expect(countSessions()).toBe(1);

    const upgraded = getSession(sessionId);
    expect(upgraded?.session_type).toBe("vdlm2");
  });
});

// ---------------------------------------------------------------------------
// 4. D3 — no usable identifier skips session matching entirely
// ---------------------------------------------------------------------------

describe("session linking — D3 no-identifier messages", () => {
  it("leaves messages.session_id NULL and creates no session row for a message with no icao, flight, or tail", async () => {
    const sessionCountBefore = countSessions();

    // No icao/tail/flight anywhere in the raw payload; text carries content
    // so the message still passes the DB save filter and gets a real row.
    await ingest("ACARS", {
      timestamp: Math.floor(Date.now() / 1000),
      station_id: "test-station",
      text: "NO IDENTIFIERS AT ALL",
      freq: 131.55,
      level: -18.2,
      error: 0,
    });

    const uid = Number(lastAcarsMsgEmit()?.msghtml.uid);
    expect(uid).toBeGreaterThan(0);

    const row = getMessageRow(uid);
    expect(row).toBeDefined();
    expect(row?.session_id).toBeNull();

    expect(countSessions()).toBe(sessionCountBefore);
    expect(lastSessionEvent()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Unsaved messages (non-positive uid placeholder) are never linked
// ---------------------------------------------------------------------------

describe("session linking — unsaved messages", () => {
  it("creates no session and no link for an unsaved message (negative uid placeholder)", async () => {
    const sessionCountBefore = countSessions();

    // isMessageNotEmpty() does not consider `icao` — only
    // text/label/flight/tail/depa/dsta/libacars. A message carrying only an
    // icao is therefore classified empty (with DB_SAVEALL off, the test
    // default) and never inserted, even though it DOES carry a
    // session-linkable identifier. This is exactly the case the uid<=0
    // guard exists for.
    await ingest("ACARS", {
      timestamp: Math.floor(Date.now() / 1000),
      station_id: "test-station",
      icao: "EEEEE1",
    });

    const emitted = lastAcarsMsgEmit();
    expect(emitted).toBeDefined();
    const uid = Number(emitted?.msghtml.uid);
    expect(uid).toBeLessThanOrEqual(0);

    // Never inserted — nothing to look up.
    expect(getMessageRow(uid)).toBeUndefined();

    expect(countSessions()).toBe(sessionCountBefore);
    expect(lastSessionEvent()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Session-linking failures never suppress ingestion
// ---------------------------------------------------------------------------

describe("session linking — failure isolation", () => {
  it("does not prevent the acars_msg emit or fail ingestion when session linking throws", async () => {
    const spy = vi
      .spyOn(sessionServiceModule, "findOrCreateSession")
      .mockImplementation(() => {
        throw new Error("simulated session-linking failure");
      });

    await ingest("ACARS", makeRawAcars({ icao: "FFFFF1" }));

    spy.mockRestore();

    // The message still went out to clients...
    const emitted = lastAcarsMsgEmit();
    expect(emitted).toBeDefined();
    const uid = Number(emitted?.msghtml.uid);
    expect(uid).toBeGreaterThan(0);

    // ...and was still persisted...
    const row = getMessageRow(uid);
    expect(row).toBeDefined();
    // ...just without a session link, since findOrCreateSession threw
    // before the UPDATE could run.
    expect(row?.session_id).toBeNull();

    // No session event went out either.
    expect(lastSessionEvent()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. session_messages_updated emit shape
// ---------------------------------------------------------------------------

describe("session linking — session_messages_updated emit shape", () => {
  it("emits sessionId and the enriched message, with exactly two arguments (no '/main' namespace argument)", async () => {
    await ingest("ACARS", makeRawAcars({ icao: "F00D01" }));

    const calls = socket.emit.mock.calls.filter(
      (call: EmitCall) => call[0] === "session_messages_updated",
    );
    expect(calls).toHaveLength(1);
    // Exactly two arguments: (event, payload). A third "/main" argument
    // would be the historical Flask-SocketIO Python-client artifact this
    // codebase has already removed once (TYPE-01/TYPE-02) and must not
    // reappear.
    expect(calls[0]).toHaveLength(2);

    const [, payload] = calls[0] as [
      string,
      { sessionId: number; messages: Array<Record<string, unknown>> },
    ];
    const acarsEmitted = lastAcarsMsgEmit();
    const expectedUid = acarsEmitted?.msghtml.uid;

    expect(typeof payload.sessionId).toBe("number");
    const session = getSession(payload.sessionId);
    expect(session).toBeDefined();
    expect(session?.icao_hex).toBe("F00D01");

    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.uid).toBe(expectedUid);
    expect(payload.messages[0]?.icao_hex).toBe("F00D01");
  });
});

// ---------------------------------------------------------------------------
// 8. G1 — the fall-through guard must gate on pipeline SUCCESS, not on the
//    truthiness of values assigned well before the pipeline can still throw
// ---------------------------------------------------------------------------

describe("session linking — G1 pipeline-failure fall-through guard", () => {
  it("creates NO session and links NO message when a throw occurs between enrichMessage() and the end of the try block", async () => {
    const sessionCountBefore = countSessions();

    // dbMessageType/alertMetadata/enrichedMessage are all assigned by
    // enrichMessage(), which runs BEFORE pushMessage(). Throwing inside
    // pushMessage() reproduces exactly the gap the fall-through guard must
    // close: all three values are truthy, but the pipeline did not finish
    // (the acars_msg emit never ran).
    const pushMessageSpy = vi
      .spyOn(messageRingBufferModule, "pushMessage")
      .mockImplementationOnce(() => {
        throw new Error("simulated pushMessage failure");
      });

    await ingest("ACARS", makeRawAcars({ icao: "A1A1A1", flight: undefined }));

    pushMessageSpy.mockRestore();

    // The acars_msg emit is AFTER pushMessage() in the try block, so the
    // throw means it never happened — the client never received this
    // message.
    expect(lastAcarsMsgEmit()).toBeUndefined();

    // The message row itself was still inserted (addMessageFromJson() ran
    // before the throw), but must carry no session link.
    const row = getMessageRowByIcao("A1A1A1");
    expect(row).toBeDefined();
    expect(row?.session_id).toBeNull();

    // Without the `pipelineSucceeded` gate, dbMessageType/alertMetadata/
    // enrichedMessage are all already truthy at this point, so
    // session-linking would run anyway: a session would be minted and
    // `session_messages_updated` would be broadcast for a message that was
    // never delivered via `acars_msg`. This is the regression this test
    // catches.
    expect(countSessions()).toBe(sessionCountBefore);
    expect(lastSessionEvent()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. G2 — tail identifier normalization must be dot-stripped for session
//    matching, since formatters/index.ts is inconsistent about doing so
// ---------------------------------------------------------------------------

describe("session linking — G2 tail normalization across decoder dot-stripping inconsistency", () => {
  it('matches a raw-ACARS message with a dotted tail (".N77WA") and a VDLM2 message with an already dot-stripped tail ("N77WA") to the SAME session when neither carries an icao_hex', async () => {
    const sessionCountBefore = countSessions();

    // Raw-ACARS formatter passes the dot through untouched (formatters/index.ts).
    await ingest("ACARS", {
      timestamp: Math.floor(Date.now() / 1000),
      station_id: "test-station",
      tail: ".N77WA",
      text: "RAW ACARS DOTTED TAIL",
      freq: 131.55,
      level: -18.2,
      error: 0,
    });

    expect(countSessions()).toBe(sessionCountBefore + 1);
    const firstEvent = lastSessionEvent();
    expect(firstEvent).toBeDefined();
    const sessionId = firstEvent?.sessionId as number;
    // The session-matching identifier is canonicalized (dot stripped) —
    // this is what both this ingest AND the next one match against.
    expect(getSession(sessionId)?.tail).toBe("N77WA");

    // VDLM2 formatter already strips the dot itself (formatters/index.ts)
    // before this code ever sees the value; no icao_hex or flight present,
    // so tail is the ONLY probe that can match.
    await ingest("VDLM2", {
      vdl2: {
        t: { sec: Math.floor(Date.now() / 1000) },
        station: "vdl-station",
        avlc: {
          // Deliberately no `type: "Aircraft"` on src (no icao_hex
          // extracted) and no `flight` on acars (no callsign) — isolates
          // the match onto the tail probe alone.
          src: { addr: "9A9A9A" },
          acars: {
            msg_text: "VDLM2 DOT-STRIPPED TAIL",
            reg: "N77WA",
          },
        },
        freq: 136975000,
        sig_level: -18.2,
        hdr_bits_fixed: 0,
      },
    });

    // Still exactly one session row. Without dot-stripping the raw-ACARS
    // ingest's stored/matched tail would be ".N77WA" and this second probe
    // for "N77WA" would MISS, minting a second session for the same
    // physical aircraft — precisely the defect G2 fixes.
    expect(countSessions()).toBe(sessionCountBefore + 1);
    const secondEvent = lastSessionEvent();
    expect(secondEvent?.sessionId).toBe(sessionId);
  });
});

// ---------------------------------------------------------------------------
// 10. G3 — the session-linking transaction is genuinely atomic: a failure
//     in the UPDATE rolls back the session INSERT too
// ---------------------------------------------------------------------------

describe("session linking — G3 atomicity of the session-linking transaction", () => {
  it("rolls back the newly-created aircraft row when the messages.session_id UPDATE fails inside the same transaction", async () => {
    const sessionCountBefore = countSessions();

    const conn = getSqliteConnection();
    const originalPrepare = conn.prepare.bind(conn);
    const prepareSpy = vi
      .spyOn(conn, "prepare")
      .mockImplementation((sql: string): ReturnType<typeof conn.prepare> => {
        if (sql.includes("UPDATE messages SET session_id")) {
          throw new Error("simulated messages.session_id UPDATE failure");
        }
        return originalPrepare(sql);
      });

    await ingest("ACARS", makeRawAcars({ icao: "B1B1B1", flight: undefined }));

    prepareSpy.mockRestore();

    // Ingestion itself is unaffected — the acars_msg emit happens entirely
    // before the session-linking try/catch runs.
    const emitted = lastAcarsMsgEmit();
    expect(emitted).toBeDefined();

    // The aircraft row findOrCreateSession() created must have been rolled
    // back along with the failed UPDATE — proving the INSERT and the
    // UPDATE share one real database transaction on the connection
    // getSqliteConnection()/getDatabase() both wrap, not merely that the
    // INSERT happens to survive an unrelated failure elsewhere.
    expect(countSessions()).toBe(sessionCountBefore);

    const row = getMessageRowByIcao("B1B1B1");
    expect(row).toBeDefined();
    expect(row?.session_id).toBeNull();

    expect(lastSessionEvent()).toBeUndefined();
  });
});

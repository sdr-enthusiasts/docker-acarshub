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
 * session-service.ts — covers session matching, enrichment and expiry over
 * the `aircraft` table.
 *
 * Runs the REAL migration chain against a temp-file SQLite database (not a
 * hand-written CREATE TABLE), mirroring system-config.test.ts: `aircraft` is
 * declared with a real index (`ix_aircraft_active_hex`) that the two
 * structural regression tests below depend on, so a lookalike table would
 * validate the wrong thing.
 *
 * Each test seeds and cleans its own rows (via `afterEach`) so the suite is
 * order-independent despite sharing one on-disk database across the file.
 * All timestamps are explicit Unix-second integers passed to the service —
 * no fake timers anywhere.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mock the logger so tests can assert on warnings (callsign-reuse guard,
// identifier-conflict refusal) without polluting test output.
// ---------------------------------------------------------------------------
const loggerMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => loggerMocks,
}));

import {
  closeDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import {
  enrichSession,
  expireStaleSessions,
  findOrCreateSession,
  getActiveHexProbeSql,
  getExpirySweepSql,
  SESSION_TIMEOUT_SECONDS,
  type SessionType,
} from "../session-service.js";

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-session-service-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  getSqliteConnection().exec("DELETE FROM aircraft");
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface SeedOptions {
  icaoHex?: string | null;
  callsign?: string | null;
  tail?: string | null;
  firstSeen: number;
  lastSeen: number;
  isActive?: 0 | 1;
  sessionType?: SessionType;
  pairingMethod?: string | null;
}

/** Insert an aircraft row with full control over every column. */
function seedSession(opts: SeedOptions): number {
  const result = getSqliteConnection()
    .prepare(
      `INSERT INTO aircraft
         (icao_hex, callsign, tail, first_seen, last_seen, is_active, session_type, pairing_method, trace_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none')`,
    )
    .run(
      opts.icaoHex ?? null,
      opts.callsign ?? null,
      opts.tail ?? null,
      opts.firstSeen,
      opts.lastSeen,
      opts.isActive ?? 1,
      opts.sessionType ?? "adsb",
      opts.pairingMethod ?? null,
    );
  return Number(result.lastInsertRowid);
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

function readSession(id: number): AircraftRow {
  const row = getSqliteConnection()
    .prepare("SELECT * FROM aircraft WHERE id = ?")
    .get(id) as AircraftRow | undefined;
  if (!row) throw new Error(`No aircraft row with id ${id}`);
  return row;
}

function countAllRows(): number {
  const row = getSqliteConnection()
    .prepare("SELECT COUNT(*) AS c FROM aircraft")
    .get() as { c: number };
  return row.c;
}

const BASE_NOW = 1_700_000_000;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

describe("findOrCreateSession — matching", () => {
  it("matches an active session by icao_hex", () => {
    const existing = seedSession({
      icaoHex: "ABC123",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    const matched = findOrCreateSession(
      { icaoHex: "ABC123" },
      "adsb",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
    expect(countAllRows()).toBe(1);
  });

  it("matches by callsign when hex is absent from the contact", () => {
    const existing = seedSession({
      callsign: "UAL123",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      pairingMethod: "callsign",
    });

    const matched = findOrCreateSession(
      { callsign: "UAL123" },
      "acars_only",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
  });

  it("matches by tail when both hex and callsign are absent", () => {
    const existing = seedSession({
      tail: "N12345",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      pairingMethod: "tail",
    });

    const matched = findOrCreateSession(
      { tail: "N12345" },
      "acars_only",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
  });

  it("prioritises the hex probe over a callsign match on a DIFFERENT session", () => {
    const sessionA = seedSession({
      icaoHex: "AAA111",
      callsign: "ZZZ999", // deliberately not matching the incoming callsign
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });
    const sessionB = seedSession({
      callsign: "UAL456",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    // Contact carries a hex matching A AND a callsign matching B.
    const matched = findOrCreateSession(
      { icaoHex: "AAA111", callsign: "UAL456" },
      "adsb",
      BASE_NOW + 60,
    );

    expect(matched).toBe(sessionA);
    expect(matched).not.toBe(sessionB);
  });

  it("matches the same session on repeat hex contact, different callsign, and enriches the callsign onto it", () => {
    const existing = seedSession({
      icaoHex: "ABC123",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    const matched = findOrCreateSession(
      { icaoHex: "ABC123", callsign: "UAL789" },
      "adsb",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
    const row = readSession(existing);
    expect(row.callsign).toBe("UAL789");
    expect(countAllRows()).toBe(1); // no duplicate row created
  });

  it("does not match an INACTIVE session with the same hex — a fresh session is created instead", () => {
    const expired = seedSession({
      icaoHex: "DEAD01",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      isActive: 0,
    });

    const matched = findOrCreateSession(
      { icaoHex: "DEAD01" },
      "adsb",
      BASE_NOW + 60,
    );

    expect(matched).not.toBe(expired);
    expect(countAllRows()).toBe(2);
  });

  it("does not match an INACTIVE session with the same callsign — a fresh session is created instead", () => {
    const expired = seedSession({
      callsign: "DEADCS",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      isActive: 0,
    });

    const matched = findOrCreateSession(
      { callsign: "DEADCS" },
      "acars_only",
      BASE_NOW + 60,
    );

    expect(matched).not.toBe(expired);
    expect(countAllRows()).toBe(2);
  });

  it("does not match an INACTIVE session with the same tail — a fresh session is created instead", () => {
    const expired = seedSession({
      tail: "N-DEAD1",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      isActive: 0,
    });

    const matched = findOrCreateSession(
      { tail: "N-DEAD1" },
      "acars_only",
      BASE_NOW + 60,
    );

    expect(matched).not.toBe(expired);
    expect(countAllRows()).toBe(2);
  });

  it("creates a new session when nothing matches", () => {
    const id = findOrCreateSession({ icaoHex: "NEW001" }, "adsb", BASE_NOW);
    expect(typeof id).toBe("number");
    expect(countAllRows()).toBe(1);
    const row = readSession(id);
    expect(row.pairing_method).toBe("hex");
    expect(row.session_type).toBe("adsb");
    expect(row.first_seen).toBe(BASE_NOW);
    expect(row.last_seen).toBe(BASE_NOW);
    expect(row.is_active).toBe(1);
  });

  it("derives pairing_method 'acars_only' when a new session has no identifiers at all", () => {
    const id = findOrCreateSession({}, "acars_only", BASE_NOW);
    const row = readSession(id);
    expect(row.pairing_method).toBe("acars_only");
  });

  it("treats an empty-string icaoHex as absent — does not probe by hex, so it does not match a session whose icao_hex is also the empty string", () => {
    const existing = seedSession({
      icaoHex: "",
      callsign: "EMPTYHEX",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    const matched = findOrCreateSession(
      { icaoHex: "" },
      "acars_only",
      BASE_NOW + 60,
    );

    // If the empty string were probed with, `eq(icaoHex, "")` would match
    // `existing` (which also has icaoHex === ""). It must not: an
    // empty-string identifier is absent, so this creates a fresh session.
    expect(matched).not.toBe(existing);
    expect(countAllRows()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Timeout boundaries, per session_type
// ---------------------------------------------------------------------------

describe("findOrCreateSession — timeout boundaries", () => {
  it.each([
    ["adsb", SESSION_TIMEOUT_SECONDS.adsb] as const,
    ["hfdl", SESSION_TIMEOUT_SECONDS.hfdl] as const,
  ])(
    "for session_type=%s: a contact just inside the %d-second window extends the session",
    (sessionType, timeout) => {
      const existing = seedSession({
        icaoHex: "TIME01",
        firstSeen: BASE_NOW,
        lastSeen: BASE_NOW,
        sessionType: sessionType as SessionType,
      });

      const contactTime = BASE_NOW + timeout - 1;
      const matched = findOrCreateSession(
        { icaoHex: "TIME01" },
        sessionType as SessionType,
        contactTime,
      );

      expect(matched).toBe(existing);
      expect(readSession(existing).last_seen).toBe(contactTime);
      expect(countAllRows()).toBe(1);
    },
  );

  it.each([
    ["adsb", SESSION_TIMEOUT_SECONDS.adsb] as const,
    ["hfdl", SESSION_TIMEOUT_SECONDS.hfdl] as const,
  ])(
    "for session_type=%s: a contact at/after the %d-second window creates a NEW session",
    (sessionType, timeout) => {
      const existing = seedSession({
        icaoHex: "TIME02",
        firstSeen: BASE_NOW,
        lastSeen: BASE_NOW,
        sessionType: sessionType as SessionType,
      });

      const contactTime = BASE_NOW + timeout; // exactly at boundary: elapsed == timeout, not < timeout
      const matched = findOrCreateSession(
        { icaoHex: "TIME02" },
        sessionType as SessionType,
        contactTime,
      );

      expect(matched).not.toBe(existing);
      expect(countAllRows()).toBe(2);
      // The old session is untouched — Architecture Invariant 5: sessions
      // are immutable once created, a timed-out match never rewrites it.
      expect(readSession(existing).last_seen).toBe(BASE_NOW);
    },
  );
});

// ---------------------------------------------------------------------------
// session_type upgrade
// ---------------------------------------------------------------------------

describe("findOrCreateSession — session_type upgrade", () => {
  it("upgrades acars_only to adsb when an ADS-B contact matches by hex, and updates pairing_method", () => {
    const existing = seedSession({
      icaoHex: "UPG001",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "acars_only",
      pairingMethod: "acars_only",
    });

    const matched = findOrCreateSession(
      { icaoHex: "UPG001" },
      "adsb",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
    const row = readSession(existing);
    expect(row.session_type).toBe("adsb");
    expect(row.pairing_method).toBe("hex");
  });

  it("never downgrades session_type — an acars_only contact on an adsb session leaves it as adsb", () => {
    const existing = seedSession({
      icaoHex: "UPG002",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "adsb",
      pairingMethod: "hex",
    });

    const matched = findOrCreateSession(
      { icaoHex: "UPG002" },
      "acars_only",
      BASE_NOW + 60,
    );

    expect(matched).toBe(existing);
    const row = readSession(existing);
    expect(row.session_type).toBe("adsb");
    expect(row.pairing_method).toBe("hex");
  });
});

// ---------------------------------------------------------------------------
// Callsign reuse edge case
// ---------------------------------------------------------------------------

describe("findOrCreateSession — callsign reuse guard", () => {
  it("splits into a new session when callsign-matched, >80% elapsed, and no hex on the session — and logs a warning", () => {
    const timeout = SESSION_TIMEOUT_SECONDS.acars_only;
    const existing = seedSession({
      callsign: "UAL999",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "acars_only",
      pairingMethod: "callsign",
    });

    const contactTime = BASE_NOW + Math.floor(timeout * 0.9); // >80%, still <100%
    const matched = findOrCreateSession(
      { callsign: "UAL999" },
      "acars_only",
      contactTime,
    );

    expect(matched).not.toBe(existing);
    expect(countAllRows()).toBe(2);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("Callsign reuse guard"),
      expect.objectContaining({ previousSessionId: existing }),
    );
  });

  it("control case: the SAME elapsed fraction WITH a hex on the session extends rather than splits", () => {
    const timeout = SESSION_TIMEOUT_SECONDS.acars_only;
    const existing = seedSession({
      icaoHex: "HEX999",
      callsign: "UAL999",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "acars_only",
      pairingMethod: "hex",
    });

    const contactTime = BASE_NOW + Math.floor(timeout * 0.9);
    const matched = findOrCreateSession(
      { callsign: "UAL999" },
      "acars_only",
      contactTime,
    );

    expect(matched).toBe(existing);
    expect(countAllRows()).toBe(1);
    expect(readSession(existing).last_seen).toBe(contactTime);
  });

  it("does NOT trigger the guard at the EXACT 80% boundary (elapsed === 0.8 * timeout), even with no hex", () => {
    const timeout = SESSION_TIMEOUT_SECONDS.acars_only;
    const existing = seedSession({
      callsign: "UAL800",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "acars_only",
    });

    // The spec's guard is "> 80%", so exactly 80% must extend, not split.
    const contactTime = BASE_NOW + timeout * 0.8;
    const matched = findOrCreateSession(
      { callsign: "UAL800" },
      "acars_only",
      contactTime,
    );

    expect(matched).toBe(existing);
    expect(countAllRows()).toBe(1);
    expect(readSession(existing).last_seen).toBe(contactTime);
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it("does not trigger the guard when elapsed is under 80% of the timeout, even with no hex", () => {
    const timeout = SESSION_TIMEOUT_SECONDS.acars_only;
    const existing = seedSession({
      callsign: "UAL111",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "acars_only",
    });

    const contactTime = BASE_NOW + Math.floor(timeout * 0.5);
    const matched = findOrCreateSession(
      { callsign: "UAL111" },
      "acars_only",
      contactTime,
    );

    expect(matched).toBe(existing);
    expect(countAllRows()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// enrichSession
// ---------------------------------------------------------------------------

describe("enrichSession", () => {
  it("adds a hex to a callsign-matched session without creating a duplicate row", () => {
    const id = seedSession({
      callsign: "UAL222",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    enrichSession(id, { icaoHex: "NEWHEX" });

    const row = readSession(id);
    expect(row.icao_hex).toBe("NEWHEX");
    expect(countAllRows()).toBe(1);
  });

  it("refuses to overwrite an existing identifier with a conflicting value and logs a warning", () => {
    const id = seedSession({
      icaoHex: "ORIGINAL",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    enrichSession(id, { icaoHex: "CONFLICT" });

    expect(readSession(id).icao_hex).toBe("ORIGINAL");
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("Refusing to overwrite"),
      expect.objectContaining({
        sessionId: id,
        field: "icaoHex",
        current: "ORIGINAL",
        incoming: "CONFLICT",
      }),
    );
  });

  it("is a no-op (and does not warn) when the incoming value matches the existing one", () => {
    const id = seedSession({
      icaoHex: "SAME01",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    enrichSession(id, { icaoHex: "SAME01" });

    expect(readSession(id).icao_hex).toBe("SAME01");
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it("logs a warning and does nothing for an unknown session id", () => {
    expect(() => enrichSession(999_999, { icaoHex: "X" })).not.toThrow();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown session id"),
      expect.objectContaining({ sessionId: 999_999 }),
    );
  });

  it("treats an empty-string identifier as absent — it is not written onto a session even though the field is currently unset", () => {
    const id = seedSession({
      callsign: "UAL333",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    enrichSession(id, { icaoHex: "", tail: "" });

    const row = readSession(id);
    expect(row.icao_hex).toBeNull();
    expect(row.tail).toBeNull();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

describe("expireStaleSessions", () => {
  it("marks only sessions past their own type's timeout inactive, and never deletes rows", () => {
    const stale = seedSession({
      icaoHex: "STALE1",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "adsb",
    });
    const fresh = seedSession({
      icaoHex: "FRESH1",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "adsb",
    });

    const now = BASE_NOW + SESSION_TIMEOUT_SECONDS.adsb + 1;
    const staleQueryTime = now; // only 'stale' should be past its timeout at this now
    // Give 'fresh' a last_seen close to now so it survives.
    getSqliteConnection()
      .prepare("UPDATE aircraft SET last_seen = ? WHERE id = ?")
      .run(now - 10, fresh);

    const expiredCount = expireStaleSessions(staleQueryTime);

    expect(expiredCount).toBe(1);
    expect(readSession(stale).is_active).toBe(0);
    expect(readSession(fresh).is_active).toBe(1);
    expect(countAllRows()).toBe(2); // nothing deleted
  });

  it("respects per-type thresholds within a SINGLE call — an hfdl session stale by the same wall-clock amount as an adsb session is not expired", () => {
    const now = BASE_NOW + SESSION_TIMEOUT_SECONDS.adsb + 30 * 60; // 30 min past adsb's timeout

    const adsbSession = seedSession({
      icaoHex: "MIX-ADSB",
      firstSeen: BASE_NOW,
      lastSeen: now - SESSION_TIMEOUT_SECONDS.adsb - 30 * 60,
      sessionType: "adsb",
    });
    const hfdlSession = seedSession({
      icaoHex: "MIX-HFDL",
      firstSeen: BASE_NOW,
      lastSeen: now - 30 * 60, // 30 min stale relative to hfdl's own 6h timeout — nowhere near it
      sessionType: "hfdl",
    });

    const expiredCount = expireStaleSessions(now);

    expect(expiredCount).toBe(1);
    expect(readSession(adsbSession).is_active).toBe(0);
    expect(readSession(hfdlSession).is_active).toBe(1);
  });

  it("does NOT expire a session at the EXACT boundary (elapsed === timeout) — consistent with the matcher's elapsed < timeout", () => {
    const timeout = SESSION_TIMEOUT_SECONDS.adsb;
    const exact = seedSession({
      icaoHex: "EXACT01",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "adsb",
    });

    // now - last_seen === timeout exactly: elapsed is not < timeout, but the
    // sweep's `last_seen < (now - timeout)` predicate must also not fire here.
    const now = BASE_NOW + timeout;
    const expiredCount = expireStaleSessions(now);

    expect(expiredCount).toBe(0);
    expect(readSession(exact).is_active).toBe(1);
  });

  it("leaves an already-inactive session inactive and does not count it as newly expired", () => {
    const alreadyInactive = seedSession({
      icaoHex: "OLD001",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
      sessionType: "adsb",
      isActive: 0,
    });

    const expiredCount = expireStaleSessions(
      BASE_NOW + SESSION_TIMEOUT_SECONDS.adsb + 1,
    );

    expect(expiredCount).toBe(0);
    expect(readSession(alreadyInactive).is_active).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AUTOINCREMENT / id stability (Architecture Invariant 5)
// ---------------------------------------------------------------------------

describe("session id stability", () => {
  it("gives new sessions new, distinct ids", () => {
    const a = findOrCreateSession({ icaoHex: "IDA" }, "adsb", BASE_NOW);
    const b = findOrCreateSession({ icaoHex: "IDB" }, "adsb", BASE_NOW);
    expect(a).not.toBe(b);
  });

  it("never reuses an id after the row backing it is deleted (AUTOINCREMENT)", () => {
    const first = findOrCreateSession({ icaoHex: "GONE" }, "adsb", BASE_NOW);
    getSqliteConnection()
      .prepare("DELETE FROM aircraft WHERE id = ?")
      .run(first);

    const second = findOrCreateSession(
      { icaoHex: "REPLACEMENT" },
      "adsb",
      BASE_NOW,
    );

    expect(second).toBeGreaterThan(first);
  });
});

// ===========================================================================
// Structural regression tests — guard the two measured rules directly.
// ===========================================================================

describe("Rule 1 guard — hex probe must use the two-column index seek", () => {
  it("EXPLAIN QUERY PLAN shows ix_aircraft_active_hex selected on BOTH columns", () => {
    const { sql, params } = getActiveHexProbeSql("PLANTEST");
    const connection: Database.Database = getSqliteConnection();

    const plan = connection
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params) as Array<{ detail: string }>;

    const planText = plan.map((row) => row.detail).join(" | ");

    expect(planText).toContain("ix_aircraft_active_hex");
    // The full two-column seek, not merely a scan restricted to is_active.
    expect(planText).toMatch(/is_active\s*=\s*\?\s*AND\s*icao_hex\s*=\s*\?/);
  });

  it("findOrCreateSession() actually ISSUES the two-column hex seek at runtime, and never an OR across icao_hex/callsign/tail — this catches an inlined probe bypassing getActiveHexProbeSql()'s shared helper", () => {
    const existing = seedSession({
      icaoHex: "RUNTIME1",
      firstSeen: BASE_NOW,
      lastSeen: BASE_NOW,
    });

    const connection = getSqliteConnection();
    const prepareSpy = vi.spyOn(connection, "prepare");

    const matched = findOrCreateSession(
      { icaoHex: "RUNTIME1" },
      "adsb",
      BASE_NOW + 60,
    );

    const selectCalls = prepareSpy.mock.calls
      .map(([statementSql]) => statementSql as string)
      .filter(
        (sql) =>
          /^select\b/i.test(sql.trim()) && /from\s+"aircraft"/i.test(sql),
      );

    prepareSpy.mockRestore();

    expect(matched).toBe(existing);
    // Exactly the hex probe must have been issued — no fall-through to
    // callsign/tail once hex matched.
    expect(selectCalls).toHaveLength(1);

    // The statement genuinely executed must restrict on BOTH columns — the
    // full two-column index seek, not a leading-column-only scan.
    expect(selectCalls[0]).toMatch(
      /"is_active"\s*=\s*\?\s+and\s+"aircraft"\."icao_hex"\s*=\s*\?/i,
    );

    // No SELECT issued during matching may combine the three identifier
    // columns with OR — that is exactly the forbidden form (Rule 1). This
    // is the assertion an inline `probeActiveByHex()` rewrite (bypassing
    // the shared `activeByHexQuery()` helper) would violate.
    for (const sql of selectCalls) {
      expect(sql).not.toMatch(/\bor\b/i);
    }
  });
});

describe("Rule 2 guard — expiry sweep is exactly one UPDATE with one CASE", () => {
  it("the sweep's SQL text contains exactly one UPDATE and one CASE", () => {
    const sql = getExpirySweepSql();

    const updateCount = (sql.match(/\bUPDATE\b/gi) ?? []).length;
    const caseCount = (sql.match(/\bCASE\b/gi) ?? []).length;

    expect(updateCount).toBe(1);
    expect(caseCount).toBe(1);
  });

  it("issues exactly ONE prepared UPDATE statement regardless of how many session types are present", () => {
    const now = BASE_NOW + SESSION_TIMEOUT_SECONDS.adsc + 1;

    // Seed one stale session of every session_type so a per-type
    // implementation would have to issue (at least) five statements.
    const types: SessionType[] = [
      "adsb",
      "vdlm2",
      "hfdl",
      "adsc",
      "acars_only",
    ];
    for (const sessionType of types) {
      seedSession({
        icaoHex: `SWEEP-${sessionType}`,
        firstSeen: BASE_NOW,
        lastSeen: BASE_NOW,
        sessionType,
      });
    }

    const connection = getSqliteConnection();
    const prepareSpy = vi.spyOn(connection, "prepare");

    expireStaleSessions(now);

    const updateCalls = prepareSpy.mock.calls.filter(([statementSql]) =>
      /\bUPDATE\s+aircraft\b/i.test(statementSql as string),
    );

    expect(updateCalls).toHaveLength(1);

    prepareSpy.mockRestore();
  });
});

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
 * Session Service
 *
 * Flight-session matching, enrichment and expiry over the `aircraft` table
 * (created by migration16.ts, backed by the `aircraft` Drizzle table in
 * schema.ts). This is the v4.3 Phase 5 core engine — see
 * agent-docs/V4.3.md "Session Lifecycle" for the full derivation of every
 * rule enforced here. Scheduler wiring and ingest wiring are Phase 6.
 *
 * Two rules in this file are measured, counter-intuitive, and must not be
 * "simplified" by a future refactor:
 *
 * 1. `findOrCreateSession()` issues three SEPARATE probes (hex, then
 *    callsign, then tail), never a three-way `OR`. With the `OR` form the
 *    planner can only use `ix_aircraft_active_hex`'s leading column and
 *    degrades to an index scan of the whole active set — 1.4249 ms vs
 *    0.0080 ms at 91,250 rows (178x). See `activeByHexQuery()` below.
 * 2. `expireStaleSessions()` issues ONE `UPDATE ... CASE session_type ...`
 *    statement, never one statement per session_type. The per-type form is
 *    individually sargable but each of five statements re-traverses the
 *    active set; the single CASE traverses it once. 1.43 ms vs 7.24 ms at
 *    91,250 rows. See `EXPIRE_SWEEP_SQL` below.
 *
 * Why module functions instead of the singleton factory pattern used
 * elsewhere in this codebase (Architecture Invariant 12)? Same reasoning as
 * `system-config.ts`: this service holds no state of its own. Every call
 * obtains the database handle fresh via `getDatabase()` / `getSqliteConnection()`.
 */

import { and, eq } from "drizzle-orm";
import { getDatabase, getSqliteConnection } from "../db/client.js";
import { aircraft } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("services:session-service");

// ============================================================================
// Types
// ============================================================================

/**
 * `session_type` values, in the priority order that governs both timeout
 * lookup (`SESSION_TIMEOUT_SECONDS`) and upgrade precedence
 * (`SESSION_TYPE_PRIORITY`): `adsb` is the most authoritative source, then
 * `vdlm2`, `hfdl`, `adsc`, and `acars_only` last.
 */
export type SessionType = "adsb" | "vdlm2" | "hfdl" | "adsc" | "acars_only";

/**
 * How a session was first established. Recorded at creation time and left
 * untouched by ordinary enrichment; it is deliberately updated when
 * `session_type` is upgraded (see agent-docs/V4.3.md "Session Types and
 * Timeout Thresholds") so it always reflects the most authoritative pairing
 * the session has seen.
 */
export type PairingMethod = "hex" | "callsign" | "tail" | "acars_only";

/**
 * Identifiers carried by a single inbound contact (a message or an ADS-B
 * position). Each is independently optional — a VDL-M2 message may carry a
 * hex and no tail, an ACARS message may carry only a tail, etc.
 */
export interface ContactIdentifiers {
  icaoHex?: string | null;
  callsign?: string | null;
  tail?: string | null;
}

/** The `aircraft` row shape, as Drizzle infers it from schema.ts. */
type AircraftRow = typeof aircraft.$inferSelect;

/** The Drizzle database handle, as returned by `getDatabase()`. */
type Db = ReturnType<typeof getDatabase>;

// ============================================================================
// Session timeout thresholds — the single source of truth
// ============================================================================

/**
 * Timeout (seconds) after which a session with no further contact is
 * considered ended. This is the single source of truth shared by
 * `findOrCreateSession()` (the matcher) and `EXPIRE_SWEEP_SQL` (the sweep,
 * derived from this table below) — the two must never be allowed to drift,
 * which is why the SQL is built from this object rather than hand-copied.
 *
 * See agent-docs/V4.3.md "Session Types and Timeout Thresholds" for the
 * rationale behind each value.
 */
export const SESSION_TIMEOUT_SECONDS: Readonly<Record<SessionType, number>> = {
  adsb: 1200, // 20 minutes — local Mode S; aircraft lands/leaves range quickly
  vdlm2: 2700, // 45 minutes — slightly longer range; taxi/gate messages common
  hfdl: 21600, // 6 hours — oceanic; multi-hour gaps between reports normal
  adsc: 43200, // 12 hours — polar/oceanic; very long gaps by design
  acars_only: 5400, // 90 minutes — no position data; conservative to avoid false splits
};

/**
 * `session_type` values in upgrade-precedence order, most authoritative
 * first. A session's `session_type` is upgraded whenever an incoming
 * contact's source type has a LOWER index here than the session's current
 * type; it is never downgraded (see agent-docs/V4.3.md "Session Types and
 * Timeout Thresholds").
 */
const SESSION_TYPE_PRIORITY: readonly SessionType[] = [
  "adsb",
  "vdlm2",
  "hfdl",
  "adsc",
  "acars_only",
];

function sessionTypePriorityIndex(type: SessionType): number {
  return SESSION_TYPE_PRIORITY.indexOf(type);
}

function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPE_PRIORITY as readonly string[]).includes(value);
}

/**
 * Read `row.sessionType` back as a typed `SessionType`.
 *
 * The `aircraft.session_type` column is declared `TEXT NOT NULL`
 * (migration16.ts), not a SQLite `CHECK`-enforced enum, so a row with a
 * value outside the closed union is a data-integrity bug rather than
 * something the type system can rule out. Defaulting to `acars_only` (the
 * longest-but-one, most conservative timeout) is the safest failure mode:
 * it under-expires rather than over-expires an unrecognised row.
 */
function asSessionType(value: string): SessionType {
  if (isSessionType(value)) {
    return value;
  }
  logger.warn(
    "Unrecognized session_type on aircraft row; treating as acars_only for timeout purposes",
    {
      value,
    },
  );
  return "acars_only";
}

// ============================================================================
// Rule 2 — expiry sweep: ONE statement, ONE CASE, derived from the table above
// ============================================================================

/**
 * The expiry sweep, built from `SESSION_TIMEOUT_SECONDS` so the SQL and the
 * TS table can never drift apart. See the module doc comment (Rule 2) for
 * why this must stay a single statement with a single `CASE` rather than
 * one `UPDATE` per `session_type` — measured 1.43 ms vs 7.24 ms at 91,250
 * rows, in the direction opposite the sargability intuition.
 *
 * `acars_only` has no `WHEN` of its own; it is the `ELSE` fallback, both
 * because it is genuinely the default `session_type` (migration16.ts) and
 * so a future sixth session_type added without a matching WHEN degrades to
 * the most conservative timeout rather than to a NULL comparison that would
 * make the row unexpirable.
 */
const EXPIRE_SWEEP_SQL = (() => {
  const whenClauses = (["adsb", "vdlm2", "hfdl", "adsc"] as const)
    .map((type) => `WHEN '${type}' THEN ${SESSION_TIMEOUT_SECONDS[type]}`)
    .join(" ");

  return `
    UPDATE aircraft SET is_active = 0
    WHERE is_active = 1
      AND last_seen < (? - CASE session_type
            ${whenClauses}
            ELSE ${SESSION_TIMEOUT_SECONDS.acars_only} END)
  `;
})();

/**
 * Mark every session whose type-specific timeout has elapsed as inactive.
 *
 * Never deletes a row — inactive sessions are retained for historical
 * queries (see agent-docs/V4.3.md "Session Expiry"; pruning is Phase 6's
 * job, via the existing `pruneDatabase()` schedule, not this function).
 *
 * @param now Unix seconds to treat as "now". Defaults to the wall clock so
 *            production callers need not pass anything; tests pass an
 *            explicit value instead of using fake timers.
 * @returns The number of sessions transitioned from active to inactive.
 */
export function expireStaleSessions(
  now: number = Math.floor(Date.now() / 1000),
): number {
  const connection = getSqliteConnection();
  const result = connection.prepare(EXPIRE_SWEEP_SQL).run(now);

  logger.debug("Expiry sweep completed", {
    expiredCount: result.changes,
    now,
  });

  return result.changes;
}

/**
 * @internal Exposed only so the Rule 2 regression test can assert the
 * sweep's SQL text contains exactly one `UPDATE` and one `CASE` — i.e. that
 * it was actually built as a single statement, not reconstructed by the
 * test from scratch (which could pass even after a regression to five
 * per-type statements).
 */
export function getExpirySweepSql(): string {
  return EXPIRE_SWEEP_SQL;
}

// ============================================================================
// Rule 1 — priority-ordered probes, never a three-way OR
// ============================================================================

/**
 * The hex probe, exactly as issued by `findOrCreateSession()`.
 *
 * This is a plain function (not inlined) specifically so
 * `getActiveHexProbeSql()` below can expose the *exact* statement under
 * test rather than a hand-reconstructed lookalike — see the module doc
 * comment (Rule 1).
 */
function activeByHexQuery(db: Db, hex: string) {
  return db
    .select()
    .from(aircraft)
    .where(and(eq(aircraft.isActive, 1), eq(aircraft.icaoHex, hex)));
}

function activeByCallsignQuery(db: Db, callsign: string) {
  return db
    .select()
    .from(aircraft)
    .where(and(eq(aircraft.isActive, 1), eq(aircraft.callsign, callsign)));
}

function activeByTailQuery(db: Db, tail: string) {
  return db
    .select()
    .from(aircraft)
    .where(and(eq(aircraft.isActive, 1), eq(aircraft.tail, tail)));
}

function probeActiveByHex(db: Db, hex: string): AircraftRow | undefined {
  return activeByHexQuery(db, hex).get();
}

function probeActiveByCallsign(
  db: Db,
  callsign: string,
): AircraftRow | undefined {
  return activeByCallsignQuery(db, callsign).get();
}

function probeActiveByTail(db: Db, tail: string): AircraftRow | undefined {
  return activeByTailQuery(db, tail).get();
}

/**
 * @internal Exposed only so the Rule 1 regression test
 * (session-service.test.ts) can capture `EXPLAIN QUERY PLAN` for the exact
 * hex-probe statement the service issues, via Drizzle's `.toSQL()` — the
 * same idiom used in `station-ids.ts`. Sharing `activeByHexQuery()` with
 * `probeActiveByHex()` above guarantees the plan under test is the plan
 * actually used at runtime, not a hand-reconstructed lookalike that a
 * regression to the forbidden `OR` form could leave passing.
 */
export function getActiveHexProbeSql(hex: string): {
  sql: string;
  params: unknown[];
} {
  return activeByHexQuery(getDatabase(), hex).toSQL();
}

// ============================================================================
// Identifier enrichment
// ============================================================================

type IdentifierField = "icaoHex" | "callsign" | "tail";

/**
 * Decide what (if anything) to write for a single identifier field.
 *
 * - No incoming value -> nothing to do.
 * - Field currently unset (`null`/`""`) -> adopt the incoming value. This is
 *   the canonical enrichment case: a callsign-matched session later gains a
 *   hex.
 * - Field already set to the SAME value -> nothing to do (not an error).
 * - Field already set to a DIFFERENT value -> refuse to overwrite and log a
 *   warning (see agent-docs/V4.3.md "Session Matching Algorithm", the
 *   identifier-enrichment paragraph). A silent overwrite here would mask
 *   a mis-match — e.g. two aircraft sharing a stale callsign.
 */
function mergeIdentifierField(
  sessionId: number,
  field: IdentifierField,
  current: string | null,
  incoming: string | null | undefined,
): string | undefined {
  if (!incoming) {
    return undefined;
  }
  if (!current) {
    return incoming;
  }
  if (current === incoming) {
    return undefined;
  }

  logger.warn(
    "Refusing to overwrite an existing session identifier with a different value",
    { sessionId, field, current, incoming },
  );
  return undefined;
}

interface IdentifierUpdate {
  icaoHex?: string;
  callsign?: string;
  tail?: string;
}

function buildIdentifierUpdate(
  row: AircraftRow,
  newIdentifiers: ContactIdentifiers,
): IdentifierUpdate {
  const update: IdentifierUpdate = {};

  const icaoHex = mergeIdentifierField(
    row.id,
    "icaoHex",
    row.icaoHex,
    newIdentifiers.icaoHex,
  );
  if (icaoHex !== undefined) update.icaoHex = icaoHex;

  const callsign = mergeIdentifierField(
    row.id,
    "callsign",
    row.callsign,
    newIdentifiers.callsign,
  );
  if (callsign !== undefined) update.callsign = callsign;

  const tail = mergeIdentifierField(
    row.id,
    "tail",
    row.tail,
    newIdentifiers.tail,
  );
  if (tail !== undefined) update.tail = tail;

  return update;
}

/**
 * Accumulate newly-supplied identifiers onto an existing session.
 *
 * Identifiers only ever accumulate over a session's life (Functional
 * requirement 4) — an already-set field is never silently overwritten with
 * a different value; see `mergeIdentifierField()`. `findOrCreateSession()`
 * calls this internally when it extends a matched session, but it is also
 * exported standalone for future callers (e.g. Phase 6's retroactive
 * pairing, which enriches a session from historical messages after the
 * fact).
 */
export function enrichSession(
  sessionId: number,
  newIdentifiers: ContactIdentifiers,
): void {
  const db = getDatabase();
  const row = db
    .select()
    .from(aircraft)
    .where(eq(aircraft.id, sessionId))
    .get();

  if (!row) {
    logger.warn("enrichSession called for an unknown session id", {
      sessionId,
    });
    return;
  }

  const update = buildIdentifierUpdate(row, newIdentifiers);
  if (Object.keys(update).length === 0) {
    return;
  }

  db.update(aircraft).set(update).where(eq(aircraft.id, sessionId)).run();

  logger.debug("Enriched session identifiers", { sessionId, update });
}

// ============================================================================
// Session creation
// ============================================================================

function derivePairingMethod(identifiers: ContactIdentifiers): PairingMethod {
  if (identifiers.icaoHex) return "hex";
  if (identifiers.callsign) return "callsign";
  if (identifiers.tail) return "tail";
  return "acars_only";
}

function createSession(
  db: Db,
  identifiers: ContactIdentifiers,
  sourceType: SessionType,
  now: number,
): number {
  const pairingMethod = derivePairingMethod(identifiers);

  const rows = db
    .insert(aircraft)
    .values({
      icaoHex: identifiers.icaoHex ?? null,
      callsign: identifiers.callsign ?? null,
      tail: identifiers.tail ?? null,
      firstSeen: now,
      lastSeen: now,
      isActive: 1,
      sessionType: sourceType,
      pairingMethod,
      traceState: "none",
    })
    .returning({ id: aircraft.id })
    .all();

  const sessionId = rows[0].id;

  logger.debug("Created new session", {
    sessionId,
    sourceType,
    pairingMethod,
  });

  return sessionId;
}

// ============================================================================
// Session matching
// ============================================================================

/**
 * Extend a matched, still-live session: bump `last_seen`, enrich any
 * newly-supplied identifiers, and upgrade `session_type` (never downgrade)
 * if the incoming contact's source is more authoritative than what the
 * session currently records.
 *
 * `pairing_method` is left untouched UNLESS the type upgrades, in which
 * case it is updated to reflect how THIS contact matched (Functional
 * requirement 3) — otherwise it keeps recording how the session was first
 * established (see agent-docs/V4.3.md "Session Matching Algorithm").
 */
function extendSession(
  db: Db,
  row: AircraftRow,
  identifiers: ContactIdentifiers,
  sourceType: SessionType,
  now: number,
  matchedVia: PairingMethod,
): number {
  const currentType = asSessionType(row.sessionType);
  const upgraded =
    sessionTypePriorityIndex(sourceType) <
    sessionTypePriorityIndex(currentType);

  const identifierUpdate = buildIdentifierUpdate(row, identifiers);

  const update: {
    lastSeen: number;
    sessionType?: SessionType;
    pairingMethod?: PairingMethod;
    icaoHex?: string;
    callsign?: string;
    tail?: string;
  } = {
    lastSeen: now,
    ...identifierUpdate,
  };

  if (upgraded) {
    update.sessionType = sourceType;
    update.pairingMethod = matchedVia;
    logger.info("Session type upgraded", {
      sessionId: row.id,
      from: currentType,
      to: sourceType,
      pairingMethod: matchedVia,
    });
  }

  db.update(aircraft).set(update).where(eq(aircraft.id, row.id)).run();

  return row.id;
}

/**
 * Given a matched active session, decide whether to extend it or split it
 * into a new session.
 *
 * Handles both the ordinary timeout check (see agent-docs/V4.3.md "Session
 * Matching Algorithm") and the callsign-reuse guard (see agent-docs/V4.3.md
 * "Callsign Reuse Edge Case"), which only applies to callsign matches: a
 * callsign-only session (no `icao_hex`) more than 80% through its own
 * timeout window is treated as a stale flight-number reuse rather than
 * extended, even though it has not yet formally timed out.
 */
function matchOrSplit(
  db: Db,
  row: AircraftRow,
  identifiers: ContactIdentifiers,
  sourceType: SessionType,
  now: number,
  matchedVia: "hex" | "callsign" | "tail",
): number {
  const timeout = SESSION_TIMEOUT_SECONDS[asSessionType(row.sessionType)];
  const elapsed = now - row.lastSeen;

  if (elapsed >= timeout) {
    return createSession(db, identifiers, sourceType, now);
  }

  if (matchedVia === "callsign") {
    const hasHex = !!row.icaoHex;
    const reuseThreshold = timeout * 0.8;

    if (!hasHex && elapsed > reuseThreshold) {
      logger.warn(
        "Callsign reuse guard triggered: treating contact as a new session rather than extending a stale callsign-only match",
        {
          previousSessionId: row.id,
          callsign: identifiers.callsign,
          elapsedSeconds: elapsed,
          timeoutSeconds: timeout,
        },
      );
      return createSession(db, identifiers, sourceType, now);
    }
  }

  return extendSession(db, row, identifiers, sourceType, now, matchedVia);
}

/**
 * Find the active session this contact belongs to, or create a new one.
 *
 * Probes active sessions in priority order — `icao_hex`, then `callsign`,
 * then `tail` — issuing each as a SEPARATE query (Rule 1; see the module
 * doc comment). A probe whose identifier is absent from `identifiers` is
 * skipped entirely rather than issued with `null`.
 *
 * @param identifiers The identifiers carried by this contact. Each is
 *                     independently optional.
 * @param sourceType  The session type this contact's source contributes
 *                     (e.g. `"adsb"` for an ADS-B position, `"acars_only"`
 *                     for an ACARS message with no position source).
 * @param now         Unix seconds to treat as "now". Defaults to the wall
 *                     clock; tests pass an explicit value instead of using
 *                     fake timers.
 * @returns The matched or newly-created session's `aircraft.id`.
 */
export function findOrCreateSession(
  identifiers: ContactIdentifiers,
  sourceType: SessionType,
  now: number = Math.floor(Date.now() / 1000),
): number {
  const db = getDatabase();

  if (identifiers.icaoHex) {
    const row = probeActiveByHex(db, identifiers.icaoHex);
    if (row) {
      return matchOrSplit(db, row, identifiers, sourceType, now, "hex");
    }
  }

  if (identifiers.callsign) {
    const row = probeActiveByCallsign(db, identifiers.callsign);
    if (row) {
      return matchOrSplit(db, row, identifiers, sourceType, now, "callsign");
    }
  }

  if (identifiers.tail) {
    const row = probeActiveByTail(db, identifiers.tail);
    if (row) {
      return matchOrSplit(db, row, identifiers, sourceType, now, "tail");
    }
  }

  return createSession(db, identifiers, sourceType, now);
}

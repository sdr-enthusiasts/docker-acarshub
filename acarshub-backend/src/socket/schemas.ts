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
 * Socket.IO Input Validation Schemas (SEC-03)
 *
 * Socket.IO is an untyped wire — a TypeScript interface on a `socket.on(...)`
 * handler is a documentation-only contract that the runtime cannot enforce.
 * A malicious or misbehaving client can send any JSON shape (or non-JSON,
 * or nothing at all) and the handler will receive it as `unknown`.  Without
 * runtime validation, the handler may:
 *
 *   - dereference fields that don't exist (TypeError → 500-equivalent),
 *   - pass attacker-controlled strings to `databaseSearch()` (parameterised,
 *     so SQLi is mitigated, but pathological inputs can still DoS the DB),
 *   - use unsanitised numbers as offsets/page sizes (resource exhaustion).
 *
 * Each schema below mirrors the corresponding `SocketEmitEvents` interface in
 * `@acarshub/types` and is `.strict()` so unknown keys cause rejection — this
 * catches client/server protocol drift early instead of silently dropping
 * fields.
 *
 * Schemas are exported individually so `handlers.test.ts` can import them and
 * exercise both the happy and rejection paths.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/**
 * Bounded text field used for search-term entries.  ACARS messages and their
 * metadata fields are short by protocol (ICAO 6 hex chars, flight 7 chars,
 * tail 7 chars, station_id ≤ 8 chars).  Even the free-text `msg_text` field
 * has no business being longer than a few hundred characters; cap at 1024
 * to defang pathological inputs without rejecting realistic queries.
 */
const SearchString = z.string().max(1024);

/** Non-negative finite integer (page indices, pagination cursors). */
const NonNegativeInt = z.number().int().min(0).finite();

/**
 * Unix timestamp in seconds.  Bounded above at 2100-01-01 to reject obvious
 * garbage (epoch milliseconds, attacker probes) without being too tight to
 * cause Y2.1K issues.  Floor of zero is the Unix epoch itself.
 *
 * Bounds chosen to match the previous in-handler SEC-01 validator that this
 * schema replaces (acarshub-backend/src/socket/handlers.ts pre-SEC-03).
 */
const UnixSeconds = z.number().int().min(0).max(4_102_444_800).finite();

/**
 * Bucket size for RRD downsampling, in seconds.  Lower bound of 60s prevents
 * the warm-tier cache from being defeated; upper bound of 86_400s (one day)
 * prevents zero-fill arrays from blowing process memory on long ranges.
 *
 * Bounds chosen to match the previous in-handler SEC-01 validator.
 */
const DownsampleSeconds = z.number().int().min(60).max(86_400);

// ---------------------------------------------------------------------------
// Per-event schemas — keys must match SocketEmitEvents exactly
// ---------------------------------------------------------------------------

/**
 * Mirrors the CurrentSearch interface (acarshub-types/src/search.ts:27).
 *
 * The TypeScript interface declares every field as required, but the runtime
 * handler treats every field as optional (it `|| undefined`s each one before
 * passing to `databaseSearch`).  The schema follows the runtime contract,
 * not the TS one: each field is optional and defaults to "" when absent.
 * This keeps the wire contract tolerant of older or partial clients while
 * still rejecting non-string values, which is the actual security concern.
 */
const CurrentSearchSchema = z
  .object({
    flight: SearchString.optional().default(""),
    depa: SearchString.optional().default(""),
    dsta: SearchString.optional().default(""),
    freq: SearchString.optional().default(""),
    label: SearchString.optional().default(""),
    msgno: SearchString.optional().default(""),
    tail: SearchString.optional().default(""),
    icao: SearchString.optional().default(""),
    msg_text: SearchString.optional().default(""),
    station_id: SearchString.optional().default(""),
    msg_type: SearchString.optional().default(""),
  })
  .strict();

export const QuerySearchSchema = z
  .object({
    search_term: CurrentSearchSchema,
    results_after: NonNegativeInt.optional(),
    show_all: z.boolean().optional(),
  })
  .strict();

export const UpdateAlertsSchema = z
  .object({
    terms: z.array(SearchString),
    ignore: z.array(SearchString),
  })
  .strict();

export const AlertTermQuerySchema = z
  .object({
    icao: SearchString,
    flight: SearchString,
    tail: SearchString,
  })
  .strict();

export const QueryAlertsByTermSchema = z
  .object({
    term: SearchString,
    page: NonNegativeInt.optional(),
  })
  .strict();

export const RRDTimeseriesSchema = z
  .object({
    time_period: SearchString.optional(),
    start: UnixSeconds.optional(),
    end: UnixSeconds.optional(),
    downsample: DownsampleSeconds.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Event-to-schema map (used by validatedHandler)
// ---------------------------------------------------------------------------

/**
 * Lookup table for the validatedHandler() helper.  Adding a new validated
 * event requires adding both an entry here and the matching `socket.on`
 * registration in handlers.ts.
 */
export const SocketSchemas = {
  query_search: QuerySearchSchema,
  update_alerts: UpdateAlertsSchema,
  alert_term_query: AlertTermQuerySchema,
  query_alerts_by_term: QueryAlertsByTermSchema,
  rrd_timeseries: RRDTimeseriesSchema,
} as const;

export type ValidatedEvent = keyof typeof SocketSchemas;

export type ValidatedPayload<E extends ValidatedEvent> = z.infer<
  (typeof SocketSchemas)[E]
>;

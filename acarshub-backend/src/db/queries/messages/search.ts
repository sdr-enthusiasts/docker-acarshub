// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// databaseSearch() and its FTS5 / LIKE-fallback implementation. Equivalent to
// the Python database_search() function.
// ----------------------------------------------------------------------------

import type { AnyColumn } from "drizzle-orm";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase, getSqliteConnection } from "../../client.js";
import { type Message, messages } from "../../schema.js";

const logger = createLogger("db:messages-search");

/**
 * Search parameters for database_search()
 */
export interface SearchParams {
  // Filters
  tail?: string; // Aircraft tail number
  flight?: string; // Flight number
  icao?: string; // Aircraft ICAO hex
  depa?: string; // Departure airport ICAO
  dsta?: string; // Destination airport ICAO
  label?: string; // ACARS label
  msgno?: string; // Message number
  text?: string; // Full-text search in message text (maps to msg_text in FTS)
  freq?: string; // Frequency
  messageType?: string; // ACARS, VDLM2, HFDL, etc.
  stationId?: string; // Ground station ID

  // Time range
  startTime?: number; // Unix timestamp (inclusive)
  endTime?: number; // Unix timestamp (inclusive)

  // Pagination
  limit?: number; // Max results (default: 100)
  offset?: number; // Skip N results (default: 0)

  // Sorting
  sortBy?: "time" | "tail" | "flight" | "label"; // Sort column
  sortOrder?: "asc" | "desc"; // Sort direction (default: desc)
}

/**
 * Search result with total count for pagination
 */
export interface SearchResult {
  messages: Message[];
  totalCount: number;
}

/**
 * Sanitize user input for FTS5 MATCH queries
 *
 * FTS5 has special characters that need escaping:
 * - Double quotes (") for phrase search
 * - Asterisk (*) for prefix matching
 * - Boolean operators (AND, OR, NOT)
 *
 * @param query User input string to sanitize
 * @returns Sanitized string safe for FTS5 MATCH
 */
function sanitizeFtsQuery(query: string): string {
  // Escape double quotes by doubling them (FTS5 convention)
  let sanitized = query.replace(/"/g, '""');

  // Remove control characters that could break FTS5 syntax
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization of control chars
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, "");

  return sanitized;
}

/**
 * Build FTS5 MATCH query string from search parameters
 *
 * Maps frontend field names to FTS5 column names and builds
 * a safe MATCH string with proper escaping.
 *
 * @param params Search parameters
 * @returns FTS5 MATCH string or null if no FTS-compatible terms
 */
function buildFtsMatchString(params: SearchParams): string | null {
  const matchParts: string[] = [];

  // Map frontend field names to FTS5 column names
  const fieldMappings: Record<string, string> = {
    flight: "flight",
    tail: "tail",
    icao: "icao",
    depa: "depa",
    dsta: "dsta",
    label: "label",
    freq: "freq",
    text: "msg_text", // Frontend uses 'text', FTS uses 'msg_text'
  };

  for (const [frontendField, ftsField] of Object.entries(fieldMappings)) {
    const value = params[frontendField as keyof SearchParams];

    if (value && typeof value === "string" && value.trim() !== "") {
      const sanitizedValue = sanitizeFtsQuery(value.trim().toUpperCase());
      // Use prefix matching with * for flexibility
      matchParts.push(`${ftsField}:"${sanitizedValue}"*`);
    }
  }

  if (matchParts.length === 0) {
    return null;
  }

  // Join with AND for multi-field search
  return matchParts.join(" AND ");
}

/**
 * Check if search should use FTS5 or fall back to LIKE queries
 *
 * FTS5 only supports prefix matching, so substring searches for
 * station_id and icao (when user expects substring match) must use LIKE.
 *
 * Python parity: Matches Python logic where station_id or icao searches
 * force non-FTS path for substring matching capability.
 *
 * @param params Search parameters
 * @returns true if should use FTS5, false if must use LIKE
 */
function shouldUseFts(params: SearchParams): boolean {
  // If searching by station_id, must use LIKE (FTS5 doesn't have this indexed)
  if (params.stationId && params.stationId.trim() !== "") {
    logger.debug("Using LIKE search: station_id specified");
    return false;
  }

  // For ICAO searches, Python uses LIKE for substring matching
  // Users expect "BF3" to find "ABF308" (substring anywhere in ICAO)
  // FTS5 only supports prefix matching, so we must use LIKE for ICAO
  if (params.icao && params.icao.trim() !== "") {
    logger.debug("Using LIKE search: icao specified (substring matching)");
    return false;
  }

  return true;
}

/**
 * Search messages with filters and pagination using FTS5 or LIKE fallback
 *
 * Equivalent to Python database_search() function.
 *
 * This function uses two different search strategies:
 * 1. FTS5 search: Fast prefix matching for most fields (10-100x faster)
 * 2. Standard LIKE: Substring matching for station_id (slower but more flexible)
 *
 * Performance notes:
 * - FTS5 search is 10-100x faster but only supports prefix matching
 * - station_id searches use LIKE '%value%' which cannot use indexes (slow)
 * - For large databases, LIKE searches may take several seconds
 *
 * @param params Search parameters
 * @returns Search result with messages and total count
 */
export function databaseSearch(params: SearchParams): SearchResult {
  // Decide whether to use FTS5 or LIKE-based search
  const useFts = shouldUseFts(params);

  if (useFts) {
    // Try FTS5 search first
    const ftsResult = searchWithFts(params);
    if (ftsResult !== null) {
      // Guard against FTS index / messages table mismatch.
      //
      // The FTS COUNT(*) query reads the inverted index directly and can return
      // N > 0 while the JOIN back to the messages table returns 0 rows.  This
      // happens when the FTS index is stale — e.g. rows deleted without the
      // delete trigger firing, or an index rebuilt before a UID migration
      // completed.  Returning { messages: [], totalCount: 6 } to the frontend
      // produces exactly the "Found 6 results but nothing displayed" symptom.
      //
      // When the mismatch is detected (COUNT says there are results on this
      // page but the JOIN returned nothing) we fall through to LIKE so the
      // caller always gets a consistent result set.
      const offset = params.offset ?? 0;
      const isWithinBounds = offset < ftsResult.totalCount;
      if (ftsResult.totalCount > 0 && ftsResult.messages.length === 0 && isWithinBounds) {
        logger.warn(
          "FTS count/messages mismatch detected (stale index?), falling back to LIKE search",
          {
            ftsCount: ftsResult.totalCount,
            offset,
            limit: params.limit,
          },
        );
        // Fall through to LIKE below
      } else {
        logger.debug("Using FTS5 search", {
          matchCount: ftsResult.totalCount,
          limit: params.limit,
        });
        return ftsResult;
      }
    } else {
      // null means no FTS-compatible terms were present (e.g. only stationId/icao
      // fields which are intentionally routed to LIKE for substring matching).
      // An actual zero-result FTS search returns a SearchResult, not null.
      logger.debug("No FTS-compatible terms in params, falling back to LIKE");
    }
  }

  // Fall back to LIKE-based search (ORM query)
  logger.debug("Using LIKE-based search");
  return searchWithLike(params);
}

/**
 * Map a raw better-sqlite3 row (SQLite column names) to the Drizzle Message type
 * (TypeScript camelCase property names).
 *
 * Drizzle ORM maps DB columns to TS properties automatically when using the ORM
 * query builder, but raw SQL results use the native SQLite column names.
 * This function bridges that gap so FTS5 raw-SQL results are type-compatible
 * with the rest of the codebase.
 *
 * Exported for `decoded-search.ts`, which runs its own raw-SQL joins against
 * `messages` (via `decoded_messages`/`decoder_variant`) for the same reason
 * FTS5 does here — no Drizzle support for the query shape — and needs the
 * identical column mapping rather than a second copy of it.
 */
export function mapRawRowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as number,
    messageType: row.message_type as string,
    time: row.msg_time as number,
    stationId: row.station_id as string,
    toaddr: row.toaddr as string,
    fromaddr: row.fromaddr as string,
    depa: row.depa as string,
    dsta: row.dsta as string,
    eta: row.eta as string,
    gtout: row.gtout as string,
    gtin: row.gtin as string,
    wloff: row.wloff as string,
    wlin: row.wlin as string,
    lat: row.lat as string,
    lon: row.lon as string,
    alt: row.alt as string,
    text: row.msg_text as string,
    tail: row.tail as string,
    flight: row.flight as string,
    icao: row.icao as string,
    freq: row.freq as string,
    ack: row.ack as string,
    mode: row.mode as string,
    label: row.label as string,
    blockId: row.block_id as string,
    msgno: row.msgno as string,
    isResponse: row.is_response as string,
    isOnground: row.is_onground as string,
    error: row.error as string,
    libacars: row.libacars as string,
    level: row.level as string,
    aircraftId: (row.aircraft_id as string | null) ?? null,
    sessionId: (row.session_id as number | null) ?? null,
  };
}

/**
 * Search using FTS5 full-text search (fast prefix matching)
 *
 * Uses the raw better-sqlite3 connection to execute FTS5 MATCH queries directly,
 * bypassing Drizzle ORM (which has no FTS5 MATCH support). The underlying
 * better-sqlite3 connection is always available via getSqliteConnection().
 *
 * Strategy:
 * 1. Build FTS5 MATCH string from params (e.g. `flight:"WN"* AND msg_text:"FAST"*`)
 * 2. COUNT matching rowids in messages_fts (fast — FTS5 inverted index)
 * 3. Fetch only the paginated slice of rowids from FTS (LIMIT inside the FTS subquery),
 *    then look up those N rows in messages and sort them.
 *
 * CRITICAL: The LIMIT must be inside the FTS subquery, not on the outer query.
 * With 1.3M matches, an unlimited FTS subquery forces SQLite to:
 *   - Materialise all 1.3M rowids
 *   - Join them against the messages B-tree (1.3M lookups)
 *   - Sort 1.3M rows by msg_time
 *   - Then take 50
 * That is O(N log N) and takes ~3s. With LIMIT inside the subquery, FTS returns
 * only 50 rowids, the outer query fetches 50 rows and sorts 50 rows — O(1).
 *
 * Ordering inside the FTS subquery uses rowid DESC (≈ insertion order ≈ time order).
 * The outer ORDER BY then re-sorts those 50 rows by the requested column, which is
 * trivially fast. This mirrors Python's build_fts_search_query() exactly.
 *
 * This is 10-100x faster than LIKE '%value%' on large tables because FTS5 uses
 * an inverted index rather than a full sequential scan.
 *
 * @param params Search parameters
 * @returns Search result or null if no FTS-compatible terms exist in params
 */
function searchWithFts(params: SearchParams): SearchResult | null {
  // Build FTS5 MATCH string — returns null when no searchable fields are present
  const matchString = buildFtsMatchString(params);

  if (!matchString) {
    return null;
  }

  const conn = getSqliteConnection();

  // COUNT is cheap: FTS5 scans its inverted index, never the messages table
  const countStmt = conn.prepare<[string], { count: number }>(
    "SELECT COUNT(*) as count FROM messages_fts WHERE messages_fts MATCH ?",
  );
  const countRow = countStmt.get(matchString);
  const totalCount = countRow?.count ?? 0;

  if (totalCount === 0) {
    return { messages: [], totalCount: 0 };
  }

  // Map sort column from TypeScript param names to actual SQLite column names
  const sortCol =
    params.sortBy === "tail"
      ? "tail"
      : params.sortBy === "flight"
        ? "flight"
        : params.sortBy === "label"
          ? "label"
          : "msg_time";

  const sortDir = params.sortOrder === "asc" ? "ASC" : "DESC";
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  // FTS rowid order is insert order, which correlates strongly with msg_time order.
  // By limiting *inside* the FTS subquery we avoid materialising the full result set:
  //   - FTS returns `limit` rowids ordered by rowid (≈ time)
  //   - Outer query fetches those N rows and re-sorts by the requested column
  //   - Total work: O(limit) instead of O(totalCount log totalCount)
  //
  // For ascending sorts we flip the FTS inner order so we get the oldest rowids
  // first, then the outer ORDER BY corrects the final ordering of those N rows.
  const ftsInnerOrder = params.sortOrder === "asc" ? "ASC" : "DESC";

  const resultsStmt = conn.prepare<
    [string, number, number],
    Record<string, unknown>
  >(
    `SELECT m.* FROM messages m
     WHERE m.id IN (
       SELECT rowid FROM messages_fts
       WHERE messages_fts MATCH ?
       ORDER BY rowid ${ftsInnerOrder}
       LIMIT ? OFFSET ?
     )
     ORDER BY m.${sortCol} ${sortDir}`,
  );

  const rawRows = resultsStmt.all(matchString, limit, offset);

  logger.debug("FTS5 search complete", {
    matchString,
    totalCount,
    returned: rawRows.length,
  });

  return {
    messages: rawRows.map(mapRawRowToMessage),
    totalCount,
  };
}

/**
 * Escape SQL LIKE wildcards in user input.
 *
 * SQLite's LIKE operator treats `%` as "any sequence" and `_` as "any single
 * character". Without escaping, a user search for `%` matches every row and a
 * search for `__` forces a slow full table scan — both denial-of-service
 * vectors. We escape `\`, `%`, and `_` and pair every LIKE clause with
 * `ESCAPE '\\'` so these characters become literals in the pattern.
 *
 * Order matters: backslash must be escaped first, otherwise we double-escape
 * the escapes we just inserted.
 *
 * @param input Raw user string
 * @returns String safe to embed inside a LIKE pattern that uses ESCAPE '\\'
 */
function escapeLikeWildcards(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/**
 * Build a substring LIKE clause with proper wildcard escaping.
 *
 * The pattern is bound as a parameter; only the column reference and the
 * literal `ESCAPE '\\'` clause are inlined into SQL, so this is safe from
 * injection. The ESCAPE clause is required for the escapes inserted by
 * {@link escapeLikeWildcards} to be honoured by SQLite.
 *
 * Wildcard contract: this helper performs a literal substring match. The
 * caller is responsible for translating any user-facing wildcards (e.g. the
 * `*` wildcard accepted by the icao field) before calling.
 *
 * @param column Drizzle column reference
 * @param pattern LIKE pattern, with `\` as the escape character
 */
function likeEscaped(column: AnyColumn, pattern: string) {
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/**
 * Search using LIKE queries (slow but supports substring matching)
 *
 * Wildcard contract:
 * - All fields except `icao` perform a literal substring match. `%` and `_` in
 *   user input are escaped so they cannot match arbitrary characters or trigger
 *   full table scans (DoS).
 * - `icao` honours `*` as a user-facing wildcard (translated to SQL `%` after
 *   escaping). A 6-character input without `*` short-circuits to an exact match.
 *
 * @param params Search parameters
 * @returns Search result with messages and total count
 */
function searchWithLike(params: SearchParams): SearchResult {
  const db = getDatabase();

  // Build WHERE clauses
  const conditions = [];

  if (params.tail) {
    conditions.push(likeEscaped(messages.tail, `%${escapeLikeWildcards(params.tail)}%`));
  }

  if (params.flight) {
    conditions.push(likeEscaped(messages.flight, `%${escapeLikeWildcards(params.flight)}%`));
  }

  if (params.icao) {
    if (params.icao.includes("*") || params.icao.includes("%")) {
      // User-facing wildcard contract: `*` (and the legacy raw `%`) become SQL
      // `%`. Other LIKE metacharacters are escaped first so a search like
      // `A_*` means "starts with A followed by literal underscore, then
      // anything", not "starts with A, any char, anything".
      const pattern = escapeLikeWildcards(params.icao).replaceAll("*", "%");
      conditions.push(likeEscaped(messages.icao, pattern));
    } else if (params.icao.length === 6) {
      conditions.push(eq(messages.icao, params.icao.toUpperCase()));
    } else {
      conditions.push(likeEscaped(messages.icao, `%${escapeLikeWildcards(params.icao)}%`));
    }
  }

  if (params.depa) {
    conditions.push(likeEscaped(messages.depa, `%${escapeLikeWildcards(params.depa)}%`));
  }

  if (params.dsta) {
    conditions.push(likeEscaped(messages.dsta, `%${escapeLikeWildcards(params.dsta)}%`));
  }

  if (params.label) {
    conditions.push(likeEscaped(messages.label, `%${escapeLikeWildcards(params.label)}%`));
  }

  if (params.msgno) {
    conditions.push(likeEscaped(messages.msgno, `%${escapeLikeWildcards(params.msgno)}%`));
  }

  if (params.text) {
    conditions.push(likeEscaped(messages.text, `%${escapeLikeWildcards(params.text)}%`));
  }

  if (params.freq) {
    conditions.push(eq(messages.freq, params.freq));
  }

  if (params.messageType) {
    conditions.push(eq(messages.messageType, params.messageType));
  }

  if (params.stationId) {
    conditions.push(
      likeEscaped(messages.stationId, `%${escapeLikeWildcards(params.stationId)}%`),
    );
  }

  if (params.startTime !== undefined) {
    conditions.push(sql`${messages.time} >= ${params.startTime}`);
  }

  if (params.endTime !== undefined) {
    conditions.push(sql`${messages.time} <= ${params.endTime}`);
  }

  // Get total count
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const startCount = performance.now();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(whereClause)
    .get();

  const elapsedCount = performance.now() - startCount;
  logger.debug(`Count took: ${elapsedCount.toFixed().padStart(4, "0")} ms`);

  const totalCount = countResult?.count ?? 0;

  if (totalCount === 0) {
    return { messages: [], totalCount: 0 };
  }

  // Determine sort column and order
  const sortColumn =
    params.sortBy === "tail"
      ? messages.tail
      : params.sortBy === "flight"
        ? messages.flight
        : params.sortBy === "label"
          ? messages.label
          : messages.time;

  const sortFn = params.sortOrder === "asc" ? asc : desc;

  // Execute paginated query

  const query = db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(sortFn(sortColumn))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0)

  logger.debug(`Runninq query: ${JSON.stringify(query.toSQL())}`);

  const startQuery = performance.now();

  const results = query.all();

  const elapsedQuery = performance.now() - startQuery;
  logger.debug(`Query took: ${elapsedQuery.toFixed().padStart(4, "0")} ms`);

  return {
    messages: results,
    totalCount,
  };
}

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
 * Decoder Search Index — Read Path (v4.3 Phase 3)
 *
 * Backend query support for the two facets the compact search index makes
 * possible: message-type classification (`decoder_variant.description`) and
 * field presence (`decoded_field` bit membership in `decoded_messages.mask_*`).
 * See agent-docs/V4.3.md "Open Question 7" for why these two facets, rather
 * than free text, are what the index stores.
 *
 * Scope boundary: this file is backend query capability only. Nothing here
 * is wired to a Socket.IO handler or the frontend — the Search UI facet
 * semantics (e.g. whether a "temperature" facet means field-presence or a
 * text search) are an explicit open product question, not a decision this
 * phase makes. See agent-docs/V4.3.md Phase 3.
 *
 * Neither query here is backed by a new index (agent-docs/V4.3.md "No Index
 * Without Evidence"): `dv.description` is not the leading column of
 * `ix_decoder_variant_key`, and `mask_lo`/`mask_hi` bitwise tests are not
 * sargable by any B-tree. Both are accepted as full scans of the *compact*
 * `decoded_messages` table specifically because that table is small — see
 * the `EXPLAIN QUERY PLAN` evidence and measured timings in
 * `__tests__/decoded-search.test.ts` and agent-docs/V4.3.md "Is Persisting
 * Decodes Worth Its Storage? (Answered)".
 *
 * FROM-clause order is load-bearing, not stylistic: every row-fetching query
 * below lists `decoded_messages` (optionally joined to `decoder_variant`)
 * FIRST and joins `messages` last. Writing it the other way round —
 * `FROM messages m JOIN decoded_messages dm ...` — reads the same in
 * English but measured differently: SQLite's planner drove the loop from
 * `messages` (an unbounded ~11M-row table in production) and only *then*
 * sought into the ~28 MB compact index per row, via `SCAN m ... / SEARCH dm
 * USING PRIMARY KEY`. That inverts the entire cost model this index exists
 * to provide — see `EXPLAIN QUERY PLAN` evidence in
 * `__tests__/decoded-search.test.ts`. Listing the compact tables first gets
 * `SCAN dm ... / SEARCH m USING INTEGER PRIMARY KEY` instead: the scan is
 * bounded by the compact index, and `messages` is only ever touched by a
 * single-row primary-key seek.
 */

import {
  fieldBitToMask,
  lookupFieldBit,
} from "../../../services/decoded-search-index.js";
import { createLogger } from "../../../utils/logger.js";
import { getSqliteConnection } from "../../client.js";
import type { Message } from "../../schema.js";
import { mapRawRowToMessage } from "./search.js";

const logger = createLogger("db:decoded-search");

const DEFAULT_LIMIT = 100;

export interface DecodedSearchOptions {
  limit?: number;
  offset?: number;
}

export interface DecodedSearchResult {
  messages: Message[];
  totalCount: number;
}

/**
 * Find messages whose decode classified as `description` (a
 * `decoder_variant.description` value — e.g. "Ground Station Squitter").
 *
 * `decoder_variant` is ~70 rows (a single 4 KB page), so the join back to
 * `decoded_messages` — not the lookup — is where the real cost is, and that
 * cost is a scan of the compact index rather than a seek. See the module
 * doc comment.
 */
export function searchMessagesByVariantDescription(
  description: string,
  options: DecodedSearchOptions = {},
): DecodedSearchResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const conn = getSqliteConnection();

  const countRow = conn
    .prepare(
      `SELECT COUNT(*) AS count
       FROM decoded_messages dm
       JOIN decoder_variant dv ON dv.id = dm.variant_id
       WHERE dv.description = ?`,
    )
    .get(description) as { count: number };

  const totalCount = countRow.count;
  if (totalCount === 0) {
    return { messages: [], totalCount: 0 };
  }

  const rows = conn
    .prepare(
      `SELECT m.* FROM decoded_messages dm
       JOIN decoder_variant dv ON dv.id = dm.variant_id
       JOIN messages m ON m.id = dm.message_id
       WHERE dv.description = ?
       ORDER BY m.msg_time DESC
       LIMIT ? OFFSET ?`,
    )
    .all(description, limit, offset) as Record<string, unknown>[];

  logger.debug("Search by variant description complete", {
    description,
    totalCount,
    returned: rows.length,
  });

  return { messages: rows.map(mapRawRowToMessage), totalCount };
}

/**
 * Find messages whose decode carried field `label` (a `decoded_field.label`
 * value — e.g. "Desired Altitude").
 *
 * A label that has never been assigned a bit (`lookupFieldBit` returns
 * `null`) cannot be present on any message, so this short-circuits to an
 * empty result rather than querying — and deliberately does NOT call
 * `assignFieldBit`, which would create a bit for a label purely because
 * someone searched for it.
 *
 * Binding `mask.maskLo`/`mask.maskHi` as `bigint` on these statements is
 * exact regardless of `.safeIntegers()` — see decoded-search-index.ts's
 * module doc comment. Neither statement here reads `mask_lo`/`mask_hi`
 * back (only tests them in `WHERE`, and `m.*` never includes them), so
 * `.safeIntegers()` is not needed on either.
 */
export function searchMessagesByFieldLabel(
  label: string,
  options: DecodedSearchOptions = {},
): DecodedSearchResult {
  const bit = lookupFieldBit(label);
  if (bit === null) {
    logger.debug("Field-presence search for a label with no assigned bit", {
      label,
    });
    return { messages: [], totalCount: 0 };
  }

  const mask = fieldBitToMask(bit);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const conn = getSqliteConnection();

  // Exactly one of maskLo/maskHi is non-zero for a single field bit, so the
  // OR here reduces to testing whichever column that bit actually lives in
  // — the other side is always `x & 0`, i.e. always false.
  const countRow = conn
    .prepare(
      `SELECT COUNT(*) AS count FROM decoded_messages
       WHERE (mask_lo & ?) != 0 OR (mask_hi & ?) != 0`,
    )
    .get(mask.maskLo, mask.maskHi) as { count: number };

  const totalCount = countRow.count;
  if (totalCount === 0) {
    return { messages: [], totalCount: 0 };
  }

  const rows = conn
    .prepare(
      `SELECT m.* FROM decoded_messages dm
       JOIN messages m ON m.id = dm.message_id
       WHERE (dm.mask_lo & ?) != 0 OR (dm.mask_hi & ?) != 0
       ORDER BY m.msg_time DESC
       LIMIT ? OFFSET ?`,
    )
    .all(mask.maskLo, mask.maskHi, limit, offset) as Record<string, unknown>[];

  logger.debug("Search by field presence complete", {
    label,
    bit,
    totalCount,
    returned: rows.length,
  });

  return { messages: rows.map(mapRawRowToMessage), totalCount };
}

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
 * Decoder Search Index — Write Path (v4.3 Phase 3)
 *
 * Populates `decoder_variant`, `decoded_field`, and `decoded_messages`
 * (migration16.ts / schema.ts) at ingest time. This is a *search index*, not
 * a decoded-text cache: no decoded text is ever stored here. Display decodes
 * are produced on read by `formatters/enrichment.ts`, which also holds the
 * sole decode call this module's caller must not duplicate — see
 * agent-docs/V4.3.md "Open Question 7" and "Phase 3: Decoder Search Index".
 *
 * ---------------------------------------------------------------------------
 * Why raw better-sqlite3 statements instead of the Drizzle query builder
 * ---------------------------------------------------------------------------
 * `mask_lo` / `mask_hi` address bit positions 0-125 (agent-docs/V4.3.md,
 * migration16.ts). Bit 62 alone is 2^62 ≈ 4.6e18, which is far past
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1 ≈ 9e15). Drizzle's `integer()` column
 * type is typed as `number` end to end, so routing these two columns through
 * it would silently round every mask at or above bit 53 — and 64 distinct
 * field labels already exist in production, so bit 53+ is in play from day
 * one, not a future edge case.
 *
 * better-sqlite3 binds `bigint` *parameters* exactly regardless of a
 * statement's safe-integer mode — the precision loss is one-directional.
 * Only *reading* an integer column back through `.get()`/`.all()` without
 * `.safeIntegers()` coerces it to `number` and loses precision above
 * `Number.MAX_SAFE_INTEGER`. Concretely: `writeDecodedMessageIndexRow` below
 * binds `bigint` masks on a plain statement (no `.safeIntegers()` needed,
 * it never reads one back), while `getMessageFieldMask` — the one place in
 * this file that reads a mask back — sets `.safeIntegers(true)` and is the
 * statement the precision guarantee actually depends on.
 *
 * Two distinct hazards, and it is worth being precise about which the tests
 * actually catch. The first is the type: without `.safeIntegers(true)` a mask
 * comes back as `number`, and a bitwise `&` between `number` and `bigint`
 * throws outright. That is what the round-trip assertions detect, since
 * `Object.is` separates `1n` from `1`. The second is real decimal
 * corruption, and it needs bits spanning more than float64's 53-bit mantissa:
 * `mask_hi` with bits 0 and 62 set is `4611686018427387905n` and reads back
 * as `...904`, losing the low bit. A narrow-span example such as bits
 * 52/53/62 round-trips exactly despite exceeding MAX_SAFE_INTEGER, so it
 * would NOT demonstrate corruption — only the type change. The regression
 * tests in `__tests__/decoded-search-index.test.ts` pin this at bits 52, 53,
 * 62 (top of `mask_lo`), 63 (bottom of `mask_hi`), and 125 (top of
 * `mask_hi`).
 *
 * `decoder_variant` and `decoded_field` carry no such risk — `id` is a plain
 * 32-bit-range autoincrement / bit-position value — but this file uses raw
 * SQL for those too, for one module-wide access pattern rather than mixing
 * Drizzle and raw SQL query styles across three tightly related tables.
 */

import { getSqliteConnection } from "../db/client.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("services:decoded-search-index");

/** Lowest addressable `decoded_field.id` / bit position. */
export const MIN_FIELD_BIT = 0;

/**
 * Highest addressable `decoded_field.id` / bit position — the `CHECK(id
 * BETWEEN 0 AND 125)` bound in migration16.ts. 126 positions split across
 * two 63-bit halves (`mask_lo` bits 0-62, `mask_hi` bits 0-62 representing
 * field ids 63-125).
 */
export const MAX_FIELD_BIT = 125;

/**
 * Width of `mask_lo` in bits. SQLite's `INTEGER` is signed 64-bit, so only
 * bits 0-62 are usable without touching the sign bit (bit 63) — hence the
 * split into two columns rather than one 64-bit mask. Field id `MASK_LO_BITS`
 * is the first id that lands in `mask_hi`, at offset 0 there.
 */
const MASK_LO_BITS = 63;

/** A field-presence bitmask split the same way `decoded_messages` stores it. */
export interface FieldMask {
  maskLo: bigint;
  maskHi: bigint;
}

const EMPTY_MASK: FieldMask = { maskLo: 0n, maskHi: 0n };

/**
 * Find the stable bit position for `label`, or `null` if it has never been
 * assigned one. Read-only — unlike {@link assignFieldBit}, this never
 * creates a row. Used by the search path (`db/queries/messages/decoded-
 * search.ts`): a field label nobody has ever decoded cannot match any
 * message, so there is nothing to assign a bit for.
 */
export function lookupFieldBit(label: string): number | null {
  const conn = getSqliteConnection();
  const row = conn
    .prepare("SELECT id FROM decoded_field WHERE label = ?")
    .get(label) as { id: number } | undefined;
  return row ? row.id : null;
}

/**
 * Find-or-create the stable bit position for `label` in `decoded_field`.
 *
 * `decoded_field.id` IS the bit position (agent-docs/V4.3.md, migration16.ts
 * header comment #4): rows are never renumbered or deleted, so a label's bit
 * is stable across process restarts and across the lifetime of the
 * database. A label not yet present is assigned the next free position —
 * `MAX(id) + 1`, or `0` for an empty table. Because positions are never
 * reused, "next free" and "one past the current maximum" are the same thing
 * under normal operation; there is no gap-filling to do.
 *
 * Atomicity: wrapped in a `better-sqlite3` transaction so the
 * read-max/write-next sequence cannot race with itself, with the unique
 * index on `label` (`ix_decoded_field_label`) as the correctness net rather
 * than the intended path — if a concurrent writer (a second process sharing
 * this database file) inserts the same label between this transaction's
 * SELECT and INSERT, the INSERT's unique-constraint violation is caught and
 * the newly-committed row is re-read instead of erroring or racing to
 * "win". Node's single-threaded, synchronous-better-sqlite3 execution model
 * means this cannot happen from within one process, but the codebase does
 * not assume it will always be the only process attached to the database
 * file.
 *
 * @throws {Error} if all 126 bit positions (0-125) are already assigned.
 *   This is intentionally loud — see `CHECK(id BETWEEN 0 AND 125)` in
 *   migration16.ts, which exists precisely so exhausting the mask fails
 *   hard rather than silently truncating or wrapping a field out of the
 *   index. The caller (`indexDecodedMessage` below, and ultimately
 *   `formatters/enrichment.ts`) is responsible for deciding whether to let
 *   this propagate or catch-and-log; this function always throws.
 */
export function assignFieldBit(label: string): number {
  const conn = getSqliteConnection();
  const selectByLabel = conn.prepare(
    "SELECT id FROM decoded_field WHERE label = ?",
  );
  const selectMaxId = conn.prepare(
    "SELECT MAX(id) AS maxId FROM decoded_field",
  );
  const insert = conn.prepare(
    "INSERT INTO decoded_field (id, label) VALUES (?, ?)",
  );

  const runAssignment = conn.transaction((): number => {
    const existing = selectByLabel.get(label) as { id: number } | undefined;
    if (existing) {
      return existing.id;
    }

    const maxRow = selectMaxId.get() as { maxId: number | null };
    const nextId = maxRow.maxId === null ? MIN_FIELD_BIT : maxRow.maxId + 1;

    if (nextId > MAX_FIELD_BIT) {
      const message =
        `decoded_field bit space exhausted: cannot assign a bit position for ` +
        `label ${JSON.stringify(label)} — all ${MAX_FIELD_BIT - MIN_FIELD_BIT + 1} ` +
        `positions (${MIN_FIELD_BIT}-${MAX_FIELD_BIT}) are already assigned. ` +
        "Refusing to truncate or wrap the mask; see agent-docs/V4.3.md " +
        "'decoded_messages - Decoded Text Storage'.";
      logger.error(message, { label, nextId });
      throw new Error(message);
    }

    try {
      insert.run(nextId, label);
      return nextId;
    } catch (error) {
      // Lost a race with a concurrent writer for this exact label — the
      // unique index on `label` is what makes this safe to retry instead of
      // erroring: re-read rather than assume this attempt "won".
      const retryExisting = selectByLabel.get(label) as
        | { id: number }
        | undefined;
      if (retryExisting) {
        return retryExisting.id;
      }
      throw error;
    }
  });

  return runAssignment();
}

/**
 * Fold a single bit position into a {@link FieldMask}.
 *
 * Exported so the read path (`db/queries/messages/decoded-search.ts`) can
 * translate a looked-up field bit into the same `mask_lo`/`mask_hi` split
 * used at write time, without duplicating the column-boundary arithmetic in
 * two places.
 */
export function fieldBitToMask(bitPosition: number): FieldMask {
  if (bitPosition < MASK_LO_BITS) {
    return { maskLo: 1n << BigInt(bitPosition), maskHi: 0n };
  }
  return { maskLo: 0n, maskHi: 1n << BigInt(bitPosition - MASK_LO_BITS) };
}

/**
 * Assign (or look up) a bit for every label in `fieldLabels` and OR them
 * together into one {@link FieldMask}. Duplicate labels are safe — ORing a
 * bit into a mask it is already set in is a no-op.
 *
 * Calls {@link assignFieldBit} once per distinct label, so this can throw
 * the same "bit space exhausted" error under the same conditions.
 */
export function buildFieldMask(fieldLabels: readonly string[]): FieldMask {
  let maskLo = EMPTY_MASK.maskLo;
  let maskHi = EMPTY_MASK.maskHi;

  for (const label of fieldLabels) {
    const bit = assignFieldBit(label);
    const delta = fieldBitToMask(bit);
    maskLo |= delta.maskLo;
    maskHi |= delta.maskHi;
  }

  return { maskLo, maskHi };
}

/**
 * Find-or-create the `decoder_variant` row for the interned triple
 * `(decoder_name, decoder_version, description)`.
 *
 * `decoderName` is normalised to the `''` sentinel for `null`/`undefined`
 * rather than left as `NULL` — see migration16.ts and agent-docs/V4.3.md
 * "decoded_messages - Decoded Text Storage" for why: SQLite treats `NULL` as
 * *distinct* under `UNIQUE`, so a nullable lookup would mint a new variant
 * row on every call instead of interning to ~70 rows. `description` gets the
 * same normalisation for the same reason, even though every code path that
 * currently calls this (decoded messages only) always supplies one.
 *
 * Atomicity follows the same select/insert/retry-on-conflict pattern as
 * {@link assignFieldBit}, guarded by `ix_decoder_variant_key`.
 */
export function findOrCreateDecoderVariant(
  decoderName: string | null | undefined,
  decoderVersion: string,
  description: string | null | undefined,
): number {
  const name = decoderName ?? "";
  const desc = description ?? "";
  const conn = getSqliteConnection();

  const selectExisting = conn.prepare(
    `SELECT id FROM decoder_variant
     WHERE decoder_name = ? AND decoder_version = ? AND description = ?`,
  );
  const insert = conn.prepare(
    `INSERT INTO decoder_variant (decoder_name, decoder_version, description)
     VALUES (?, ?, ?)`,
  );

  const runFindOrCreate = conn.transaction((): number => {
    const existing = selectExisting.get(name, decoderVersion, desc) as
      | { id: number }
      | undefined;
    if (existing) {
      return existing.id;
    }

    try {
      const info = insert.run(name, decoderVersion, desc);
      return Number(info.lastInsertRowid);
    } catch (error) {
      const retryExisting = selectExisting.get(name, decoderVersion, desc) as
        | { id: number }
        | undefined;
      if (retryExisting) {
        return retryExisting.id;
      }
      throw error;
    }
  });

  return runFindOrCreate();
}

/**
 * Upsert the `decoded_messages` row for `messageId`.
 *
 * `ON CONFLICT ... DO UPDATE` makes this idempotent for a given `messageId` —
 * re-indexing the same message (e.g. a future Phase 4 rebuild pass) replaces
 * the row rather than erroring or duplicating, which `message_id` being the
 * `WITHOUT ROWID` primary key would reject outright on a plain `INSERT`.
 *
 * Binding `mask.maskLo` / `mask.maskHi` as `bigint` parameters preserves
 * their exact value going in regardless of the statement's safe-integer
 * mode — better-sqlite3 binds `bigint` parameters exactly either way, only
 * *reading* an integer column back loses precision above
 * `Number.MAX_SAFE_INTEGER` without `.safeIntegers()`. This statement never
 * reads a mask back (`.run()`, not `.get()`/`.all()`), so it does not need
 * `.safeIntegers(true)` for correctness. See {@link getMessageFieldMask}
 * below for the statement that does.
 */
export function writeDecodedMessageIndexRow(
  messageId: number,
  variantId: number,
  mask: FieldMask,
): void {
  const conn = getSqliteConnection();
  const upsert = conn.prepare(
    `INSERT INTO decoded_messages (message_id, variant_id, mask_lo, mask_hi)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(message_id) DO UPDATE SET
       variant_id = excluded.variant_id,
       mask_lo = excluded.mask_lo,
       mask_hi = excluded.mask_hi`,
  );

  upsert.run(messageId, variantId, mask.maskLo, mask.maskHi);
}

/**
 * Read back the exact {@link FieldMask} stored for `messageId`, or `null` if
 * the message has no `decoded_messages` row (no decoder output).
 *
 * `.safeIntegers(true)` IS load-bearing here — this is the read path the
 * module doc comment's precision warning is about. Without it, `mask_lo` /
 * `mask_hi` values with bit 53 or above (in play from day one — 64 distinct
 * field labels already exist in production) come back as `number`, which
 * makes a bitwise `&` against a `bigint` throw. Wide-span masks are also
 * genuinely corrupted: `mask_hi` with bits 0 and 62 set is
 * `4611686018427387905n` and reads back as `...904`. See
 * `__tests__/decoded-search-index.test.ts` for the round-trip regression
 * tests at bits 52, 53, 62, 63, and 125.
 */
export function getMessageFieldMask(messageId: number): FieldMask | null {
  const conn = getSqliteConnection();
  const row = conn
    .prepare(
      "SELECT mask_lo AS maskLo, mask_hi AS maskHi FROM decoded_messages WHERE message_id = ?",
    )
    .safeIntegers(true)
    .get(messageId) as { maskLo: bigint; maskHi: bigint } | undefined;

  return row ? { maskLo: row.maskLo, maskHi: row.maskHi } : null;
}

/**
 * Everything needed to index one decoded message. Deliberately a plain
 * interface rather than `@airframes/acars-decoder`'s `DecodeResult` type, so
 * this module has no compile-time dependency on the decoder library's shape
 * — the caller (`formatters/enrichment.ts`, which already depends on the
 * decoder) is responsible for extracting these fields from its single decode
 * call.
 */
export interface DecodedMessageForIndex {
  /** `messages.id` of the row this decode belongs to. */
  messageId: number;
  /** The decoder plugin that produced this decode (`DecodeResult.decoder.name`). */
  decoderName: string;
  /** Installed `@airframes/acars-decoder` version — see `decoder-version.ts`. */
  decoderVersion: string;
  /** Message-type classification (`DecodeResult.formatted.description`). */
  description: string;
  /** Field labels present in the decode (`DecodeResult.formatted.items[].label`). */
  fieldLabels: readonly string[];
}

/**
 * Populate the decoder search index for one message that produced decoder
 * output.
 *
 * Row policy (agent-docs/V4.3.md "Row Policy: Decoded Messages Only"): call
 * this ONLY when a decode actually succeeded. There is no "row per message"
 * fallback — a message that never decodes must get no row at all, or the
 * ~28 MB compact-index figure the design is measured against becomes the
 * ~900 MB per-message-row figure it was explicitly built to avoid. The
 * caller (`formatters/enrichment.ts`) enforces this by only calling from
 * inside its `result.decoded === true` branch.
 *
 * Wrapped in one transaction covering variant lookup, every field-bit
 * assignment, and the row upsert: if bit assignment throws (mask
 * exhaustion), nothing from this call — not the variant, not any of the
 * bits already assigned earlier in `fieldLabels` — is left committed.
 *
 * @throws {Error} propagated from {@link assignFieldBit} if the 126-bit
 *   space is exhausted. Does not catch its own errors — the ingest call site
 *   is responsible for deciding that a failed index write must not fail
 *   message ingestion (agent-docs/V4.3.md Phase 3 deliverables); this
 *   function's contract is "loud failure, no partial state".
 */
export function indexDecodedMessage(input: DecodedMessageForIndex): void {
  const conn = getSqliteConnection();

  const runIndexWrite = conn.transaction((): void => {
    const variantId = findOrCreateDecoderVariant(
      input.decoderName,
      input.decoderVersion,
      input.description,
    );
    const mask = buildFieldMask(input.fieldLabels);
    writeDecodedMessageIndexRow(input.messageId, variantId, mask);
  });

  runIndexWrite();
}

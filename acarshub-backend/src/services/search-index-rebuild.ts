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
 * Search Index Rebuild on Decoder Change (v4.3 Phase 4)
 *
 * Replaces the originally-planned "decoder reprocessor". v4.3 does not
 * persist decoded text (see agent-docs/V4.3.md "Is Persisting Decodes Worth
 * Its Storage? (Answered)"), so a decoder upgrade does not invalidate any
 * stored decode — there is none. What it invalidates is the compact search
 * INDEX (`decoded_messages` / `decoder_variant` / `decoded_field`, Phase 3)
 * built at ingest time under the previous decoder version. This module
 * rebuilds that index, resumably, whenever the installed decoder version
 * changes.
 *
 * Follows Architecture Invariant 12 (singleton `getXxx()` / `destroyXxx()`
 * factory) because — unlike `system-config.ts` — this service has genuine
 * lifecycle state: a running flag and an abort flag that `stop()` needs to
 * reach across the async gap between batches.
 */

import { MessageDecoder } from "@airframes/acars-decoder";
import { getSqliteConnection } from "../db/client.js";
import { createLogger } from "../utils/logger.js";
import {
  type DecodedMessageForIndex,
  indexDecodedMessage,
} from "./decoded-search-index.js";
import { buildIndexInput } from "./decoder-index-input.js";
import { getInstalledDecoderVersion } from "./decoder-version.js";
import { getSystemConfigValue, setSystemConfigValue } from "./system-config.js";

const logger = createLogger("services:search-index-rebuild");

/**
 * Rows fetched per batch. Deliberately small relative to the corpus sizes
 * this was measured against (agent-docs/V4.3.md "Phase 4": ~92s decode /
 * ~1.4s writes for 4.2M rows) so that yielding between batches keeps the
 * rebuild from ever holding the event loop for long, per Architecture
 * Invariant 11 ("the decoder reprocessor is non-blocking").
 */
export const REBUILD_BATCH_SIZE = 250;

/** Outcome of one call to {@link SearchIndexRebuilder.run}. */
export interface RebuildProgress {
  /** Messages examined (rows returned by the cursor sweep). */
  scanned: number;
  /** `decoded_messages` rows written or updated. */
  indexed: number;
  /** Stale `decoded_messages` rows deleted (see Row Policy note below). */
  removed: number;
  /** Final `messages.id` cursor position after this call. */
  lastId: number;
  /** `false` if `stop()` aborted the run before it reached the end. */
  completed: boolean;
}

/** One row fetched from the raw `messages` cursor sweep. */
interface RebuildRow {
  id: number;
  label: string;
  msg_text: string;
}

/**
 * What to do with one row once it has been decoded outside the write
 * transaction. Computed up front so the transaction body (which must stay
 * short) does nothing but apply already-decided writes.
 */
type RowPlan =
  | { kind: "index"; id: number; input: DecodedMessageForIndex }
  | { kind: "delete"; id: number };

/**
 * Owned by this module, not shared with `formatters/enrichment.ts`'s
 * decoder instance. The rebuild runs independently of live ingest (it can
 * run across a restart, resuming from a stored cursor) and must not share
 * mutable decoder state with the ingest pipeline's instance.
 */
const rebuildDecoder = new MessageDecoder();

/**
 * Decode one row and decide what the rebuild should do with it. Wrapped in
 * its own try/catch — one malformed message's decoder exception must not
 * abort the whole batch, only that row's contribution to it (treated the
 * same as "did not decode").
 */
function planRow(row: RebuildRow): RowPlan {
  try {
    const result = rebuildDecoder.decode({
      text: row.msg_text,
      label: row.label,
    });

    if (result.decoded === true) {
      return {
        kind: "index",
        id: row.id,
        input: buildIndexInput(row.id, result),
      };
    }
    return { kind: "delete", id: row.id };
  } catch (error) {
    logger.warn(
      "Failed to decode message during search index rebuild — treating as non-decoding",
      {
        messageId: row.id,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return { kind: "delete", id: row.id };
  }
}

export class SearchIndexRebuilder {
  private readonly batchSize: number;
  private runningFlag = false;
  private abortFlag = false;

  constructor(options?: { batchSize?: number }) {
    this.batchSize = options?.batchSize ?? REBUILD_BATCH_SIZE;
  }

  public get isRunning(): boolean {
    return this.runningFlag;
  }

  /**
   * Signal the running loop to stop between batches. Does not touch
   * `search_index_rebuild_status` — the cursor already reflects everything
   * actually committed, so leaving status at `"running"` is exactly what
   * makes the next `scheduleIfNeeded()` resume from here instead of
   * restarting.
   */
  public stop(): void {
    this.abortFlag = true;
  }

  /**
   * Decide whether a rebuild needs to start (or resume), and fire it
   * without blocking the caller.
   *
   * See the module-level table in agent-docs/V4.3.md "Phase 4" for the
   * full decision matrix; the two non-obvious rules are documented inline
   * below, at the branches that implement them.
   */
  public scheduleIfNeeded(): boolean {
    // A second concurrent loop would share this instance's single cursor
    // key (`search_index_rebuild_cursor`) with the run already in flight.
    // Two loops both reading-then-writing that key interleaved could roll
    // it BACKWARDS (a slower loop's stale read overwriting a faster loop's
    // further-along write), silently skipping a region of the corpus that
    // neither loop ever revisits. This check must come before ANY
    // system_config read or write below — including the version-change
    // branch's cursor reset — or a second call could still reset/re-stamp
    // state out from under the run already using it.
    if (this.isRunning) {
      logger.debug(
        "Search index rebuild already running — ignoring redundant scheduleIfNeeded() call",
      );
      return false;
    }

    const installed = getInstalledDecoderVersion();

    // "unknown" means getInstalledDecoderVersion()'s package.json read
    // FAILED (an I/O error) — it is not a real version change. Scheduling a
    // rebuild on it would re-intern the entire corpus under a bogus
    // "unknown" variant version every time the read happens to fail, which
    // is strictly worse than doing nothing and waiting for a successful
    // read on a later startup.
    if (installed === "unknown") {
      logger.warn(
        "Installed decoder version could not be determined — skipping search index rebuild check",
      );
      return false;
    }

    const stored = getSystemConfigValue("acars_decoder_installed_version");
    const status = getSystemConfigValue("search_index_rebuild_status");

    if (stored !== installed) {
      // The installed version is written HERE, at START, not at completion.
      // Resumption below is driven by status + cursor, not by comparing
      // versions again. This is what makes a SECOND decoder upgrade landing
      // mid-rebuild correctly reset the cursor to 0: at the NEXT startup,
      // `stored` is already v2 (written by this branch when v2 arrived) and
      // `installed` is v3, so `stored !== installed` is true again and the
      // v2-relative cursor is discarded — rather than resumed against a
      // decoder it was never measured against, which is what would happen
      // if the version were only written on completion.
      setSystemConfigValue("search_index_rebuild_cursor", "0");
      setSystemConfigValue("search_index_rebuild_status", "running");
      setSystemConfigValue("acars_decoder_installed_version", installed);

      logger.info("Decoder version changed — starting search index rebuild", {
        stored,
        installed,
      });

      this.fire();
      return true;
    }

    // "failed" resumes for the same reason "running" does. A rebuild that
    // threw mid-batch sets status to "failed" (see run()) but leaves the
    // cursor exactly where the last successfully committed batch left it —
    // that cursor is real, useful progress. If only "running" resumed here,
    // a rebuild that failed once would be stranded forever: its cursor
    // sitting on disk with nothing left to ever read it, and the rest of
    // the corpus permanently unindexed under the new version.
    if (status === "running" || status === "failed") {
      logger.info("Resuming in-progress search index rebuild", {
        stored,
        installed,
        status,
      });
      this.fire();
      return true;
    }

    return false;
  }

  /**
   * Fire {@link run} without blocking the caller and without risking an
   * unhandled promise rejection. `run()` already logs and rethrows on
   * failure (see its doc comment) — this `.catch` exists solely so that
   * rethrow cannot become an unhandled rejection, which would otherwise hit
   * the process-level handler in `db/client.ts` and close the database.
   */
  private fire(): void {
    setImmediate(() => {
      void this.run().catch(() => {
        // Already logged with cursor context inside run().
      });
    });
  }

  /**
   * Run the rebuild loop from wherever `system_config.search_index_rebuild_cursor`
   * currently points, until either the corpus is exhausted or `stop()` is
   * called. Directly callable (not just through `scheduleIfNeeded()`), which
   * is what makes it possible to test with a small `batchSize` without
   * waiting on `setImmediate` scheduling.
   *
   * @throws whatever escapes a batch's write transaction (e.g. a mask
   *   exhaustion inside `indexDecodedMessage`). Status is set to `"failed"`
   *   first so the failure is visible to the next `scheduleIfNeeded()` call
   *   even if nothing reads this rejection.
   */
  public async run(): Promise<RebuildProgress> {
    this.abortFlag = false;
    this.runningFlag = true;

    try {
      const installed = getInstalledDecoderVersion();
      const stored = getSystemConfigValue("acars_decoder_installed_version");
      logger.info("Search index rebuild starting", { stored, installed });

      const conn = getSqliteConnection();

      // ORDER BY id (not any decode-priority expression) is mandatory, not
      // a style choice: both variants of ordering by decode priority
      // measured a TEMP B-TREE at ~40 ms per 250-row batch, and no index
      // can serve that ordering without adding one — which
      // agent-docs/V4.3.md "No ix_decoded_version_level" explicitly
      // rejects. ORDER BY id rides the INTEGER PRIMARY KEY at no extra
      // cost. Messages with no text can never have an index row (Row
      // Policy: Decoded Messages Only), so the WHERE clause correctly
      // skips them rather than the rebuild needing to filter them out
      // itself.
      const selectBatch = conn.prepare(
        `SELECT id, label, msg_text FROM messages
         WHERE id > ? AND msg_text IS NOT NULL AND msg_text != ''
         ORDER BY id
         LIMIT ?`,
      );
      const deleteStale = conn.prepare(
        "DELETE FROM decoded_messages WHERE message_id = ?",
      );

      let lastId = Number(
        getSystemConfigValue("search_index_rebuild_cursor") ?? "0",
      );
      if (!Number.isFinite(lastId)) {
        lastId = 0;
      }

      const progress: RebuildProgress = {
        scanned: 0,
        indexed: 0,
        removed: 0,
        lastId,
        completed: false,
      };

      for (;;) {
        const rows = selectBatch.all(lastId, this.batchSize) as RebuildRow[];
        progress.scanned += rows.length;
        const isFinalBatch = rows.length < this.batchSize;

        if (rows.length > 0) {
          // Decode OUTSIDE the transaction: decoding touches no database
          // state, and every row's plan is fully decided before the
          // transaction opens, keeping the write transaction (and whatever
          // lock it holds) as short as possible.
          const plans = rows.map((row) => planRow(row));
          const batchLastId = rows[rows.length - 1].id;

          let batchIndexed = 0;
          let batchRemoved = 0;

          const runBatch = conn.transaction((): void => {
            for (const plan of plans) {
              if (plan.kind === "index") {
                indexDecodedMessage(plan.input);
                batchIndexed += 1;
              } else {
                // A message that decoded under the old decoder but no
                // longer decodes under the new one must lose its
                // `decoded_messages` row, or the index is stale in a
                // direction nothing else can repair. Architecture
                // Invariant 9 ("cascade deletes are the only pruning
                // mechanism for decoded_messages") governs RETENTION;
                // deletion for INDEX CORRECTNESS, as done here by the
                // rebuild, is a distinct, explicitly permitted case and
                // is not a narrowing of that invariant.
                const info = deleteStale.run(plan.id);
                batchRemoved += info.changes;
              }
            }

            // The cursor MUST be written inside the SAME transaction as the
            // batch it accounts for. On a crash between two separate
            // commits, a cursor that committed without its batch would
            // resume PAST work that was never actually done, leaving a
            // permanently stale index region with no way to ever detect
            // it. indexDecodedMessage() above opens its own
            // conn.transaction() internally; better-sqlite3 implements a
            // nested transaction as a SAVEPOINT under an already-open outer
            // transaction, so this nesting is correct rather than
            // redundant or conflicting.
            setSystemConfigValue(
              "search_index_rebuild_cursor",
              String(batchLastId),
            );
          });

          try {
            runBatch();
          } catch (error) {
            setSystemConfigValue("search_index_rebuild_status", "failed");
            // The cursor is deliberately left at `lastId` (the START of
            // this batch, not `batchLastId`) — see the comment above
            // `setSystemConfigValue("search_index_rebuild_cursor", ...)`
            // for why the whole batch rolled back. That means the NEXT
            // process start resumes from exactly `lastId` and re-decodes
            // exactly this same batch. If the failure is deterministic —
            // the known case is `assignFieldBit()` in
            // decoded-search-index.ts throwing once all 126 field-bit
            // positions are exhausted — this batch will fail again, once
            // per process start, forever. A distinct operator-visible
            // "stuck" status (rather than the generic "failed" that also
            // covers transient failures) is the follow-up; this log line
            // is the only signal available until then, so it must say
            // explicitly where the rebuild is halted and that it will
            // come back here.
            logger.error(
              "Search index rebuild halted: batch failed and was rolled back. " +
                "The rebuild will resume from this same cursor on the next " +
                "process start; if this failure is deterministic it will " +
                "recur every time until the underlying cause is fixed.",
              {
                resumeCursor: lastId,
                failingBatchLastId: batchLastId,
                error: error instanceof Error ? error.message : String(error),
              },
            );
            throw error;
          }

          progress.indexed += batchIndexed;
          progress.removed += batchRemoved;
          lastId = batchLastId;
          progress.lastId = lastId;
        }

        // Yield between every batch — Architecture Invariant 11: a slow
        // rebuild must never delay message ingestion or socket broadcasts.
        await new Promise<void>((resolve) => setImmediate(resolve));

        if (isFinalBatch) {
          setSystemConfigValue("search_index_rebuild_status", "completed");
          progress.completed = true;
          logger.info("Search index rebuild completed", {
            scanned: progress.scanned,
            indexed: progress.indexed,
            removed: progress.removed,
            lastId: progress.lastId,
          });
          return progress;
        }

        if (this.abortFlag) {
          progress.completed = false;
          return progress;
        }
      }
    } finally {
      this.runningFlag = false;
    }
  }
}

let rebuilderInstance: SearchIndexRebuilder | null = null;

/** Get or create the singleton search-index rebuilder. */
export function getSearchIndexRebuilder(): SearchIndexRebuilder {
  if (!rebuilderInstance) {
    rebuilderInstance = new SearchIndexRebuilder();
  }
  return rebuilderInstance;
}

/** Destroy the singleton search-index rebuilder (test cleanup / shutdown). */
export function destroySearchIndexRebuilder(): void {
  if (rebuilderInstance) {
    rebuilderInstance.stop();
    rebuilderInstance = null;
  }
}

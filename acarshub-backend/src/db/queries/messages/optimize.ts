// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// Database/FTS5 maintenance: ANALYZE, FTS5 'optimize' (full tombstone
// clearance), and FTS5 'merge' (bounded intraday segment consolidation).
// Not part of the plan's original {search,insert,update,delete,prune,range,
// transform} boundary list — messageTransform.ts already exists as a
// separate sibling file, so this maintenance trio gets its own module rather
// than being force-fit into one of the other files.
// ----------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase, getSqliteConnection } from "../../client.js";

const logger = createLogger("db:messages-optimize");

/**
 * Optimize database with ANALYZE (regular optimization)
 *
 * Equivalent to Python optimize_db_regular() function.
 *
 * Runs ANALYZE to update SQLite query planner statistics.
 * Should be run periodically for optimal query performance.
 */
export function optimizeDbRegular(): void {
  const db = getDatabase();

  try {
    logger.info("Running ANALYZE (regular optimization)");
    // Execute ANALYZE using Drizzle's sql template
    db.run(sql`ANALYZE`);
    logger.info("ANALYZE complete");
  } catch (error) {
    logger.error("Failed to run ANALYZE", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Optimize database with FTS5 'optimize' (full tombstone clearance)
 *
 * WHY THIS EXISTS — AND WHY merge(N) IS NOT ENOUGH
 * -------------------------------------------------
 * `merge(N)` is open-loop: it does exactly N pages of work per call
 * regardless of how much work actually exists.  On a light install N is
 * overkill; on a heavy install it is insufficient.  There is no magic
 * number that works for all stations.
 *
 * `optimize` is closed-loop: it runs the internal merge loop until every
 * level of the FTS5 b-tree has at most one segment.  It is idempotent — on
 * an already-clean index it exits immediately; on a fragmented one it does
 * as much work as needed.  Crucially, it reconciles tombstones definitively:
 * a tombstone only cancels its original content when the two segments are
 * physically merged, and `optimize` guarantees that merge happens.
 *
 * This is the nightly safety net.  Even if `merge` falls behind on a burst
 * day, `optimize` resets the index to a clean state regardless of what
 * accumulated during the day.  No tuning required.
 *
 * BLOCKING NOTE
 * -------------
 * `optimize` holds the SQLite write lock for its entire duration.  On a
 * 244 MB index this is typically a few seconds; it should never approach
 * migration-scale times unless the index has been badly neglected.  Run
 * it at a low-traffic time (default: nightly).
 */
export function optimizeDbFts(): void {
  try {
    logger.info("Running FTS5 optimize (full tombstone clearance)");
    // FTS5 special commands require the raw SQLite connection — same
    // constraint as optimizeDbMerge().  optimize takes no rank argument;
    // only the command column is supplied.
    const conn = getSqliteConnection();
    conn
      .prepare("INSERT INTO messages_fts(messages_fts) VALUES ('optimize')")
      .run();
    logger.info("FTS5 optimize complete");
  } catch (error) {
    logger.error("Failed to run FTS5 optimize", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Optimize database with FTS5 merge (segment consolidation)
 *
 * Merges FTS5 b-tree segments to keep the segment count low and insert
 * performance fast.  Called every 5 minutes.
 *
 * WHY 500 PAGES — AND WHY THIS IS NOT ENOUGH ON ITS OWN
 * ------------------------------------------------------
 * `merge(N)` writes up to N leaf pages per call.  The previous default of
 * -16 wrote only ~64 KB per call — far too little to keep pace with a
 * high-volume install generating tens of thousands of inserts per day, and
 * the direct cause of segment counts reaching 500,000+.
 * 500 pages (~2 MB) at a 5-minute interval = 24 MB/hour of merge throughput,
 * which comfortably handles normal HFDL/VDL-M2 insert rates.
 *
 * However, merge(N) is open-loop: it does a fixed amount of work regardless
 * of how much work exists.  It is the intraday maintenance layer that limits
 * fragmentation between nightly optimize runs — not a replacement for them.
 * See optimizeDbFts() for the closed-loop nightly cleanup.
 *
 * @param pagesPerCall Leaf pages to write per call (default: 500 ≈ 2 MB)
 */
export function optimizeDbMerge(pagesPerCall = 500): void {
  try {
    logger.debug("Running FTS5 merge", { pagesPerCall });
    // FTS5 special commands require the raw SQLite connection — Drizzle binds
    // values as parameterized placeholders which breaks the two-column FTS5
    // command syntax: INSERT INTO t(t, rank) VALUES ('merge', N)
    const conn = getSqliteConnection();
    conn
      .prepare(
        "INSERT INTO messages_fts(messages_fts, rank) VALUES ('merge', ?)",
      )
      .run(pagesPerCall);
    logger.debug("FTS5 merge complete");
  } catch (error) {
    logger.error("Failed to run FTS5 merge", {
      error: error instanceof Error ? error.message : String(error),
      pagesPerCall,
    });
  }
}

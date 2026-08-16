/**
 * Message query functions for ACARS Hub database
 *
 * This module implements message-related database operations matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - add_message(): Insert new message with UID generation, alert matching, frequency/level/count updates
 * - database_search(): Search messages with pagination (FTS5 + fallback)
 * - grab_most_recent(): Get N most recent messages
 * - show_all(): Get all messages (for export/analysis)
 * - database_get_row_count(): Get total message count
 * - prune_database(): Delete old messages while protecting alert matches
 *
 * Key differences from Python:
 * - Synchronous API (better-sqlite3 is sync-only)
 * - Type-safe with TypeScript
 * - Uses Drizzle ORM instead of raw SQL
 * - FTS5 integration for fast prefix matching
 *
 * GOD-03: this used to be a single 1281-line messages.ts file. It is now a
 * barrel over:
 *   - insert.ts   — addMessage() + AlertMetadata + unsaved-uid counter state
 *   - search.ts   — databaseSearch() + FTS5/LIKE strategy + SearchParams/Result
 *   - range.ts    — grabMostRecent/showAll/getRowCount/getMessageByUid/
 *                   getMessageCountByTimeRange (read-only range/lookup queries)
 *   - delete.ts   — deleteOldMessages() (single-purpose timestamp cutoff)
 *   - prune.ts    — pruneDatabase() (alert-match-aware retention policy)
 *   - optimize.ts — optimizeDbRegular/optimizeDbFts/optimizeDbMerge (DB/FTS5
 *                   maintenance; messageTransform.ts already covers the
 *                   plan's "transform.ts" boundary as a pre-existing sibling
 *                   file, so this maintenance trio gets its own module)
 *   - decoded-search.ts — v4.3 Phase 3: searchMessagesByVariantDescription/
 *                   searchMessagesByFieldLabel over the decoder search index
 *                   (decoded_messages/decoder_variant/decoded_field). Kept
 *                   separate from search.ts rather than folded into
 *                   SearchParams: it queries a different table family and
 *                   has no FTS5/LIKE strategy split to share.
 */

export {
  type DecodedSearchOptions,
  type DecodedSearchResult,
  searchMessagesByFieldLabel,
  searchMessagesByVariantDescription,
} from "./decoded-search.js";
export { deleteOldMessages } from "./delete.js";
export { type AlertMetadata, addMessage, resetUnsavedMessageCounter } from "./insert.js";
export {
  optimizeDbFts,
  optimizeDbMerge,
  optimizeDbRegular,
} from "./optimize.js";
export { pruneDatabase } from "./prune.js";
export {
  getMessageByUid,
  getMessageCountByTimeRange,
  getRowCount,
  grabMostRecent,
  showAll,
} from "./range.js";
export {
  databaseSearch,
  type SearchParams,
  type SearchResult,
} from "./search.js";

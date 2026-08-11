// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// Migration chain:
// 1. e7991f1644b1 - initial_schema
// 2. 0fc8b7cae596 - split_signal_level_table_into_per_decoder
// 3. a589d271a0a4 - split_freqs_table_into_per_decoder
// 4. 94d97e655180 - create_messages_fts_table_and_triggers
// 5. 3168c906fb9e - convert_icao_to_hex_string
// 6. 204a67756b9a - add_message_uids
// 7. 171fe2c07bd9 - create_alert_matches_table
// 8. 40fd0618348d - final_v4_optimization
// 9. a1b2c3d4e5f6 - add_timeseries_stats
// 10. c3d4e5f6a1b2 - rebuild_fts
// 11. f0a1b2c3d4e5 - deduplicate_timeseries_and_add_registry
// 12. b6c7d8e9f0a1 - drop_resolution_promote_timestamp_pk
// 13. 96f36b89016d - drop_unnecessary_indexes
// 14. 803398f85958 - remove_uuid
// 15. 8c9d47f5ed13 - drop_unnecessary_indexes2
// 16. 4d2a7c918f3b - v43_session_and_decode_tables
//
// This barrel assembles the ordered MIGRATIONS array from the individual
// per-migration modules (one file per revision) and derives LATEST_REVISION
// from it, so migrate.ts's runMigrations() orchestrator never needs to know
// about individual migration implementations.
// ----------------------------------------------------------------------------

import { migration01_initialSchema } from "./migration01.js";
import { migration02_splitSignalLevelTable } from "./migration02.js";
import { migration03_splitFreqsTable } from "./migration03.js";
import { migration04_createFTS } from "./migration04.js";
import { migration05_convertIcaoToHex } from "./migration05.js";
import { migration06_addMessageUids } from "./migration06.js";
import { migration07_createAlertMatches } from "./migration07.js";
import { migration08_finalOptimization } from "./migration08.js";
import { migration09_addTimeseriesStats } from "./migration09.js";
import { migration10_rebuildFts } from "./migration10.js";
import { migration11_deduplicateTimeseriesAndAddRegistry } from "./migration11.js";
import { migration12_dropResolutionPromoteTimestampPk } from "./migration12.js";
import { migration13_dropUnnecessaryIndexes } from "./migration13.js";
import { migration14_removeUuid } from "./migration14.js";
import { migration15_dropUnnecessaryIndexes2 } from "./migration15.js";
import { migration16_v43Tables } from "./migration16.js";
import type { MigrationStep } from "./types.js";

export {
  areFtsTriggersCorrect,
  createFtsTableAndTriggers,
  dropFtsTableAndTriggers,
  isFtsSchemaCorrect,
  verifyAndRepairFtsIfNeeded,
} from "./fts-helpers.js";
export {
  getAlembicVersion,
  hasAnyTables,
  isAtInitialMigrationState,
  setAlembicVersion,
} from "./state-detection.js";
export type { MigrationStep } from "./types.js";

/**
 * All migrations in order
 */
export const MIGRATIONS: MigrationStep[] = [
  {
    revision: "e7991f1644b1",
    name: "initial_schema",
    upgrade: migration01_initialSchema,
  },
  {
    revision: "0fc8b7cae596",
    name: "split_signal_level_table",
    upgrade: migration02_splitSignalLevelTable,
  },
  {
    revision: "a589d271a0a4",
    name: "split_freqs_table",
    upgrade: migration03_splitFreqsTable,
  },
  {
    revision: "94d97e655180",
    name: "create_messages_fts",
    upgrade: migration04_createFTS,
  },
  {
    revision: "3168c906fb9e",
    name: "convert_icao_to_hex",
    upgrade: migration05_convertIcaoToHex,
  },
  {
    revision: "204a67756b9a",
    name: "add_message_uids",
    upgrade: migration06_addMessageUids,
  },
  {
    revision: "171fe2c07bd9",
    name: "create_alert_matches",
    upgrade: migration07_createAlertMatches,
  },
  {
    revision: "40fd0618348d",
    name: "final_v4_optimization",
    upgrade: migration08_finalOptimization,
  },
  {
    revision: "a1b2c3d4e5f6",
    name: "add_timeseries_stats",
    upgrade: migration09_addTimeseriesStats,
  },
  {
    revision: "c3d4e5f6a1b2",
    name: "rebuild_fts",
    upgrade: migration10_rebuildFts,
  },
  {
    revision: "f0a1b2c3d4e5",
    name: "deduplicate_timeseries_and_add_registry",
    upgrade: migration11_deduplicateTimeseriesAndAddRegistry,
  },
  {
    revision: "b6c7d8e9f0a1",
    name: "drop_resolution_promote_timestamp_pk",
    upgrade: migration12_dropResolutionPromoteTimestampPk,
  },
  {
    revision: "96f36b89016d",
    name: "drop_unnecessary_indexes",
    upgrade: migration13_dropUnnecessaryIndexes,
  },
  {
    revision: "803398f85958",
    name: "remove_uuid",
    upgrade: migration14_removeUuid,
  },
  {
    revision: "8c9d47f5ed13",
    name: "drop_unnecessary_indexes2",
    upgrade: migration15_dropUnnecessaryIndexes2,
  },
  {
    revision: "4d2a7c918f3b",
    name: "v43_session_and_decode_tables",
    upgrade: migration16_v43Tables,
  },
];

/**
 * Revision of the most recent migration step, used only for log messages
 * (the actual "are we up to date" decision is driven by MIGRATIONS.length,
 * not this constant). Derived from the array itself — rather than a
 * hand-maintained string literal — specifically because NIT-07 found the
 * previous hardcoded copy ("803398f85958") had drifted one migration
 * behind the real latest ("8c9d47f5ed13") after migration 15 was added.
 * Declared here, immediately after MIGRATIONS, so the two can never drift
 * apart again.
 */
export const LATEST_REVISION = MIGRATIONS[MIGRATIONS.length - 1]?.revision ?? "";

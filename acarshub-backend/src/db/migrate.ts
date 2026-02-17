/**
 * Database migration runner for ACARS Hub
 *
 * This handles migrating databases from ANY Alembic migration point to the latest schema.
 * It detects the current Alembic version and applies necessary upgrades.
 *
 * Migration chain:
 * 1. e7991f1644b1 - initial_schema
 * 2. 0fc8b7cae596 - split_signal_level_table_into_per_decoder
 * 3. a589d271a0a4 - split_freqs_table_into_per_decoder
 * 4. 94d97e655180 - create_messages_fts_table_and_triggers
 * 5. 3168c906fb9e - convert_icao_to_hex_string
 * 6. 204a67756b9a - add_message_uids
 * 7. 171fe2c07bd9 - create_alert_matches_table
 * 8. 40fd0618348d - final_v4_optimization
 */

import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("migrations");
const DB_PATH = process.env.ACARSHUB_DB || "./data/acarshub.db";
const LATEST_REVISION = "40fd0618348d";

interface MigrationStep {
  revision: string;
  name: string;
  upgrade: (db: Database.Database) => void;
}

/**
 * Get current Alembic version
 */
function getAlembicVersion(db: Database.Database): string | null {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'",
    )
    .get();

  if (!tableExists) return null;

  const result = db.prepare("SELECT version_num FROM alembic_version").get() as
    | { version_num: string }
    | undefined;

  return result?.version_num || null;
}

/**
 * Set Alembic version
 */
function setAlembicVersion(db: Database.Database, version: string): void {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'",
    )
    .get();

  if (!tableExists) {
    db.exec("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)");
    db.prepare("INSERT INTO alembic_version (version_num) VALUES (?)").run(
      version,
    );
  } else {
    db.prepare("UPDATE alembic_version SET version_num = ?").run(version);
  }
}

/**
 * Check if database has any tables
 */
function hasAnyTables(db: Database.Database): boolean {
  const result = db
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { count: number };
  return result.count > 0;
}

/**
 * Check if database matches the initial Alembic migration state (e7991f1644b1)
 *
 * The initial state should have:
 * - messages table WITHOUT uid or aircraft_id columns
 * - freqs table (unified, not split by decoder)
 * - level table (unified, not split by decoder)
 * - messages_fts virtual table
 * - count, nonlogged_count, alert_stats, ignore_alert_terms tables
 *
 * Returns true if the database structure matches the initial migration exactly
 */
function isAtInitialMigrationState(db: Database.Database): boolean {
  try {
    // Check for expected tables
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'",
      )
      .all() as Array<{ name: string }>;

    const tableNames = new Set(tables.map((t) => t.name));

    // Must have these core tables
    const requiredTables = [
      "messages",
      "freqs",
      "level",
      "count",
      "nonlogged_count",
      "alert_stats",
      "ignore_alert_terms",
    ];

    for (const table of requiredTables) {
      if (!tableNames.has(table)) {
        return false;
      }
    }

    // Must NOT have split tables (those come in later migrations)
    const shouldNotExist = [
      "level_acars",
      "level_vdlm2",
      "freqs_acars",
      "freqs_vdlm2",
      "alert_matches",
    ];

    for (const table of shouldNotExist) {
      if (tableNames.has(table)) {
        return false;
      }
    }

    // Check messages table structure - should NOT have uid or aircraft_id
    const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
      name: string;
    }>;

    const columnNames = new Set(columns.map((c) => c.name));

    // Must have basic columns
    const requiredColumns = [
      "id",
      "message_type",
      "msg_time",
      "icao",
      "tail",
      "flight",
    ];
    for (const col of requiredColumns) {
      if (!columnNames.has(col)) {
        return false;
      }
    }

    // Must NOT have columns from later migrations
    if (columnNames.has("uid") || columnNames.has("aircraft_id")) {
      return false;
    }

    // Check for messages_fts virtual table
    const ftsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get();

    if (!ftsTable) {
      return false;
    }

    // If all checks pass, this is the initial migration state
    return true;
  } catch (error) {
    logger.error("Error checking initial migration state", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Migration 1: Initial Schema (e7991f1644b1)
 */
function migration01_initialSchema(db: Database.Database): void {
  logger.info("Applying migration 1: initial_schema");

  const hasMessages = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'",
    )
    .get();

  if (hasMessages) {
    logger.info("Messages table already exists, skipping initial schema");
    return;
  }

  // Apply full initial schema from Drizzle
  const drizzleDb = drizzle(db);
  drizzleMigrate(drizzleDb, { migrationsFolder: "./drizzle" });
}

/**
 * Migration 2: Split signal level table (0fc8b7cae596)
 *
 * This migration:
 * 1. Drops the old unified 'level' table (no decoder column in initial state)
 * 2. Creates per-decoder level tables
 * 3. Rebuilds signal level statistics from the messages table
 */
function migration02_splitSignalLevelTable(db: Database.Database): void {
  logger.info("Applying migration 2: split_signal_level_table");

  const hasLevelAcars = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='level_acars'",
    )
    .get();

  if (hasLevelAcars) {
    logger.info("Signal level tables already split, skipping");
    return;
  }

  const hasLevelTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='level'",
    )
    .get();

  // Wrap entire migration in transaction
  const migrate = db.transaction(() => {
    if (hasLevelTable) {
      logger.info("Dropping old level table (will rebuild from messages)");
      db.exec("DROP TABLE level");
    }

    // Create per-decoder signal level tables
    logger.info("Creating per-decoder level tables");
    db.exec(`
      CREATE TABLE level_acars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_vdlm2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_hfdl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_imsl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_irdm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
    `);

    // Create indexes on level column for fast lookups
    db.exec(`
      CREATE INDEX ix_level_acars_level ON level_acars(level);
      CREATE INDEX ix_level_vdlm2_level ON level_vdlm2(level);
      CREATE INDEX ix_level_hfdl_level ON level_hfdl(level);
      CREATE INDEX ix_level_imsl_level ON level_imsl(level);
      CREATE INDEX ix_level_irdm_level ON level_irdm(level);
    `);

    // Rebuild signal level statistics from messages table
    // This matches Alembic behavior - aggregate by message_type and level
    logger.info("Rebuilding signal level statistics from messages table");

    const decoderMapping = {
      ACARS: "level_acars",
      "VDL-M2": "level_vdlm2",
      VDLM2: "level_vdlm2", // Alternative spelling
      HFDL: "level_hfdl",
      IMSL: "level_imsl",
      IRDM: "level_irdm",
    };

    for (const [messageType, tableName] of Object.entries(decoderMapping)) {
      db.exec(`
        INSERT INTO ${tableName} (level, count)
        SELECT CAST(level AS REAL) as level_float, COUNT(*) as msg_count
        FROM messages
        WHERE message_type = '${messageType}'
          AND level IS NOT NULL
          AND level != ''
        GROUP BY level_float
      `);
    }

    logger.info("Signal level data rebuilt from messages");
  });

  migrate();
}

/**
 * Migration 3: Split freqs table (a589d271a0a4)
 */
function migration03_splitFreqsTable(db: Database.Database): void {
  logger.info("Applying migration 3: split_freqs_table");

  const hasFreqsAcars = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='freqs_acars'",
    )
    .get();

  if (hasFreqsAcars) {
    logger.info("Frequency tables already split, skipping");
    return;
  }

  const hasFreqsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='freqs'",
    )
    .get();

  // Wrap entire migration in transaction
  const migrate = db.transaction(() => {
    if (hasFreqsTable) {
      const oldData = db
        .prepare("SELECT freq, count, freq_type FROM freqs")
        .all() as Array<{
        freq: string;
        count: number;
        freq_type: string;
      }>;

      db.exec("DROP TABLE freqs");

      db.exec(`
        CREATE TABLE freqs_acars (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_vdlm2 (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_hfdl (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_imsl (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_irdm (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      `);

      const stmts = {
        acars: db.prepare(
          "INSERT INTO freqs_acars (freq, count) VALUES (?, ?)",
        ),
        vdlm2: db.prepare(
          "INSERT INTO freqs_vdlm2 (freq, count) VALUES (?, ?)",
        ),
        hfdl: db.prepare("INSERT INTO freqs_hfdl (freq, count) VALUES (?, ?)"),
        imsl: db.prepare("INSERT INTO freqs_imsl (freq, count) VALUES (?, ?)"),
        irdm: db.prepare("INSERT INTO freqs_irdm (freq, count) VALUES (?, ?)"),
      };

      for (const row of oldData) {
        // Map freq_type to table name (case-insensitive)
        const freqType = row.freq_type.toUpperCase();
        let targetTable: keyof typeof stmts | null = null;

        if (freqType === "ACARS") {
          targetTable = "acars";
        } else if (freqType === "VDL-M2" || freqType === "VDLM2") {
          targetTable = "vdlm2";
        } else if (freqType === "HFDL") {
          targetTable = "hfdl";
        } else if (freqType === "IMSL") {
          targetTable = "imsl";
        } else if (freqType === "IRDM") {
          targetTable = "irdm";
        }

        if (targetTable) {
          stmts[targetTable].run(row.freq, row.count);
        }
      }
    } else {
      db.exec(`
        CREATE TABLE freqs_acars (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_vdlm2 (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_hfdl (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_imsl (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE freqs_irdm (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      `);
    }
  });

  migrate();
}

/**
 * Migration 4: Create FTS table and triggers (94d97e655180)
 */
function migration04_createFTS(db: Database.Database): void {
  logger.info("Applying migration 4: create_messages_fts_table_and_triggers");

  const hasFTS = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
    )
    .get();

  if (hasFTS) {
    logger.info("FTS table already exists, skipping");
    return;
  }

  // Create FTS5 virtual table
  db.exec(`
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      message_type UNINDEXED,
      msg_time,
      station_id UNINDEXED,
      toaddr UNINDEXED,
      fromaddr UNINDEXED,
      depa,
      dsta,
      eta UNINDEXED,
      gtout UNINDEXED,
      gtin UNINDEXED,
      wloff UNINDEXED,
      wlin UNINDEXED,
      lat UNINDEXED,
      lon UNINDEXED,
      alt UNINDEXED,
      msg_text,
      tail,
      flight,
      icao,
      freq,
      ack UNINDEXED,
      mode UNINDEXED,
      label,
      block_id UNINDEXED,
      msgno UNINDEXED,
      is_response UNINDEXED,
      is_onground UNINDEXED,
      error UNINDEXED,
      libacars UNINDEXED,
      level UNINDEXED,
      content=messages,
      content_rowid=id
    );
  `);

  // Create triggers
  db.exec(`
    CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts (
        rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
        new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
        new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
        new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
      );
    END;
  `);

  db.exec(`
    CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
    BEGIN
      INSERT INTO messages_fts (
        messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
        old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
        old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
        old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
      );
    END;
  `);

  db.exec(`
    CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
    BEGIN
      INSERT INTO messages_fts (
        messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
        old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
        old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
        old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
      );
      INSERT INTO messages_fts (
        rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
        new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
        new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
        new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
      );
    END;
  `);

  // Rebuild FTS from existing messages
  logger.info("Rebuilding FTS index from existing messages...");
  db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
  logger.info("FTS rebuild complete");
}

/**
 * Migration 5: Convert ICAO to hex (3168c906fb9e)
 */
function migration05_convertIcaoToHex(db: Database.Database): void {
  logger.info("Applying migration 5: convert_icao_to_hex");

  const sample = db
    .prepare("SELECT icao FROM messages WHERE icao != '' LIMIT 1")
    .get() as { icao: string } | undefined;

  if (!sample || /^[0-9a-f]+$/i.test(sample.icao)) {
    logger.info("ICAO values already converted to hex, skipping");
    return;
  }

  logger.info("Converting ICAO values to hexadecimal...");
  db.exec(`
    UPDATE messages
    SET icao = printf('%06X', CAST(icao AS INTEGER))
    WHERE icao != '' AND CAST(icao AS INTEGER) > 0;
  `);
}

/**
 * Migration 6: Add message UIDs (204a67756b9a)
 */
function migration06_addMessageUids(db: Database.Database): void {
  logger.info("Applying migration 6: add_message_uids");

  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
    name: string;
  }>;
  const hasUid = columns.some((col) => col.name === "uid");

  if (hasUid) {
    logger.info("UID column already exists, skipping");
    return;
  }

  db.exec("ALTER TABLE messages ADD COLUMN uid TEXT");

  logger.info("Generating UIDs for existing messages...");
  const messages = db
    .prepare("SELECT id FROM messages WHERE uid IS NULL")
    .all() as Array<{
    id: number;
  }>;

  logger.info(`Processing ${messages.length} messages...`);

  const updateStmt = db.prepare("UPDATE messages SET uid = ? WHERE id = ?");

  // Wrap all updates in a single transaction for massive performance improvement
  const updateAll = db.transaction(() => {
    for (const msg of messages) {
      updateStmt.run(randomUUID(), msg.id);
    }
  });

  updateAll();

  logger.info("Creating unique index on uid column...");
  db.exec("CREATE UNIQUE INDEX ix_messages_uid ON messages(uid)");
}

/**
 * Migration 7: Create alert_matches table (171fe2c07bd9)
 */
function migration07_createAlertMatches(db: Database.Database): void {
  logger.info("Applying migration 7: create_alert_matches_table");

  const hasAlertMatches = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alert_matches'",
    )
    .get();

  if (hasAlertMatches) {
    logger.info("alert_matches table already exists, skipping");
    return;
  }

  // Wrap in transaction
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE alert_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_uid TEXT NOT NULL,
        term TEXT NOT NULL,
        match_type TEXT NOT NULL,
        matched_at INTEGER NOT NULL
      );
      CREATE INDEX ix_alert_matches_message_uid ON alert_matches(message_uid);
    `);

    const hasMessagesSaved = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_saved'",
      )
      .get();

    if (hasMessagesSaved) {
      logger.info("Dropping old messages_saved table");
      db.exec("DROP TABLE messages_saved");
    }
  });

  migrate();
}

/**
 * Migration 8: Final optimization (40fd0618348d)
 */
function migration08_finalOptimization(db: Database.Database): void {
  logger.info("Applying migration 8: final_v4_optimization");

  // 1. Add aircraft_id column for future aircraft tracking
  logger.info("Adding aircraft_id column for future use...");
  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
    name: string;
  }>;
  const hasAircraftId = columns.some((col) => col.name === "aircraft_id");

  if (!hasAircraftId) {
    db.exec("ALTER TABLE messages ADD COLUMN aircraft_id TEXT");
    db.exec("CREATE INDEX ix_messages_aircraft_id ON messages(aircraft_id)");
    logger.info("✓ aircraft_id column added");
  } else {
    logger.info("aircraft_id column already exists, skipping");
  }

  // 2. Create composite indexes for query optimization
  logger.info("Creating composite indexes for query optimization...");

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index'")
    .all() as Array<{ name: string }>;
  const indexNames = new Set(indexes.map((idx) => idx.name));

  // Wrap index creation in transaction
  const createIndexes = db.transaction(() => {
    // Time + ICAO: "recent messages from this aircraft"
    if (!indexNames.has("ix_messages_time_icao")) {
      db.exec(
        "CREATE INDEX ix_messages_time_icao ON messages(msg_time DESC, icao)",
      );
    }

    // Tail + Flight: "find messages by tail and flight number"
    if (!indexNames.has("ix_messages_tail_flight")) {
      db.exec("CREATE INDEX ix_messages_tail_flight ON messages(tail, flight)");
    }

    // Departure + Destination: route searches
    if (!indexNames.has("ix_messages_depa_dsta")) {
      db.exec("CREATE INDEX ix_messages_depa_dsta ON messages(depa, dsta)");
    }

    // Message type + Time: filtered time-series queries
    if (!indexNames.has("ix_messages_type_time")) {
      db.exec(
        "CREATE INDEX ix_messages_type_time ON messages(message_type, msg_time DESC)",
      );
    }

    // Alert matches: Term + time for efficient alert browsing
    if (!indexNames.has("ix_alert_matches_term_time")) {
      db.exec(
        "CREATE INDEX ix_alert_matches_term_time ON alert_matches(term, matched_at DESC)",
      );
    }

    // Alert matches: Message UID + Term for checking specific matches
    if (!indexNames.has("ix_alert_matches_uid_term")) {
      db.exec(
        "CREATE INDEX ix_alert_matches_uid_term ON alert_matches(message_uid, term)",
      );
    }
  });

  createIndexes();

  logger.info("✓ Composite indexes created");

  // 3. VACUUM - Reclaim disk space from all previous migrations
  logger.info(
    "Running VACUUM to reclaim disk space (this may take several minutes)...",
  );
  db.exec("VACUUM");
  logger.info("✓ VACUUM complete - database file optimized");

  // 4. ANALYZE - Update query planner statistics
  logger.info("Running ANALYZE to optimize query planning...");
  db.exec("ANALYZE");
  logger.info("✓ ANALYZE complete - query planner statistics updated");

  logger.info("v4 migration complete - database is optimized for production");
}

/**
 * All migrations in order
 */
const MIGRATIONS: MigrationStep[] = [
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
];

/**
 * Run migrations from current version to latest
 */
export function runMigrations(dbPath?: string): void {
  const actualDbPath = dbPath || DB_PATH;
  logger.info("Starting database migrations", { dbPath: actualDbPath });

  const db = new Database(actualDbPath);

  try {
    const currentVersion = getAlembicVersion(db);
    logger.info("Current database version", {
      version: currentVersion || "none",
    });

    let startIndex = 0;
    if (currentVersion) {
      // Database has alembic_version table - find where to start
      startIndex = MIGRATIONS.findIndex((m) => m.revision === currentVersion);
      if (startIndex === -1) {
        throw new Error(`Unknown Alembic version: ${currentVersion}`);
      }
      startIndex++; // Start from next migration
    } else if (!hasAnyTables(db)) {
      // Fresh database - start from beginning
      logger.info("Fresh database detected - will apply all migrations");
      startIndex = 0;
    } else if (isAtInitialMigrationState(db)) {
      // Database matches initial Alembic migration state (e7991f1644b1)
      // Skip migration 1 and start from migration 2
      logger.info(
        "Database matches initial Alembic migration state (e7991f1644b1) - starting from migration 2",
      );
      startIndex = 1;
      // Set alembic version to initial state
      const initialMigration = MIGRATIONS[0];
      if (!initialMigration) {
        throw new Error("No migrations defined");
      }
      setAlembicVersion(db, initialMigration.revision);
    } else {
      throw new Error(
        "Database has tables but structure doesn't match any known migration state. " +
          "Cannot migrate safely. Please check database integrity.",
      );
    }

    for (let i = startIndex; i < MIGRATIONS.length; i++) {
      const migration = MIGRATIONS[i];
      if (!migration) {
        throw new Error(`Migration at index ${i} is undefined`);
      }
      logger.info(`Applying migration ${i + 1}/${MIGRATIONS.length}`, {
        revision: migration.revision,
        name: migration.name,
      });

      migration.upgrade(db);
      setAlembicVersion(db, migration.revision);
    }

    if (startIndex >= MIGRATIONS.length) {
      logger.info("Database is already at latest version", {
        version: LATEST_REVISION,
      });
    } else {
      logger.info("All migrations applied successfully", {
        version: LATEST_REVISION,
      });
    }

    db.close();
  } catch (error) {
    logger.error("Migration failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    db.close();
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

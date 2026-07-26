// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 3: Split freqs table (a589d271a0a4)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-03");

export function migration03_splitFreqsTable(db: Database.Database): void {
  logger.warn("Applying migration 3: split_freqs_table");

  const hasFreqsAcars = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='freqs_acars'",
    )
    .get();

  if (hasFreqsAcars) {
    logger.warn("Frequency tables already split, skipping");
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

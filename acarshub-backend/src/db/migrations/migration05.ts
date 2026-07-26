// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 5: Convert ICAO to hex (3168c906fb9e)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { assertRowOrUndefined } from "../helpers.js";

const logger = createLogger("db:migrate-05");

export function migration05_convertIcaoToHex(db: Database.Database): void {
  logger.warn("Applying migration 5: convert_icao_to_hex");

  const rawSample = db
    .prepare("SELECT icao FROM messages WHERE icao != '' LIMIT 1")
    .get();
  const sample = assertRowOrUndefined<{ icao: string }>(
    rawSample,
    ["icao"],
    "migration05_convertIcaoToHex.sample",
  );

  if (!sample || /^[0-9a-f]+$/i.test(sample.icao)) {
    logger.warn("ICAO values already converted to hex, skipping");
    return;
  }

  logger.warn("Converting ICAO values to hexadecimal...");
  db.exec(`
    UPDATE messages
    SET icao = printf('%06X', CAST(icao AS INTEGER))
    WHERE icao != '' AND CAST(icao AS INTEGER) > 0;
  `);
}

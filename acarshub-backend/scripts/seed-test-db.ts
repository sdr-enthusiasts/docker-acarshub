#!/usr/bin/env tsx
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
 * Generate a seeded SQLite test fixture database from JSONL fixture files.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 5 full-stack integration tests and Phase 4 E2E tests that exercise
 * the real backend (search, alerts, stats charts) need a pre-populated database
 * with a realistic corpus of messages.  This script produces a deterministic
 * `test-fixtures/seed.db` by processing the same JSONL fixture files used by
 * the frontend unit tests, running them through the production message pipeline
 * (formatAcarsMessage → addMessageFromJson).  The result is committed and
 * never changes unless the JSONL fixtures or this script change.
 *
 * WHAT IT SEEDS
 * -------------
 * 1. Messages  – all non-empty lines from the three JSONL fixture files
 *    (ACARS, VDLM2, HFDL) with timestamps normalised to a fixed anchor window
 *    so they always fall within a consistent range for display tests.
 * 2. Alert terms – a small set of terms that are known to match messages in
 *    the fixture corpus, so the Alerts page has data to display.
 * 3. Alert matches – created automatically by addMessageFromJson when terms
 *    are loaded into the in-memory cache before insertion.
 * 4. Timeseries stats – 30 days of synthetic data at four resolutions
 *    (1min, 5min, 1hour, 6hour) using deterministic sine/cosine waves,
 *    anchored to the same fixed time window.  This ensures the Stats page
 *    charts render real data in integration tests.
 * 5. Frequency stats – seeded from the messages themselves (handled
 *    automatically by addMessageFromJson via updateFrequencies, which is
 *    mocked in unit tests but real here).
 *
 * DESIGN DECISIONS
 * ----------------
 * - Timestamps are re-based to ANCHOR_UNIX so the corpus always ends at a
 *   known point.  Tests that check for "recent" messages can compare against
 *   ANCHOR_UNIX + CORPUS_DURATION_S.
 * - Alert terms are chosen from tails/flights/text that appear multiple times
 *   in the fixture files so there will always be several alert matches.
 * - The script is idempotent: it deletes and recreates seed.db on every run.
 *
 * USAGE
 * -----
 *   just seed-test-db
 * or directly:
 *   cd acarshub-backend && npx tsx scripts/seed-test-db.ts
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = resolve(__dirname, "../../test-fixtures");
const SEED_DB_PATH = resolve(FIXTURES_DIR, "seed.db");

// JSONL fixture files (relative to the monorepo root)
const JSONL_DIR = resolve(__dirname, "../../acarshub-react/tests/fixtures");

// ---------------------------------------------------------------------------
// Time anchor
// ---------------------------------------------------------------------------

/**
 * The seed database timestamps are anchored so that the corpus always ends
 * at ANCHOR_END_UNIX.  The three JSONL files collectively contain messages
 * that span roughly 30 minutes; we spread them across the last 24 hours of
 * the anchor window.
 *
 * ANCHOR_END_UNIX = 2024-06-01 12:00:00 UTC
 * Chosen to be far enough in the past that it is stable but recent enough
 * to remain within typical "display last 30 days" windows.
 */
const ANCHOR_END_UNIX = 1717243200; // 2024-06-01 12:00:00 UTC
const CORPUS_DURATION_S = 86400; // spread 24 h before anchor
const ANCHOR_START_UNIX = ANCHOR_END_UNIX - CORPUS_DURATION_S;

// ---------------------------------------------------------------------------
// Alert terms
// ---------------------------------------------------------------------------

/**
 * Alert terms that are known to match messages in the JSONL fixture files.
 *
 * Chosen from recurring tail/flight values visible in raw-acars-messages.jsonl:
 *   - WN4899  – Southwest flight that appears multiple times
 *   - N8560Z  – tail that appears multiple times paired with WN4899
 *   - XA0001  – flight that appears with tail N265RX
 *
 * These are set in the alert_stats table so addMessageFromJson matches them
 * when processing messages.
 */
const SEED_ALERT_TERMS = ["WN4899", "N8560Z", "XA0001"];

/**
 * Ignore terms – suppress a common substring that would otherwise produce
 * spurious matches, demonstrating the ignore-term feature.
 */
const SEED_IGNORE_TERMS: string[] = [];

// ---------------------------------------------------------------------------
// Timeseries stats configuration
// ---------------------------------------------------------------------------

/**
 * Resolutions and their bucket sizes in seconds.
 * We generate enough buckets to cover 30 days at each resolution.
 */
const TIMESERIES_RESOLUTIONS = [
  { resolution: "1min" as const, stepS: 60, durationDays: 1 },
  { resolution: "5min" as const, stepS: 300, durationDays: 7 },
  { resolution: "1hour" as const, stepS: 3600, durationDays: 30 },
  { resolution: "6hour" as const, stepS: 21600, durationDays: 90 },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a JSONL file and return parsed objects, skipping blank lines and
 * parse errors.
 */
function readJsonlFile(filePath: string): Array<Record<string, unknown>> {
  if (!existsSync(filePath)) {
    console.warn(`  ⚠  JSONL file not found, skipping: ${filePath}`);
    return [];
  }

  const lines = readFileSync(filePath, "utf-8").split("\n");
  const results: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      results.push(parsed);
    } catch {
      // Skip malformed lines silently
    }
  }

  return results;
}

/**
 * Deterministic timeseries value generator.
 *
 * Mirrors the same wave pattern used by generate-test-rrd.ts so that both
 * fixtures produce visually consistent charts.
 *
 * @param minuteIndex  Minutes since ANCHOR_START_UNIX
 */
function timeseriesValues(minuteIndex: number): {
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
} {
  const phase = (2 * Math.PI * minuteIndex) / 360;
  const acars = Math.max(1, Math.round(10 + 5 * Math.sin(phase)));
  const vdlm = Math.max(1, Math.round(20 + 10 * Math.cos(phase)));
  const hfdl = Math.max(0, Math.round(5.5 + 2.5 * Math.sin(phase + 1)));
  const imsl = Math.max(0, Math.round(1 + Math.sin(phase + 2)));
  const irdm = minuteIndex % 120 === 0 ? 1 : 0;
  const total = acars + vdlm + hfdl + imsl + irdm;
  const error = minuteIndex % 1000 === 0 ? 1 : 0;
  return { acars, vdlm, hfdl, imsl, irdm, total, error };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Ensure output directory
  // -------------------------------------------------------------------------
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    console.log(`Created directory: ${FIXTURES_DIR}`);
  }

  // -------------------------------------------------------------------------
  // 2. Remove any previous seed.db
  // -------------------------------------------------------------------------
  if (existsSync(SEED_DB_PATH)) {
    unlinkSync(SEED_DB_PATH);
    console.log("Removed existing seed.db");
  }

  // -------------------------------------------------------------------------
  // 3. Run migrations against seed.db
  //    This creates all tables and FTS virtual tables.
  // -------------------------------------------------------------------------
  console.log("Running database migrations...");
  process.env.ACARSHUB_DB = SEED_DB_PATH;

  // Dynamic imports must come AFTER setting ACARSHUB_DB so the module-level
  // DB_PATH constant picks up the correct path.
  const { runMigrations } = await import("../src/db/migrate.js");
  runMigrations(SEED_DB_PATH);
  console.log("  ✓ Migrations complete");

  // -------------------------------------------------------------------------
  // 4. Open the database connection
  // -------------------------------------------------------------------------
  const { initDatabase, closeDatabase, getDatabase } = await import(
    "../src/db/client.js"
  );
  initDatabase(SEED_DB_PATH);
  console.log("  ✓ Database connection opened");

  // -------------------------------------------------------------------------
  // 5. Import DB helpers and initialise in-memory state
  // -------------------------------------------------------------------------
  const {
    initializeAlertCache,
    initializeMessageCounts,
    initializeMessageCounters,
    setAlertTerms,
    setAlertIgnore,
  } = await import("../src/db/index.js");

  initializeMessageCounts();
  initializeMessageCounters();

  // -------------------------------------------------------------------------
  // 6. Seed alert terms BEFORE inserting messages so addMessageFromJson
  //    can match them in real-time (populates the in-memory alert cache).
  // -------------------------------------------------------------------------
  console.log(`Seeding ${SEED_ALERT_TERMS.length} alert terms...`);
  setAlertTerms(SEED_ALERT_TERMS);
  setAlertIgnore(SEED_IGNORE_TERMS);
  initializeAlertCache();
  console.log(`  ✓ Alert terms: ${SEED_ALERT_TERMS.join(", ")}`);

  // -------------------------------------------------------------------------
  // 7. Load and process JSONL fixture files
  // -------------------------------------------------------------------------
  const { formatAcarsMessage } = await import("../src/formatters/index.js");
  const { addMessageFromJson } = await import(
    "../src/db/queries/messageTransform.js"
  );

  type DecoderEntry = {
    file: string;
    rawType: "ACARS" | "VDLM2" | "HFDL";
    dbType: string;
  };

  const decoders: DecoderEntry[] = [
    {
      file: resolve(JSONL_DIR, "raw-acars-messages.jsonl"),
      rawType: "ACARS",
      dbType: "ACARS",
    },
    {
      file: resolve(JSONL_DIR, "raw-vdlm2-messages.jsonl"),
      rawType: "VDLM2",
      dbType: "VDL-M2",
    },
    {
      file: resolve(JSONL_DIR, "raw-hfdl-messages.jsonl"),
      rawType: "HFDL",
      dbType: "HFDL",
    },
  ];

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalAlertMatches = 0;

  for (const decoder of decoders) {
    const rawMessages = readJsonlFile(decoder.file);
    console.log(
      `Processing ${rawMessages.length} ${decoder.rawType} messages...`,
    );

    let inserted = 0;
    let skipped = 0;
    let alertMatches = 0;

    for (let i = 0; i < rawMessages.length; i++) {
      const rawMsg = rawMessages[i];

      // Re-base the timestamp: spread messages evenly across the anchor window
      // so no matter when the tests run, the messages fall within a known range.
      const normalizedTs =
        ANCHOR_START_UNIX +
        Math.floor(
          (i / Math.max(rawMessages.length - 1, 1)) * CORPUS_DURATION_S,
        );

      // Inject normalised timestamp.  The exact field name depends on the
      // message type (ACARS: "timestamp", VDLM2: vdl2.t.sec, HFDL: hfdl.t.sec).
      // formatAcarsMessage extracts the timestamp from the appropriate nested
      // path, so we patch the canonical location for each type here.
      if (decoder.rawType === "ACARS") {
        rawMsg.timestamp = normalizedTs;
      } else if (decoder.rawType === "VDLM2") {
        const vdl2 = rawMsg.vdl2 as Record<string, unknown> | undefined;
        if (
          vdl2 !== null &&
          vdl2 !== undefined &&
          typeof vdl2.t === "object" &&
          vdl2.t !== null
        ) {
          (vdl2.t as Record<string, unknown>).sec = normalizedTs;
        }
      } else if (decoder.rawType === "HFDL") {
        const hfdl = rawMsg.hfdl as Record<string, unknown> | undefined;
        if (
          hfdl !== null &&
          hfdl !== undefined &&
          typeof hfdl.t === "object" &&
          hfdl.t !== null
        ) {
          (hfdl.t as Record<string, unknown>).sec = normalizedTs;
        }
      }

      // Format through the production formatter (normalises VDLM2/HFDL structure)
      const formatted = formatAcarsMessage(rawMsg);

      if (!formatted) {
        skipped++;
        continue;
      }

      // Insert via production message transform (handles alert matching,
      // frequency stats, message counts, FTS indexing, etc.)
      try {
        const alertMeta = addMessageFromJson(
          decoder.dbType,
          formatted as Parameters<typeof addMessageFromJson>[1],
        );
        inserted++;
        if (alertMeta.matched) {
          alertMatches++;
        }
      } catch (err) {
        skipped++;
        if (process.env.SEED_VERBOSE === "1") {
          console.warn(
            `    Skipped message ${i}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    console.log(
      `  ✓ ${decoder.rawType}: ${inserted} inserted, ${skipped} skipped, ${alertMatches} alert matches`,
    );
    totalInserted += inserted;
    totalSkipped += skipped;
    totalAlertMatches += alertMatches;
  }

  console.log(
    `\nTotal messages: ${totalInserted} inserted, ${totalSkipped} skipped`,
  );
  console.log(`Total alert matches: ${totalAlertMatches}`);

  // -------------------------------------------------------------------------
  // 8. Seed timeseries statistics
  //    Generate deterministic data at all four resolutions so the Stats page
  //    charts have data to render in integration tests.
  // -------------------------------------------------------------------------
  console.log("\nSeeding timeseries statistics...");

  const db = getDatabase();

  // Import schema for direct inserts
  const { timeseriesStats } = await import("../src/db/schema.js");

  let timeseriesTotal = 0;

  for (const { resolution, stepS, durationDays } of TIMESERIES_RESOLUTIONS) {
    const durationS = durationDays * 86400;
    const bucketCount = Math.ceil(durationS / stepS);
    const startTs = ANCHOR_END_UNIX - durationS;

    const rows: Array<{
      timestamp: number;
      resolution: "1min" | "5min" | "1hour" | "6hour";
      acarsCount: number;
      vdlmCount: number;
      hfdlCount: number;
      imslCount: number;
      irdmCount: number;
      totalCount: number;
      errorCount: number;
    }> = [];

    for (let b = 0; b < bucketCount; b++) {
      const ts = startTs + b * stepS;
      // Convert timestamp to a minute index for the wave function
      const minuteIndex = Math.floor((ts - ANCHOR_START_UNIX) / 60);
      const v = timeseriesValues(minuteIndex);
      rows.push({
        timestamp: ts,
        resolution,
        acarsCount: v.acars,
        vdlmCount: v.vdlm,
        hfdlCount: v.hfdl,
        imslCount: v.imsl,
        irdmCount: v.irdm,
        totalCount: v.total,
        errorCount: v.error,
      });
    }

    // Insert in batches of 500 to avoid SQLite statement length limits
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      db.insert(timeseriesStats)
        .values(rows.slice(i, i + BATCH))
        .run();
    }

    timeseriesTotal += rows.length;
    console.log(
      `  ✓ ${resolution}: ${rows.length} buckets (${durationDays}d, step ${stepS}s)`,
    );
  }

  console.log(`Total timeseries rows: ${timeseriesTotal}`);

  // -------------------------------------------------------------------------
  // 9. Verify the database
  // -------------------------------------------------------------------------
  console.log("\nVerifying seed database...");

  const { getRowCount } = await import("../src/db/queries/messages.js");
  const { count: msgCount, size: dbSize } = getRowCount();
  console.log(
    `  ✓ messages table: ${msgCount} rows (${dbSize !== null ? `${(dbSize / 1024).toFixed(1)} KB` : "size unknown"})`,
  );

  const { getAlertCounts } = await import("../src/db/queries/alerts.js");
  const alertCountRows = getAlertCounts();
  console.log(
    `  ✓ alert_stats: ${alertCountRows.length} terms — ${alertCountRows.map((r) => `${r.term}(${r.count})`).join(", ")}`,
  );

  // Verify timeseries rows
  const tsRows = db.select().from(timeseriesStats).all();
  console.log(`  ✓ timeseries_stats: ${tsRows.length} rows`);

  // -------------------------------------------------------------------------
  // 10. Close database and write metadata sidecar
  // -------------------------------------------------------------------------
  closeDatabase();

  const meta = {
    generated: new Date().toISOString(),
    anchorStartUnix: ANCHOR_START_UNIX,
    anchorEndUnix: ANCHOR_END_UNIX,
    anchorStartIso: new Date(ANCHOR_START_UNIX * 1000).toISOString(),
    anchorEndIso: new Date(ANCHOR_END_UNIX * 1000).toISOString(),
    messages: {
      total: totalInserted,
      skipped: totalSkipped,
      alertMatches: totalAlertMatches,
    },
    alertTerms: SEED_ALERT_TERMS,
    ignoreTerms: SEED_IGNORE_TERMS,
    timeseries: {
      total: timeseriesTotal,
      resolutions: TIMESERIES_RESOLUTIONS.map(
        ({ resolution, stepS, durationDays }) => ({
          resolution,
          stepSeconds: stepS,
          durationDays,
          buckets: Math.ceil((durationDays * 86400) / stepS),
        }),
      ),
    },
  };

  const metaPath = resolve(FIXTURES_DIR, "seed.db.meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  console.log(`\n  ✓ Metadata written to ${metaPath}`);

  console.log("\n✅ seed.db generated successfully.");
  console.log(`   Path : ${SEED_DB_PATH}`);
  console.log(
    "   Next : commit test-fixtures/seed.db and test-fixtures/seed.db.meta.json",
  );
}

run().catch((err: unknown) => {
  console.error("❌ Failed to generate seed database:");
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

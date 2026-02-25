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
 * Unit tests for the Prometheus metrics service (src/services/metrics.ts)
 *
 * Strategy:
 * - Spin up an in-memory SQLite database with the required tables created
 *   manually (the same pattern used by stats-writer.test.ts).
 * - Seed the database with known values so assertions are deterministic.
 * - Call collectMetrics() and verify:
 *     1. The output is valid Prometheus text format (HELP/TYPE/sample lines).
 *     2. Specific metric names appear in the output.
 *     3. Specific label/value pairs appear in the output.
 *     4. Numbers are rendered correctly.
 * - Test edge cases: empty database, null values, special chars in labels.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase, initDatabase } from "../../db/index.js";
import { collectMetrics, resetMetricsForTesting } from "../metrics.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pull all sample lines for a given metric name out of the output.
 * A sample line looks like:  metric_name[{...}] <value>
 */
function getSamples(output: string, metricName: string): string[] {
  return output
    .split("\n")
    .filter(
      (line) =>
        (line.startsWith(`${metricName}{`) ||
          line.startsWith(`${metricName} `)) &&
        !line.startsWith("#"),
    );
}

/**
 * Return true if the output contains a HELP comment for the given metric.
 */
function hasHelp(output: string, metricName: string): boolean {
  return output.includes(`# HELP ${metricName} `);
}

/**
 * Return true if the output contains a TYPE comment for the given metric.
 */
function hasType(output: string, metricName: string, type: string): boolean {
  return output.includes(`# TYPE ${metricName} ${type}`);
}

/**
 * Parse the numeric value from a sample line (last whitespace-delimited token).
 */
function sampleValue(line: string): number {
  const parts = line.trim().split(/\s+/);
  return Number(parts[parts.length - 1]);
}

// ---------------------------------------------------------------------------
// Schema bootstrap (mirrors stats-writer.test.ts pattern)
// ---------------------------------------------------------------------------

function createTables(): void {
  const db = getDatabase();

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      uid TEXT NOT NULL UNIQUE,
      message_type TEXT NOT NULL,
      msg_time INTEGER NOT NULL,
      station_id TEXT NOT NULL DEFAULT '',
      toaddr TEXT NOT NULL DEFAULT '',
      fromaddr TEXT NOT NULL DEFAULT '',
      depa TEXT NOT NULL DEFAULT '',
      dsta TEXT NOT NULL DEFAULT '',
      eta TEXT NOT NULL DEFAULT '',
      gtout TEXT NOT NULL DEFAULT '',
      gtin TEXT NOT NULL DEFAULT '',
      wloff TEXT NOT NULL DEFAULT '',
      wlin TEXT NOT NULL DEFAULT '',
      lat TEXT NOT NULL DEFAULT '',
      lon TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      msg_text TEXT NOT NULL DEFAULT '',
      tail TEXT NOT NULL DEFAULT '',
      flight TEXT NOT NULL DEFAULT '',
      icao TEXT NOT NULL DEFAULT '',
      freq TEXT NOT NULL DEFAULT '',
      ack TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      block_id TEXT NOT NULL DEFAULT '',
      msgno TEXT NOT NULL DEFAULT '',
      is_response TEXT NOT NULL DEFAULT '',
      is_onground TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      libacars TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      aircraft_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS count (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      total INTEGER,
      errors INTEGER,
      good INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nonlogged_count (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      errors INTEGER,
      good INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS freqs_acars (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      freq TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS freqs_vdlm2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      freq TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS freqs_hfdl (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      freq TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS freqs_imsl (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      freq TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS freqs_irdm (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      freq TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_acars (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      level REAL,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_vdlm2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      level REAL,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_hfdl (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      level REAL,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_imsl (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      level REAL,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_irdm (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      level REAL,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alert_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      term TEXT,
      count INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ignore_alert_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      term TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alert_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      message_uid TEXT NOT NULL,
      term TEXT NOT NULL,
      match_type TEXT NOT NULL,
      matched_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS timeseries_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      timestamp INTEGER NOT NULL,
      resolution TEXT NOT NULL,
      acars_count INTEGER DEFAULT 0 NOT NULL,
      vdlm_count INTEGER DEFAULT 0 NOT NULL,
      hfdl_count INTEGER DEFAULT 0 NOT NULL,
      imsl_count INTEGER DEFAULT 0 NOT NULL,
      irdm_count INTEGER DEFAULT 0 NOT NULL,
      total_count INTEGER DEFAULT 0 NOT NULL,
      error_count INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectMetrics", () => {
  beforeEach(() => {
    resetMetricsForTesting();
    initDatabase(":memory:");
    createTables();
  });

  afterEach(() => {
    closeDatabase();
    resetMetricsForTesting();
  });

  // -------------------------------------------------------------------------
  // Output structure
  // -------------------------------------------------------------------------

  describe("output structure", () => {
    it("should return a non-empty string ending with a newline", async () => {
      const output = await collectMetrics();
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
      expect(output.endsWith("\n")).toBe(true);
    });

    it("should include HELP and TYPE lines for all expected metrics", async () => {
      const output = await collectMetrics();

      const expectedGauges = [
        "acarshub_database_messages_total",
        "acarshub_database_size_bytes",
        "acarshub_database_non_empty_messages_total",
        "acarshub_database_non_empty_errors_total",
        "acarshub_database_empty_messages_total",
        "acarshub_database_empty_errors_total",
        "acarshub_rrd_acars_messages_per_minute",
        "acarshub_rrd_vdlm_messages_per_minute",
        "acarshub_rrd_total_messages_per_minute",
        "acarshub_rrd_error_messages_per_minute",
        "acarshub_rrd_hfdl_messages_per_minute",
        "acarshub_rrd_imsl_messages_per_minute",
        "acarshub_rrd_irdm_messages_per_minute",
        "acarshub_signal_level_distribution",
        "acarshub_frequency_distribution",
        "acarshub_alert_terms_configured",
        "acarshub_alert_term_matches",
        "acarshub_alert_saved_messages_total",
        "acarshub_application_info",
      ];

      for (const name of expectedGauges) {
        expect(hasHelp(output, name), `missing # HELP for ${name}`).toBe(true);
        expect(
          hasType(output, name, "gauge"),
          `missing # TYPE gauge for ${name}`,
        ).toBe(true);
      }
    });

    it("should not contain any lines that are not comments, blank, or valid samples", async () => {
      const output = await collectMetrics();
      const lines = output.split("\n").filter((l) => l.trim() !== "");

      for (const line of lines) {
        const isComment = line.startsWith("#");
        // A sample line must start with a letter (metric name) and contain a
        // space or opening brace after the name.
        const isSample = /^[a-zA-Z_][a-zA-Z0-9_]*[{ ]/.test(line);
        expect(isComment || isSample, `unexpected line: ${line}`).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Database metrics with empty database
  // -------------------------------------------------------------------------

  describe("database metrics (empty database)", () => {
    it("should report zero messages when table is empty", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_database_messages_total");
      expect(samples).toHaveLength(1);
      expect(sampleValue(samples[0])).toBe(0);
    });

    it("should report zero for non-empty and empty message counts", async () => {
      const output = await collectMetrics();

      const nonEmpty = getSamples(
        output,
        "acarshub_database_non_empty_messages_total",
      );
      expect(sampleValue(nonEmpty[0])).toBe(0);

      const empty = getSamples(
        output,
        "acarshub_database_empty_messages_total",
      );
      expect(sampleValue(empty[0])).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Database metrics with seeded data
  // -------------------------------------------------------------------------

  describe("database metrics (seeded data)", () => {
    beforeEach(() => {
      const db = getDatabase();
      // Seed count table (non-empty messages)
      db.run("INSERT INTO count (total, errors, good) VALUES (1000, 50, 950)");
      // Seed nonlogged_count table (empty messages)
      db.run("INSERT INTO nonlogged_count (errors, good) VALUES (30, 120)");
    });

    it("should report correct non-empty total", async () => {
      const output = await collectMetrics();
      const samples = getSamples(
        output,
        "acarshub_database_non_empty_messages_total",
      );
      expect(sampleValue(samples[0])).toBe(1000);
    });

    it("should report correct non-empty errors", async () => {
      const output = await collectMetrics();
      const samples = getSamples(
        output,
        "acarshub_database_non_empty_errors_total",
      );
      expect(sampleValue(samples[0])).toBe(50);
    });

    it("should report correct empty total (good + errors)", async () => {
      const output = await collectMetrics();
      const samples = getSamples(
        output,
        "acarshub_database_empty_messages_total",
      );
      // 30 errors + 120 good = 150
      expect(sampleValue(samples[0])).toBe(150);
    });

    it("should report correct empty errors", async () => {
      const output = await collectMetrics();
      const samples = getSamples(
        output,
        "acarshub_database_empty_errors_total",
      );
      expect(sampleValue(samples[0])).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // Timeseries / RRD metrics
  // -------------------------------------------------------------------------

  describe("timeseries metrics", () => {
    it("should report zero when no timeseries data exists", async () => {
      const output = await collectMetrics();

      for (const metric of [
        "acarshub_rrd_acars_messages_per_minute",
        "acarshub_rrd_vdlm_messages_per_minute",
        "acarshub_rrd_hfdl_messages_per_minute",
        "acarshub_rrd_imsl_messages_per_minute",
        "acarshub_rrd_irdm_messages_per_minute",
        "acarshub_rrd_total_messages_per_minute",
        "acarshub_rrd_error_messages_per_minute",
      ]) {
        const samples = getSamples(output, metric);
        expect(samples).toHaveLength(1);
        expect(sampleValue(samples[0])).toBe(0);
      }
    });

    it("should report values from the latest timeseries row", async () => {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);

      // Insert an older row that should NOT be used.
      db.run(
        `INSERT INTO timeseries_stats
           (timestamp, resolution, acars_count, vdlm_count, hfdl_count,
            imsl_count, irdm_count, total_count, error_count, created_at)
         VALUES (${now - 120}, '1min', 1, 1, 1, 1, 1, 5, 1, ${Date.now()})`,
      );

      // Insert the latest row.
      db.run(
        `INSERT INTO timeseries_stats
           (timestamp, resolution, acars_count, vdlm_count, hfdl_count,
            imsl_count, irdm_count, total_count, error_count, created_at)
         VALUES (${now - 60}, '1min', 11, 15, 9, 0, 0, 35, 0, ${Date.now()})`,
      );

      const output = await collectMetrics();

      expect(
        sampleValue(
          getSamples(output, "acarshub_rrd_acars_messages_per_minute")[0],
        ),
      ).toBe(11);
      expect(
        sampleValue(
          getSamples(output, "acarshub_rrd_vdlm_messages_per_minute")[0],
        ),
      ).toBe(15);
      expect(
        sampleValue(
          getSamples(output, "acarshub_rrd_hfdl_messages_per_minute")[0],
        ),
      ).toBe(9);
      expect(
        sampleValue(
          getSamples(output, "acarshub_rrd_total_messages_per_minute")[0],
        ),
      ).toBe(35);
      expect(
        sampleValue(
          getSamples(output, "acarshub_rrd_error_messages_per_minute")[0],
        ),
      ).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Signal level distribution
  // -------------------------------------------------------------------------

  describe("signal level metrics", () => {
    it("should emit the metric header even when no levels are recorded", async () => {
      const output = await collectMetrics();
      expect(hasHelp(output, "acarshub_signal_level_distribution")).toBe(true);
    });

    it("should emit labeled samples for seeded signal levels", async () => {
      const db = getDatabase();
      db.run("INSERT INTO level_acars (level, count) VALUES (-10.5, 42)");
      db.run("INSERT INTO level_vdlm2 (level, count) VALUES (-12.0, 17)");

      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_signal_level_distribution");

      // Should have exactly 2 samples.
      expect(samples).toHaveLength(2);

      const acarsLine = samples.find((l) => l.includes('type="ACARS"'));
      expect(acarsLine).toBeDefined();
      expect(acarsLine).toContain('level="-10.5"');
      expect(sampleValue(acarsLine as string)).toBe(42);

      const vdlmLine = samples.find((l) => l.includes('type="VDL-M2"'));
      expect(vdlmLine).toBeDefined();
      expect(sampleValue(vdlmLine as string)).toBe(17);
    });
  });

  // -------------------------------------------------------------------------
  // Frequency distribution
  // -------------------------------------------------------------------------

  describe("frequency distribution metrics", () => {
    it("should emit an empty frequency metric when no frequencies are recorded", async () => {
      const output = await collectMetrics();
      expect(hasHelp(output, "acarshub_frequency_distribution")).toBe(true);
      const samples = getSamples(output, "acarshub_frequency_distribution");
      expect(samples).toHaveLength(0);
    });

    it("should emit labeled samples for seeded frequencies", async () => {
      const db = getDatabase();
      db.run("INSERT INTO freqs_acars (freq, count) VALUES ('130.025', 1000)");
      db.run("INSERT INTO freqs_vdlm2 (freq, count) VALUES ('136.975', 500)");
      db.run("INSERT INTO freqs_hfdl  (freq, count) VALUES ('8.927', 250)");

      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_frequency_distribution");

      expect(samples).toHaveLength(3);

      const acarsLine = samples.find(
        (l) => l.includes('frequency="130.025"') && l.includes('type="ACARS"'),
      );
      expect(acarsLine).toBeDefined();
      expect(sampleValue(acarsLine as string)).toBe(1000);

      const vdlmLine = samples.find(
        (l) => l.includes('frequency="136.975"') && l.includes('type="VDL-M2"'),
      );
      expect(vdlmLine).toBeDefined();
      expect(sampleValue(vdlmLine as string)).toBe(500);

      const hfdlLine = samples.find(
        (l) => l.includes('frequency="8.927"') && l.includes('type="HFDL"'),
      );
      expect(hfdlLine).toBeDefined();
      expect(sampleValue(hfdlLine as string)).toBe(250);
    });
  });

  // -------------------------------------------------------------------------
  // Alert metrics
  // -------------------------------------------------------------------------

  describe("alert metrics", () => {
    it("should report zero configured terms when none are set", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_alert_terms_configured");
      expect(sampleValue(samples[0])).toBe(0);
    });

    it("should report zero saved messages when alert_matches is empty", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_alert_saved_messages_total");
      expect(sampleValue(samples[0])).toBe(0);
    });

    it("should report correct configured term count and per-term values", async () => {
      const db = getDatabase();
      db.run("INSERT INTO alert_stats (term, count) VALUES ('EMERGENCY', 42)");
      db.run("INSERT INTO alert_stats (term, count) VALUES ('MAYDAY', 0)");
      db.run("INSERT INTO alert_stats (term, count) VALUES ('TURBULENCE', 7)");

      const output = await collectMetrics();

      // 3 terms configured
      const configuredSamples = getSamples(
        output,
        "acarshub_alert_terms_configured",
      );
      expect(sampleValue(configuredSamples[0])).toBe(3);

      // Per-term samples
      const termSamples = getSamples(output, "acarshub_alert_term_matches");
      expect(termSamples).toHaveLength(3);

      const emergencyLine = termSamples.find((l) =>
        l.includes('term="EMERGENCY"'),
      );
      expect(emergencyLine).toBeDefined();
      expect(sampleValue(emergencyLine as string)).toBe(42);

      const maydayLine = termSamples.find((l) => l.includes('term="MAYDAY"'));
      expect(maydayLine).toBeDefined();
      expect(sampleValue(maydayLine as string)).toBe(0);
    });

    it("should report total count of saved alert matches", async () => {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.run(
        `INSERT INTO alert_matches (message_uid, term, match_type, matched_at)
         VALUES ('uid-1', 'EMERGENCY', 'text', ${now})`,
      );
      db.run(
        `INSERT INTO alert_matches (message_uid, term, match_type, matched_at)
         VALUES ('uid-2', 'TURBULENCE', 'text', ${now})`,
      );
      db.run(
        `INSERT INTO alert_matches (message_uid, term, match_type, matched_at)
         VALUES ('uid-1', 'MAYDAY', 'text', ${now})`,
      );

      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_alert_saved_messages_total");
      // 3 rows in alert_matches
      expect(sampleValue(samples[0])).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Application info
  // -------------------------------------------------------------------------

  describe("application info metric", () => {
    it("should always have a value of 1", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_application_info");
      expect(samples).toHaveLength(1);
      expect(sampleValue(samples[0])).toBe(1);
    });

    it("should include version label", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_application_info");
      expect(samples[0]).toContain('version="');
    });

    it("should include decoder-enabled labels with Python-style capitalization", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_application_info");
      const line = samples[0];

      // Python renders booleans as "True"/"False" — verify capitalized format
      // so existing Grafana label matchers work without modification.
      expect(line).toMatch(/acars_enabled="(True|False)"/);
      expect(line).toMatch(/vdlm_enabled="(True|False)"/);
      expect(line).toMatch(/hfdl_enabled="(True|False)"/);
      expect(line).toMatch(/imsl_enabled="(True|False)"/);
      expect(line).toMatch(/irdm_enabled="(True|False)"/);
      expect(line).toMatch(/adsb_enabled="(True|False)"/);
    });

    it("should include arch label", async () => {
      const output = await collectMetrics();
      const samples = getSamples(output, "acarshub_application_info");
      expect(samples[0]).toContain("arch=");
    });
  });

  // -------------------------------------------------------------------------
  // Label escaping
  // -------------------------------------------------------------------------

  describe("label value escaping", () => {
    it("should escape double quotes in label values", async () => {
      const db = getDatabase();
      // Insert a term that contains a double-quote character.
      db.run(`INSERT INTO alert_stats (term, count) VALUES ('SAY "HELLO"', 1)`);

      const output = await collectMetrics();
      const termSamples = getSamples(output, "acarshub_alert_term_matches");
      const line = termSamples.find((l) => l.includes("HELLO"));
      expect(line).toBeDefined();
      // The quote inside the label value must be escaped.
      expect(line).toContain('\\"HELLO\\"');
    });

    it("should escape backslashes in label values", async () => {
      const db = getDatabase();
      db.run(`INSERT INTO alert_stats (term, count) VALUES ('A\\B', 0)`);

      const output = await collectMetrics();
      const termSamples = getSamples(output, "acarshub_alert_term_matches");
      const line = termSamples.find((l) => l.includes("A\\\\B"));
      expect(line).toBeDefined();
    });
  });
});

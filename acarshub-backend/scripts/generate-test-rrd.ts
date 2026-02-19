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
 * Generate a test RRD fixture file for the RRD migration integration tests.
 *
 * WHY THIS EXISTS
 * ---------------
 * The integration tests in `rrd-migration.integration.test.ts` were permanently
 * skipped because each test independently called `createTestRrdFile()`, which
 * spawns `rrdtool update` with 120+ data points.  Six tests × ~20 s each pushed
 * total wall-clock time well past the acceptable CI threshold.
 *
 * The fix is to generate the fixture ONCE and commit the binary.  Every test
 * then copies the committed file into a temp path in its `beforeAll` block
 * instead of synthesising its own data — bringing total RRD I/O from ~2 minutes
 * to under 100 ms.
 *
 * FIXTURE DESIGN
 * --------------
 * - 7 data sources matching the production RRD schema:
 *     ACARS, VDLM, TOTAL, ERROR, HFDL, IMSL, IRDM
 * - 4 RRA (Round-Robin Archives):
 *     1-min  resolution, 4 320-row capacity  (covers > 72 h at 1-min step)
 *     5-min  resolution, 2 016-row capacity  (covers > 7 days)
 *     1-hour resolution, 4 380-row capacity  (covers ~6 months)
 *     6-hour resolution, 1 460-row capacity  (covers ~1 year)
 * - 72 hours of 1-minute data inserted as a SINGLE `rrdtool update` invocation
 *   (avoids spawning 4 320 child processes).
 * - Deterministic values based on simple sine/cosine waves so assertions in
 *   the tests can reason about the data without hard-coding exact numbers.
 * - Step is set to 60 seconds (1 minute) to match the production RRD.
 *
 * OUTPUT
 * ------
 * Written to `../../test-fixtures/test.rrd` relative to this script file.
 * Commit the resulting binary; regenerate only when the RRD schema changes.
 *
 * USAGE
 * -----
 *   just seed-test-rrd
 * or directly:
 *   cd acarshub-backend && npx tsx scripts/generate-test-rrd.ts
 */

import { exec } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = resolve(__dirname, "../../test-fixtures");
const RRD_PATH = resolve(FIXTURES_DIR, "test.rrd");

// ---------------------------------------------------------------------------
// RRD parameters (must match production schema in rrd-migration.ts)
// ---------------------------------------------------------------------------

/** Step between data points in seconds (1 minute). */
const STEP_SECONDS = 60;

/** Total duration of inserted data: 72 hours at 1-minute resolution. */
const DURATION_HOURS = 72;
const TOTAL_POINTS = (DURATION_HOURS * 60 * 60) / STEP_SECONDS; // 4 320

/**
 * RRA capacity chosen so every archive has more rows than the data we insert,
 * ensuring the migration tests can read data back from each resolution level.
 *
 *   1min  → 4 320 rows  (exactly 72 h)  – need > TOTAL_POINTS rows
 *   5min  → 2 016 rows  (> 7 days at 5-min)
 *   1hour → 4 380 rows  (> 6 months at 1-hour)
 *   6hour → 1 460 rows  (> 1 year at 6-hour)
 */
const RRA_1MIN_ROWS = TOTAL_POINTS + 100; // small headroom
const RRA_5MIN_ROWS = 2016;
const RRA_1HOUR_ROWS = 4380;
const RRA_6HOUR_ROWS = 1460;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic data value for a given minute index and channel.
 * Uses simple trigonometric functions so the values vary realistically without
 * any random element — repeated runs produce byte-for-byte identical RRDs.
 *
 * Ranges (approximate):
 *   ACARS  :  5 – 15
 *   VDLM   : 10 – 30
 *   HFDL   :  3 –  8
 *   IMSL   :  0 –  2
 *   IRDM   :  0 –  1
 */
function dataValues(minuteIndex: number): {
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
} {
  // Period ≈ 6 hours (360 minutes) — mirrors realistic diurnal patterns
  const phase = (2 * Math.PI * minuteIndex) / 360;

  const acars = Math.max(1, Math.round(10 + 5 * Math.sin(phase)));
  const vdlm = Math.max(1, Math.round(20 + 10 * Math.cos(phase)));
  const hfdl = Math.max(0, Math.round(5.5 + 2.5 * Math.sin(phase + 1)));
  const imsl = Math.max(0, Math.round(1 + Math.sin(phase + 2)));
  const irdm = minuteIndex % 120 === 0 ? 1 : 0; // occasional burst
  return { acars, vdlm, hfdl, imsl, irdm };
}

async function run(): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Ensure output directory exists
  // ------------------------------------------------------------------
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    console.log(`Created directory: ${FIXTURES_DIR}`);
  }

  // ------------------------------------------------------------------
  // 2. Remove any leftover file from a previous run
  // ------------------------------------------------------------------
  if (existsSync(RRD_PATH)) {
    unlinkSync(RRD_PATH);
    console.log("Removed existing test.rrd");
  }

  // ------------------------------------------------------------------
  // 3. Anchor time to a deterministic past timestamp.
  //    We use a fixed calendar time (2024-01-01 00:00:00 UTC) so the
  //    resulting binary is identical across machines regardless of wall
  //    clock.  rrdtool requires the start time to be at least one step
  //    before the first data point, so we subtract an extra step.
  // ------------------------------------------------------------------
  const ANCHOR_UNIX = 1704067200; // 2024-01-01 00:00:00 UTC
  const rrdStart = ANCHOR_UNIX - STEP_SECONDS; // one step before first point

  // ------------------------------------------------------------------
  // 4. Build the `rrdtool create` command
  // ------------------------------------------------------------------
  const createArgs = [
    `rrdtool create ${RRD_PATH}`,
    `--start ${rrdStart}`,
    `--step ${STEP_SECONDS}`,
    // Data sources — GAUGE with 2× heartbeat, matching production
    `DS:ACARS:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:VDLM:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:TOTAL:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:ERROR:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:HFDL:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:IMSL:GAUGE:${STEP_SECONDS * 2}:0:U`,
    `DS:IRDM:GAUGE:${STEP_SECONDS * 2}:0:U`,
    // Archives — AVERAGE consolidation function, xff=0.5
    `RRA:AVERAGE:0.5:1:${RRA_1MIN_ROWS}`, // 1-min resolution
    `RRA:AVERAGE:0.5:5:${RRA_5MIN_ROWS}`, // 5-min resolution
    `RRA:AVERAGE:0.5:60:${RRA_1HOUR_ROWS}`, // 1-hour resolution
    `RRA:AVERAGE:0.5:360:${RRA_6HOUR_ROWS}`, // 6-hour resolution
  ].join(" \\\n  ");

  console.log("Creating RRD file...");
  await execAsync(createArgs);
  console.log(`  ✓ RRD created at ${RRD_PATH}`);

  // ------------------------------------------------------------------
  // 5. Build the update tuples
  //    Format: timestamp:ACARS:VDLM:TOTAL:ERROR:HFDL:IMSL:IRDM
  //    (order must match DS declaration order above)
  // ------------------------------------------------------------------
  console.log(`Generating ${TOTAL_POINTS} data points (${DURATION_HOURS}h)...`);

  const tuples: string[] = [];
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const ts = ANCHOR_UNIX + i * STEP_SECONDS;
    const { acars, vdlm, hfdl, imsl, irdm } = dataValues(i);
    const total = acars + vdlm + hfdl + imsl + irdm;
    const error = i % 1000 === 0 ? 1 : 0; // ~0.02 % error rate
    tuples.push(
      `${ts}:${acars}:${vdlm}:${total}:${error}:${hfdl}:${imsl}:${irdm}`,
    );
  }

  // ------------------------------------------------------------------
  // 6. rrdtool update has a command-line length limit.  We split the
  //    4 320 tuples into batches of 500 to stay comfortably below the
  //    OS ARG_MAX limit (typically 128 KiB–2 MiB).
  // ------------------------------------------------------------------
  const BATCH_SIZE = 500;
  const batches = Math.ceil(tuples.length / BATCH_SIZE);

  console.log(
    `Inserting data in ${batches} batches of ≤${BATCH_SIZE} points...`,
  );
  for (let b = 0; b < batches; b++) {
    const slice = tuples.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const updateCmd = `rrdtool update ${RRD_PATH} ${slice.join(" ")}`;
    await execAsync(updateCmd);
    process.stdout.write(`  batch ${b + 1}/${batches}\r`);
  }
  console.log(`\n  ✓ ${TOTAL_POINTS} data points inserted`);

  // ------------------------------------------------------------------
  // 7. Write a small metadata sidecar so tests can verify what the
  //    fixture contains without parsing the binary.
  // ------------------------------------------------------------------
  const meta = {
    generated: new Date().toISOString(),
    anchorUnix: ANCHOR_UNIX,
    anchorIso: "2024-01-01T00:00:00Z",
    durationHours: DURATION_HOURS,
    totalPoints: TOTAL_POINTS,
    stepSeconds: STEP_SECONDS,
    dataSources: ["ACARS", "VDLM", "TOTAL", "ERROR", "HFDL", "IMSL", "IRDM"],
    archives: [
      { resolution: "1min", rows: RRA_1MIN_ROWS, stepsPerRow: 1 },
      { resolution: "5min", rows: RRA_5MIN_ROWS, stepsPerRow: 5 },
      { resolution: "1hour", rows: RRA_1HOUR_ROWS, stepsPerRow: 60 },
      { resolution: "6hour", rows: RRA_6HOUR_ROWS, stepsPerRow: 360 },
    ],
  };

  const metaPath = resolve(FIXTURES_DIR, "test.rrd.meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  console.log(`  ✓ Metadata written to ${metaPath}`);

  // ------------------------------------------------------------------
  // 8. Quick sanity-check: verify rrdtool can read the file back
  // ------------------------------------------------------------------
  const fetchEnd = ANCHOR_UNIX + TOTAL_POINTS * STEP_SECONDS;
  const fetchStart = fetchEnd - 3600; // last hour
  const { stdout } = await execAsync(
    `rrdtool fetch ${RRD_PATH} AVERAGE --start ${fetchStart} --end ${fetchEnd} --resolution 60`,
  );
  const dataLines = stdout
    .split("\n")
    .filter((l) => l.match(/^\d+:/))
    .filter((l) => !l.includes("nan"));

  if (dataLines.length === 0) {
    throw new Error(
      "Sanity check failed: rrdtool fetch returned no data lines",
    );
  }
  console.log(
    `  ✓ Sanity check passed: ${dataLines.length} rows readable from last hour`,
  );

  console.log("\n✅ test.rrd generated successfully.");
  console.log(`   Path : ${RRD_PATH}`);
  console.log(
    "   Next : commit test-fixtures/test.rrd and test-fixtures/test.rrd.meta.json",
  );
}

run().catch((err: unknown) => {
  console.error("❌ Failed to generate test RRD fixture:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

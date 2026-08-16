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
 * search-index-rebuild.ts — v4.3 Phase 4 search index rebuild on decoder
 * change.
 *
 * Runs the REAL migration chain against a temp-file SQLite database (not a
 * hand-written CREATE TABLE), following `system-config.test.ts` /
 * `decoded-search-index.test.ts`'s pattern: `runMigrations(dbPath)` then
 * `initDatabase(dbPath)` in `beforeAll`, so every module under test resolves
 * its `getSqliteConnection()` / `getDatabase()` calls against this migrated
 * file.
 *
 * Three modules are mocked, each for a specific, narrow reason:
 *
 * - `decoder-version.ts`: `getInstalledDecoderVersion()` is pinned to a
 *   fixed test string by default (rather than the real installed
 *   `@airframes/acars-decoder` version) so `scheduleIfNeeded()`'s
 *   version-comparison tests are not coupled to whatever version happens to
 *   be installed, and so it can be forced to `"unknown"` for one test.
 * - `decoded-search-index.ts`: only `indexDecodedMessage` is replaced (every
 *   other export passes through to the real implementation unchanged) so
 *   the crash-consistency test can make ONE specific message's write throw
 *   without touching how masks/variants are actually computed.
 * - `system-config.ts`: only `setSystemConfigValue` is wrapped in a spy
 *   (again passing through to the real implementation) so the cursor
 *   write-per-batch test can assert on the exact SEQUENCE of writes rather
 *   than trying to catch the loop "mid-flight" with manually interleaved
 *   `setImmediate` calls, which would make the test's pass/fail depend on
 *   Node's internal immediate-queue ordering rather than on the behaviour
 *   actually under test.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_DECODER_VERSION = "9.9.9-test";

const decoderVersionState = vi.hoisted(() => ({
  getInstalledDecoderVersion: vi.fn(),
}));

vi.mock("../decoder-version.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../decoder-version.js")>();
  return {
    ...original,
    getInstalledDecoderVersion: decoderVersionState.getInstalledDecoderVersion,
  };
});

const decodedSearchIndexState = vi.hoisted(() => ({
  original: null as typeof import("../decoded-search-index.js") | null,
  indexDecodedMessage: vi.fn(),
}));

vi.mock("../decoded-search-index.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../decoded-search-index.js")>();
  decodedSearchIndexState.original = original;
  decodedSearchIndexState.indexDecodedMessage.mockImplementation(
    original.indexDecodedMessage,
  );
  return {
    ...original,
    indexDecodedMessage: decodedSearchIndexState.indexDecodedMessage,
  };
});

const systemConfigState = vi.hoisted(() => ({
  original: null as typeof import("../system-config.js") | null,
  setSystemConfigValue: vi.fn(),
}));

vi.mock("../system-config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../system-config.js")>();
  systemConfigState.original = original;
  systemConfigState.setSystemConfigValue.mockImplementation(
    original.setSystemConfigValue,
  );
  return {
    ...original,
    setSystemConfigValue: systemConfigState.setSystemConfigValue,
  };
});

import { initializeConfig } from "../../config.js";
import {
  closeDatabase,
  getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { messages } from "../../db/schema.js";
import { enrichMessage } from "../../formatters/enrichment.js";
import {
  type DecodedMessageForIndex,
  findOrCreateDecoderVariant,
  getMessageFieldMask,
  writeDecodedMessageIndexRow,
} from "../decoded-search-index.js";
import {
  destroySearchIndexRebuilder,
  getSearchIndexRebuilder,
  type RebuildProgress,
  SearchIndexRebuilder,
} from "../search-index-rebuild.js";
import {
  getSystemConfigValue,
  setSystemConfigValue,
} from "../system-config.js";

let tmpDir: string;
let dbPath: string;
let nextTime = 1_700_000_000;

beforeAll(async () => {
  await initializeConfig();
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-search-index-rebuild-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  decoderVersionState.getInstalledDecoderVersion.mockReturnValue(
    TEST_DECODER_VERSION,
  );
  if (decodedSearchIndexState.original) {
    decodedSearchIndexState.indexDecodedMessage.mockImplementation(
      decodedSearchIndexState.original.indexDecodedMessage,
    );
  }
  if (systemConfigState.original) {
    systemConfigState.setSystemConfigValue.mockImplementation(
      systemConfigState.original.setSystemConfigValue,
    );
  }
});

afterEach(() => {
  const conn = getSqliteConnection();
  conn.exec("DELETE FROM decoded_messages");
  conn.exec("DELETE FROM decoder_variant");
  conn.exec("DELETE FROM decoded_field");
  conn.exec("DELETE FROM messages");
  conn.exec("DELETE FROM system_config");
  destroySearchIndexRebuilder();
});

/**
 * label "SQ" / "POSICAO/..." is the same canonical decodable fixture used by
 * enrichment.test.ts / enrichment.decoded-index.test.ts — a Ground Station
 * Squitter message that decodes to decodeLevel "full" via the "label-sq"
 * decoder.
 */
const DECODABLE = {
  label: "SQ",
  text: "POSICAO/N4515.4W07329.8/ALTITUD/35000",
} as const;

const UNDECODABLE = {
  label: "ZZ",
  text: "RANDOM UNDECODABLE TEXT THAT MATCHES NO PATTERN ZZ99",
} as const;

/** Insert a minimal valid `messages` row and return its real `id`. */
function insertMessage(
  overrides: { label?: string; text?: string } = {},
): number {
  const db = getDatabase();
  const time = nextTime++;
  const rows = db
    .insert(messages)
    .values({
      messageType: "ACARS",
      time,
      stationId: "",
      toaddr: "",
      fromaddr: "",
      depa: "",
      dsta: "",
      eta: "",
      gtout: "",
      gtin: "",
      wloff: "",
      wlin: "",
      lat: "",
      lon: "",
      alt: "",
      text: overrides.text ?? "",
      tail: "",
      flight: "",
      icao: "",
      freq: "",
      ack: "",
      mode: "",
      label: overrides.label ?? "",
      blockId: "",
      msgno: "",
      isResponse: "",
      isOnground: "",
      error: "",
      libacars: "",
      level: "",
    })
    .returning({ id: messages.id })
    .all();
  return rows[0].id;
}

function countRows(table: string): number {
  const row = getSqliteConnection()
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return row.count;
}

function getVariantId(messageId: number): number | null {
  const row = getSqliteConnection()
    .prepare(
      "SELECT variant_id AS variantId FROM decoded_messages WHERE message_id = ?",
    )
    .get(messageId) as { variantId: number } | undefined;
  return row ? row.variantId : null;
}

/** Let one already-registered `setImmediate` callback fire before resuming. */
function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Spy on `rebuilder.run()` without letting it do any real work, so
 * `scheduleIfNeeded()`'s decision logic and its synchronous system_config
 * writes can be tested in isolation from the batch loop (covered directly,
 * and separately, by the `run()`-focused tests below).
 */
function stubRun(rebuilder: SearchIndexRebuilder): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(rebuilder, "run").mockResolvedValue({
    scanned: 0,
    indexed: 0,
    removed: 0,
    lastId: 0,
    completed: true,
  } satisfies RebuildProgress);
}

describe("SearchIndexRebuilder.scheduleIfNeeded", () => {
  it("returns false and does no work when the version is unchanged and status is idle (never started)", () => {
    setSystemConfigValue(
      "acars_decoder_installed_version",
      TEST_DECODER_VERSION,
    );
    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    const started = rebuilder.scheduleIfNeeded();

    expect(started).toBe(false);
    expect(runSpy).not.toHaveBeenCalled();
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBeNull();
    expect(getSystemConfigValue("search_index_rebuild_status")).toBeNull();
  });

  it("returns false when the version is unchanged and a previous rebuild already completed", () => {
    setSystemConfigValue(
      "acars_decoder_installed_version",
      TEST_DECODER_VERSION,
    );
    setSystemConfigValue("search_index_rebuild_status", "completed");
    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    expect(rebuilder.scheduleIfNeeded()).toBe(false);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a version change returns true, updates the stored version IMMEDIATELY, resets the cursor to 0, and marks status running", async () => {
    setSystemConfigValue("acars_decoder_installed_version", "old-version");
    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    const started = rebuilder.scheduleIfNeeded();

    // Synchronous assertions: these must be true BEFORE the fired loop has
    // any chance to run, proving the version write happens at schedule time
    // (inside scheduleIfNeeded itself), not as a side effect of run().
    expect(started).toBe(true);
    expect(getSystemConfigValue("acars_decoder_installed_version")).toBe(
      TEST_DECODER_VERSION,
    );
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe("0");
    expect(getSystemConfigValue("search_index_rebuild_status")).toBe("running");

    await flushImmediate();
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT schedule when the installed version is "unknown" (a failed read, not a real change)', () => {
    decoderVersionState.getInstalledDecoderVersion.mockReturnValue("unknown");
    setSystemConfigValue("acars_decoder_installed_version", "irrelevant");
    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    expect(rebuilder.scheduleIfNeeded()).toBe(false);
    expect(runSpy).not.toHaveBeenCalled();
    // Nothing was written — an "unknown" read must not perturb state that a
    // future successful read will need to compare against.
    expect(getSystemConfigValue("acars_decoder_installed_version")).toBe(
      "irrelevant",
    );
  });

  it('resumes (does not reset the cursor) when the version is unchanged and status is "running"', async () => {
    setSystemConfigValue(
      "acars_decoder_installed_version",
      TEST_DECODER_VERSION,
    );
    setSystemConfigValue("search_index_rebuild_cursor", "42");
    setSystemConfigValue("search_index_rebuild_status", "running");

    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    expect(rebuilder.scheduleIfNeeded()).toBe(true);
    // Cursor must NOT have been reset to "0" by scheduleIfNeeded itself.
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe("42");

    await flushImmediate();
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('resumes when the version is unchanged and status is "failed", so a failed rebuild is never stranded', async () => {
    setSystemConfigValue(
      "acars_decoder_installed_version",
      TEST_DECODER_VERSION,
    );
    setSystemConfigValue("search_index_rebuild_cursor", "7");
    setSystemConfigValue("search_index_rebuild_status", "failed");

    const rebuilder = new SearchIndexRebuilder();
    const runSpy = stubRun(rebuilder);

    expect(rebuilder.scheduleIfNeeded()).toBe(true);
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe("7");

    await flushImmediate();
    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});

describe("SearchIndexRebuilder.scheduleIfNeeded — re-entrancy guard (F1)", () => {
  it("a second scheduleIfNeeded() call while a run is already in flight returns false and touches no system_config value, even when a version change would otherwise fire one", async () => {
    // Enough rows to span several batches at this small batchSize, so the
    // in-flight run is genuinely still working (not already finished) by
    // the time the second scheduleIfNeeded() call is made.
    for (let i = 0; i < 6; i++) {
      insertMessage(DECODABLE);
    }

    // Rig the DANGEROUS branch: a real version mismatch. If the isRunning
    // guard did not short-circuit before this branch, a second call would
    // reset the cursor to "0", stamp status "running", and overwrite the
    // stored version — precisely the cursor-rollback hazard the guard
    // exists to prevent.
    setSystemConfigValue("acars_decoder_installed_version", "old-version");

    const rebuilder = new SearchIndexRebuilder({ batchSize: 2 });

    // Call run() directly (not through scheduleIfNeeded/fire()) so it starts
    // executing synchronously: an async function runs to its first `await`
    // before control returns here, so by the time this line completes, batch
    // 1 has already committed (including its cursor write) and the loop is
    // suspended at the inter-batch yield — i.e. `isRunning` is true and a
    // real run is genuinely in flight.
    const firstRunPromise = rebuilder.run();
    expect(rebuilder.isRunning).toBe(true);

    const cursorDuringRun = getSystemConfigValue("search_index_rebuild_cursor");
    const statusDuringRun = getSystemConfigValue("search_index_rebuild_status");
    const versionDuringRun = getSystemConfigValue(
      "acars_decoder_installed_version",
    );

    const runSpy = vi.spyOn(rebuilder, "run");

    const scheduled = rebuilder.scheduleIfNeeded();

    expect(scheduled).toBe(false);
    // Nothing was read-then-written by the redundant call: all three values
    // are exactly what the in-flight run itself had already produced.
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe(
      cursorDuringRun,
    );
    expect(getSystemConfigValue("search_index_rebuild_status")).toBe(
      statusDuringRun,
    );
    expect(getSystemConfigValue("acars_decoder_installed_version")).toBe(
      versionDuringRun,
    );
    expect(versionDuringRun).toBe("old-version");

    // No second run was fired either — draining any pending setImmediate
    // callbacks must not produce a second call to run().
    await flushImmediate();
    expect(runSpy).not.toHaveBeenCalled();

    const progress = await firstRunPromise;
    expect(progress.completed).toBe(true);
    expect(progress.scanned).toBe(6);
  });
});

describe("SearchIndexRebuilder.run — resumption", () => {
  it("resumes from the stored cursor: messages at/below it are not reprocessed", async () => {
    const belowId = insertMessage(DECODABLE);
    const aboveId = insertMessage(DECODABLE);

    // Deliberately seed a WRONG index row for the below-cursor message. If
    // the rebuild incorrectly reprocesses it, this row would be replaced
    // with a correct one — so its surviving unchanged is the proof that the
    // cursor was actually honoured.
    const wrongVariantId = findOrCreateDecoderVariant(
      "bogus-decoder",
      "0.0.0",
      "Bogus",
    );
    writeDecodedMessageIndexRow(belowId, wrongVariantId, {
      maskLo: 0n,
      maskHi: 0n,
    });

    setSystemConfigValue("search_index_rebuild_cursor", String(belowId));
    setSystemConfigValue("search_index_rebuild_status", "running");

    const rebuilder = new SearchIndexRebuilder({ batchSize: 10 });
    const progress = await rebuilder.run();

    expect(progress.completed).toBe(true);
    expect(progress.scanned).toBe(1);

    expect(getVariantId(belowId)).toBe(wrongVariantId);
    expect(getVariantId(aboveId)).not.toBeNull();
  });

  it('resumes identically when status is "failed"', async () => {
    const belowId = insertMessage(DECODABLE);
    const aboveId = insertMessage(DECODABLE);

    const wrongVariantId = findOrCreateDecoderVariant(
      "bogus-decoder",
      "0.0.0",
      "Bogus",
    );
    writeDecodedMessageIndexRow(belowId, wrongVariantId, {
      maskLo: 0n,
      maskHi: 0n,
    });

    setSystemConfigValue("search_index_rebuild_cursor", String(belowId));
    setSystemConfigValue("search_index_rebuild_status", "failed");

    const rebuilder = new SearchIndexRebuilder({ batchSize: 10 });
    const progress = await rebuilder.run();

    expect(progress.completed).toBe(true);
    expect(progress.scanned).toBe(1);
    expect(getVariantId(belowId)).toBe(wrongVariantId);
    expect(getVariantId(aboveId)).not.toBeNull();
  });
});

describe("SearchIndexRebuilder.run — batching and cursor persistence", () => {
  it("persists the cursor after EACH batch, not only once at the end", async () => {
    const ids = [
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
    ];
    systemConfigState.setSystemConfigValue.mockClear();

    const rebuilder = new SearchIndexRebuilder({ batchSize: 2 });
    const progress = await rebuilder.run();

    expect(progress.completed).toBe(true);
    expect(progress.scanned).toBe(5);
    expect(progress.indexed).toBe(5);

    const cursorWrites = systemConfigState.setSystemConfigValue.mock.calls
      .filter(([key]) => key === "search_index_rebuild_cursor")
      .map(([, value]) => value);

    // 5 messages at batchSize 2 -> batches of [2, 2, 1] -> three distinct
    // cursor writes, monotonically increasing — never just one write at the
    // very end.
    expect(cursorWrites).toEqual([
      String(ids[1]),
      String(ids[3]),
      String(ids[4]),
    ]);
  });

  it("never scans a message whose msg_text is empty", async () => {
    insertMessage({ label: "H1", text: "" });
    const decodableId = insertMessage(DECODABLE);

    const rebuilder = new SearchIndexRebuilder({ batchSize: 50 });
    const progress = await rebuilder.run();

    expect(progress.scanned).toBe(1);
    expect(progress.lastId).toBe(decodableId);
  });

  it("sets status to 'completed' when the sweep reaches the end of the corpus", async () => {
    insertMessage(DECODABLE);

    const rebuilder = new SearchIndexRebuilder({ batchSize: 50 });
    const progress = await rebuilder.run();

    expect(progress.completed).toBe(true);
    expect(getSystemConfigValue("search_index_rebuild_status")).toBe(
      "completed",
    );
  });

  it("deletes a pre-existing decoded_messages row for a message that no longer decodes", async () => {
    const messageId = insertMessage(UNDECODABLE);
    const oldVariantId = findOrCreateDecoderVariant(
      "old-decoder",
      "0.0.1",
      "Old Type",
    );
    writeDecodedMessageIndexRow(messageId, oldVariantId, {
      maskLo: 1n,
      maskHi: 0n,
    });
    expect(countRows("decoded_messages")).toBe(1);

    const rebuilder = new SearchIndexRebuilder({ batchSize: 50 });
    const progress = await rebuilder.run();

    expect(countRows("decoded_messages")).toBe(0);
    expect(progress.removed).toBe(1);
  });

  it("progress.removed counts only rows that actually existed and were deleted, not every non-decoding message (F2)", async () => {
    // Three categories mixed in ONE run, so `info.changes` (0 or 1 per
    // DELETE) cannot be conflated with "one non-decoding row seen":
    //
    // (a) decodes -> indexed, never touches deleteStale at all.
    insertMessage(DECODABLE);

    // (b) does NOT decode AND has a pre-existing decoded_messages row ->
    // deleteStale actually deletes one row -> info.changes === 1.
    const staleVariantId = findOrCreateDecoderVariant(
      "old-decoder",
      "0.0.1",
      "Old Type",
    );
    const staleId1 = insertMessage(UNDECODABLE);
    writeDecodedMessageIndexRow(staleId1, staleVariantId, {
      maskLo: 1n,
      maskHi: 0n,
    });
    const staleId2 = insertMessage(UNDECODABLE);
    writeDecodedMessageIndexRow(staleId2, staleVariantId, {
      maskLo: 1n,
      maskHi: 0n,
    });

    // (c) does NOT decode and has NO pre-existing row -> deleteStale still
    // runs (every non-decoding row hits it) but deletes nothing ->
    // info.changes === 0. `batchRemoved += info.changes` must NOT count
    // these; `batchRemoved += 1` (the mutation) would.
    insertMessage(UNDECODABLE);
    insertMessage(UNDECODABLE);
    insertMessage(UNDECODABLE);

    expect(countRows("decoded_messages")).toBe(2);

    const rebuilder = new SearchIndexRebuilder({ batchSize: 50 });
    const progress = await rebuilder.run();

    // 1 decodable + 2 stale-with-row + 3 stale-without-row = 6 scanned.
    expect(progress.scanned).toBe(6);
    expect(progress.indexed).toBe(1);
    // Only (b)'s two rows were ever deleted. If `batchRemoved += 1` replaced
    // `batchRemoved += info.changes`, this would be 5 (b + c), not 2.
    expect(progress.removed).toBe(2);
    expect(countRows("decoded_messages")).toBe(1);
  });

  it("does not starve the event loop: a setImmediate callback fires before a multi-batch run() resolves", async () => {
    for (let i = 0; i < 7; i++) {
      insertMessage(DECODABLE);
    }

    const rebuilder = new SearchIndexRebuilder({ batchSize: 2 });
    const order: string[] = [];

    const runPromise = rebuilder.run().then((progress) => {
      order.push("run");
      return progress;
    });
    const immediatePromise = new Promise<void>((resolve) => {
      setImmediate(() => {
        order.push("immediate");
        resolve();
      });
    });

    const [progress] = await Promise.all([runPromise, immediatePromise]);

    expect(order[0]).toBe("immediate");
    expect(progress.completed).toBe(true);
  });

  it("stop() aborts between batches: status stays 'running', cursor reflects only completed batches", async () => {
    const ids = [
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
    ];
    setSystemConfigValue("search_index_rebuild_status", "running");

    const rebuilder = new SearchIndexRebuilder({ batchSize: 2 });
    const runPromise = rebuilder.run();
    // Synchronous: run() has already executed batch 1 and suspended at its
    // yield by the time this line runs (an async function runs synchronously
    // up to its first `await`), so this reliably lands the abort BEFORE
    // run()'s "between batches" check rather than racing it.
    rebuilder.stop();

    const progress = await runPromise;

    expect(progress.completed).toBe(false);
    expect(progress.scanned).toBe(2);
    expect(progress.lastId).toBe(ids[1]);
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe(
      String(ids[1]),
    );
    // Status is untouched by an aborted run — it must stay "running" so the
    // next scheduleIfNeeded() resumes instead of restarting.
    expect(getSystemConfigValue("search_index_rebuild_status")).toBe("running");
  });
});

describe("SearchIndexRebuilder.run — crash consistency", () => {
  it("a write failure mid-batch commits neither the cursor nor any row from that batch", async () => {
    const ids = [
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
      insertMessage(DECODABLE),
    ];
    const throwForId = ids[1];

    const original = decodedSearchIndexState.original;
    if (!original) {
      throw new Error(
        "decoded-search-index.js mock was not initialized by vi.mock",
      );
    }
    decodedSearchIndexState.indexDecodedMessage.mockImplementation(
      (input: DecodedMessageForIndex) => {
        if (input.messageId === throwForId) {
          throw new Error("simulated write failure");
        }
        return original.indexDecodedMessage(input);
      },
    );

    setSystemConfigValue("search_index_rebuild_cursor", "0");

    const rebuilder = new SearchIndexRebuilder({ batchSize: 3 });

    await expect(rebuilder.run()).rejects.toThrow("simulated write failure");

    // Neither ids[0] (processed before the throw, in the SAME transaction)
    // nor the cursor were committed — better-sqlite3's transaction() rolls
    // back everything since BEGIN, not just the statement that threw.
    expect(countRows("decoded_messages")).toBe(0);
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe("0");
    expect(getSystemConfigValue("search_index_rebuild_status")).toBe("failed");
  });
});

describe("SearchIndexRebuilder.run — ingest/rebuild consistency", () => {
  it("produces a byte-for-byte identical decoded_messages row to the one written at ingest", async () => {
    const messageId = insertMessage(DECODABLE);
    enrichMessage(
      { uid: String(messageId), timestamp: 1, ...DECODABLE },
      "ingest",
    );

    const beforeVariantId = getVariantId(messageId);
    const beforeMask = getMessageFieldMask(messageId);
    expect(beforeVariantId).not.toBeNull();
    expect(beforeMask).not.toBeNull();

    setSystemConfigValue("search_index_rebuild_cursor", "0");
    const rebuilder = new SearchIndexRebuilder({ batchSize: 50 });
    await rebuilder.run();

    const afterVariantId = getVariantId(messageId);
    const afterMask = getMessageFieldMask(messageId);

    expect(afterVariantId).toBe(beforeVariantId);
    expect(afterMask?.maskLo).toBe(beforeMask?.maskLo);
    expect(afterMask?.maskHi).toBe(beforeMask?.maskHi);
  });
});

describe("getSearchIndexRebuilder / destroySearchIndexRebuilder singleton", () => {
  it("returns the same instance across calls", () => {
    const a = getSearchIndexRebuilder();
    const b = getSearchIndexRebuilder();
    expect(a).toBe(b);
  });

  it("destroy() causes the next getSearchIndexRebuilder() to return a fresh instance", () => {
    const a = getSearchIndexRebuilder();
    destroySearchIndexRebuilder();
    const b = getSearchIndexRebuilder();
    expect(b).not.toBe(a);
  });
});

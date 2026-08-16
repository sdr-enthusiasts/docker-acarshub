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
 * decoded-search.ts — read path for the v4.3 Phase 3 decoder search index.
 *
 * Unlike `messages.test.ts` (hand-rolled in-memory schema, shared by the
 * rest of this directory), this file runs the REAL migration chain against
 * a temp-file database, following `system-config.test.ts`'s pattern —
 * required here because `decoded_messages`/`decoder_variant`/`decoded_field`
 * are `WITHOUT ROWID` tables with `CHECK` constraints and foreign keys that
 * a lookalike hand-written schema would not exercise faithfully.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { indexDecodedMessage } from "../../../../services/decoded-search-index.js";
import {
  closeDatabase,
  getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../../client.js";
import { runMigrations } from "../../../migrate.js";
import { messages } from "../../../schema.js";
import {
  searchMessagesByFieldLabel,
  searchMessagesByVariantDescription,
} from "../decoded-search.js";

let tmpDir: string;
let dbPath: string;
let nextTime = 1_700_000_000;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-decoded-search-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  const conn = getSqliteConnection();
  conn.exec("DELETE FROM decoded_messages");
  conn.exec("DELETE FROM decoder_variant");
  conn.exec("DELETE FROM decoded_field");
  conn.exec("DELETE FROM messages");
});

/** Insert a minimal valid `messages` row and return its real `id`. */
function insertTestMessage(): number {
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
      text: "",
      tail: "",
      flight: "",
      icao: "",
      freq: "",
      ack: "",
      mode: "",
      label: "",
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

function explainQueryPlan(sql: string, ...params: unknown[]): string[] {
  const rows = getSqliteConnection()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params) as Array<{ detail: string }>;
  return rows.map((r) => r.detail);
}

/**
 * Run `fn`, capture every SQL statement the production code actually
 * prepared, and return the query plan of each SELECT among them.
 *
 * The SQL must come from the code under test, never be retyped in the test.
 * An earlier version of these plan tests pasted a copy of the query into the
 * test file and explained that; reverting the real join order to the bad
 * shape left all ten tests in this file green. A regression test that cannot
 * observe the regression is worse than no test, because it is cited as
 * evidence — and this particular property (drive from the compact index, not
 * a scan of an 11M-row table) is the entire reason the design works.
 */
function capturePlans(fn: () => void): Array<{ sql: string; plan: string[] }> {
  const conn = getSqliteConnection();
  const original = conn.prepare.bind(conn);
  const captured: string[] = [];

  const spy = vi
    .spyOn(conn, "prepare")
    .mockImplementation((sql: string) => {
      captured.push(sql);
      return original(sql);
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }

  return captured
    .filter((sql) => /^\s*select/i.test(sql))
    .map((sql) => ({
      sql,
      // Params are irrelevant to the plan shape; bind NULLs positionally so
      // EXPLAIN can compile whatever the production statement was.
      plan: explainQueryPlan(
        sql,
        ...new Array((sql.match(/\?/g) ?? []).length).fill(null),
      ),
    }));
}

/**
 * Assert that no captured statement scans `messages`, and that at least one
 * drives from `decoded_messages`.
 *
 * Alias-agnostic: matches the table name or a short alias bound to it, so a
 * rename cannot quietly turn the assertion into a no-op.
 */
function expectDrivesFromCompactIndex(
  captured: Array<{ sql: string; plan: string[] }>,
): void {
  expect(captured.length).toBeGreaterThan(0);

  const allLines = captured.flatMap((c) => c.plan);
  expect(allLines.length).toBeGreaterThan(0);

  // The large table must only ever be reached by primary-key seek.
  const scansMessages = allLines.filter((line) =>
    /^SCAN (messages|m)\b/.test(line),
  );
  expect(scansMessages).toEqual([]);

  // ...and the compact table must be what the query is driven from.
  const drivesFromCompact = allLines.some((line) =>
    /^SCAN (decoded_messages|dm)\b/.test(line),
  );
  expect(drivesFromCompact).toBe(true);
}

describe("searchMessagesByVariantDescription", () => {
  it("returns messages classified with the given description", () => {
    const squitterId = insertTestMessage();
    indexDecodedMessage({
      messageId: squitterId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Ground Station Squitter",
      fieldLabels: ["Latitude"],
    });

    const routeId = insertTestMessage();
    indexDecodedMessage({
      messageId: routeId,
      decoderName: "arinc-702",
      decoderVersion: "1.9.1",
      description: "Route",
      fieldLabels: ["Company Route"],
    });

    const result = searchMessagesByVariantDescription(
      "Ground Station Squitter",
    );

    expect(result.totalCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe(squitterId);
  });

  it("excludes messages with no decoder output at all", () => {
    insertTestMessage(); // never indexed — no decoder output

    const result = searchMessagesByVariantDescription("Ground Station Squitter");

    expect(result.totalCount).toBe(0);
    expect(result.messages).toHaveLength(0);
  });

  it("returns an empty result for a description nothing was ever classified as", () => {
    const result = searchMessagesByVariantDescription("Nonexistent Description");
    expect(result).toEqual({ messages: [], totalCount: 0 });
  });

  it("respects limit/offset pagination", () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = insertTestMessage();
      indexDecodedMessage({
        messageId: id,
        decoderName: "label-sq",
        decoderVersion: "1.9.1",
        description: "Ground Station Squitter",
        fieldLabels: ["Latitude"],
      });
      ids.push(id);
    }

    const page1 = searchMessagesByVariantDescription("Ground Station Squitter", {
      limit: 2,
      offset: 0,
    });
    const page2 = searchMessagesByVariantDescription("Ground Station Squitter", {
      limit: 2,
      offset: 2,
    });

    expect(page1.totalCount).toBe(5);
    expect(page1.messages).toHaveLength(2);
    expect(page2.messages).toHaveLength(2);
    // Pages must not overlap.
    const page1Ids = page1.messages.map((m) => m.id);
    const page2Ids = page2.messages.map((m) => m.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it("EXPLAIN QUERY PLAN evidence: the query it ACTUALLY runs drives from decoded_messages, never a scan of messages", () => {
    // The plan is taken from the statement searchMessagesByVariantDescription
    // really prepares — not a copy of it — so reverting the FROM-clause order
    // to `FROM messages m JOIN decoded_messages dm ...` fails this test.
    // That shape was measured to SCAN messages (~11M rows in production) and
    // seek into the compact index per row, inverting the cost model the
    // compact index exists to provide.
    // Seed a real row: the function returns early when nothing matches, and
    // an early return prepares no main query for the plan to be taken from.
    indexDecodedMessage({
      messageId: insertTestMessage(),
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Ground Station Squitter",
      fieldLabels: ["Latitude"],
    });

    const captured = capturePlans(() => {
      searchMessagesByVariantDescription("Ground Station Squitter");
    });
    expectDrivesFromCompactIndex(captured);
  });
});

describe("searchMessagesByFieldLabel", () => {
  it("returns messages carrying the given field and excludes those without it", () => {
    const withField = insertTestMessage();
    indexDecodedMessage({
      messageId: withField,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Ground Station Squitter",
      fieldLabels: ["Desired Altitude", "Latitude"],
    });

    const withoutField = insertTestMessage();
    indexDecodedMessage({
      messageId: withoutField,
      decoderName: "arinc-702",
      decoderVersion: "1.9.1",
      description: "Route",
      fieldLabels: ["Company Route"],
    });

    const result = searchMessagesByFieldLabel("Desired Altitude");

    expect(result.totalCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe(withField);
  });

  it("returns an empty result for a label that has never been assigned a bit, without creating one", () => {
    const result = searchMessagesByFieldLabel("Never Decoded Field");
    expect(result).toEqual({ messages: [], totalCount: 0 });

    const fieldRow = getSqliteConnection()
      .prepare("SELECT id FROM decoded_field WHERE label = ?")
      .get("Never Decoded Field");
    expect(fieldRow).toBeUndefined();
  });

  it("distinguishes a field at bit 63 (mask_hi) from one at bit 62 (mask_lo)", () => {
    const conn = getSqliteConnection();
    for (let bit = 0; bit < 62; bit++) {
      conn
        .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
        .run(bit, `filler-${bit}`);
    }
    // ids 62 and 63 are left free for the two real fields below.
    conn
      .prepare("INSERT INTO decoded_field (id, label) VALUES (62, 'Lo62Field')")
      .run();
    conn
      .prepare("INSERT INTO decoded_field (id, label) VALUES (63, 'Hi63Field')")
      .run();

    const loMessage = insertTestMessage();
    indexDecodedMessage({
      messageId: loMessage,
      decoderName: "d",
      decoderVersion: "1.0.0",
      description: "D",
      fieldLabels: ["Lo62Field"],
    });

    const hiMessage = insertTestMessage();
    indexDecodedMessage({
      messageId: hiMessage,
      decoderName: "d",
      decoderVersion: "1.0.0",
      description: "D",
      fieldLabels: ["Hi63Field"],
    });

    const loResult = searchMessagesByFieldLabel("Lo62Field");
    expect(loResult.messages.map((m) => m.id)).toEqual([loMessage]);

    const hiResult = searchMessagesByFieldLabel("Hi63Field");
    expect(hiResult.messages.map((m) => m.id)).toEqual([hiMessage]);
  });

  it("respects limit/offset pagination", () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = insertTestMessage();
      indexDecodedMessage({
        messageId: id,
        decoderName: "label-sq",
        decoderVersion: "1.9.1",
        description: "Ground Station Squitter",
        fieldLabels: ["Latitude"],
      });
      ids.push(id);
    }

    const page1 = searchMessagesByFieldLabel("Latitude", { limit: 2, offset: 0 });
    const page2 = searchMessagesByFieldLabel("Latitude", { limit: 2, offset: 2 });

    expect(page1.totalCount).toBe(5);
    expect(page1.messages).toHaveLength(2);
    expect(page2.messages).toHaveLength(2);
    const page1Ids = page1.messages.map((m) => m.id);
    const page2Ids = page2.messages.map((m) => m.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it("EXPLAIN QUERY PLAN evidence: the query it ACTUALLY runs drives from decoded_messages, never a scan of messages", () => {
    // Seed a real row carrying the label: an unknown label, or a zero match
    // count, returns before the main query is ever prepared.
    indexDecodedMessage({
      messageId: insertTestMessage(),
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Ground Station Squitter",
      fieldLabels: ["Desired Altitude"],
    });

    const captured = capturePlans(() => {
      searchMessagesByFieldLabel("Desired Altitude");
    });
    expectDrivesFromCompactIndex(captured);
  });
});

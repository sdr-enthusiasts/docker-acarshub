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
 * enrichment.ts — v4.3 Phase 3 ingest wiring (indexDecodedMessageAtIngest).
 *
 * Split out from enrichment.test.ts deliberately: that file's whole point is
 * that enrichMessage() works without any database (every uid there is an
 * opaque string like "test-123", never resolved against a real row). This
 * file is the opposite — it needs the REAL migration chain against a
 * temp-file database (following system-config.test.ts's pattern) because
 * the behaviour under test is enrichMessage() reaching into
 * decoded-search-index.ts's getSqliteConnection()-backed writes. Mixing the
 * two setups in one file would force every test in enrichment.test.ts to pay
 * for a database it does not need.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageDecoder } from "@airframes/acars-decoder";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initializeConfig } from "../../config.js";
import {
  closeDatabase,
  getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { messages } from "../../db/schema.js";
import { enrichMessage } from "../enrichment.js";

let tmpDir: string;
let dbPath: string;
let nextTime = 1_700_000_000;

beforeAll(async () => {
  await initializeConfig();
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-enrichment-decoded-index-"));
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

function countDecodedMessages(): number {
  const row = getSqliteConnection()
    .prepare("SELECT COUNT(*) AS count FROM decoded_messages")
    .get() as { count: number };
  return row.count;
}

/**
 * label "SQ" / "POSICAO/..." is the same canonical decodable fixture
 * enrichment.test.ts uses — a Ground Station Squitter message that decodes
 * to decodeLevel "full" via the "label-sq" decoder.
 */
const DECODABLE = {
  label: "SQ",
  text: "POSICAO/N4515.4W07329.8/ALTITUD/35000",
} as const;

const UNDECODABLE = {
  label: "ZZ",
  text: "RANDOM UNDECODABLE TEXT THAT MATCHES NO PATTERN ZZ99",
} as const;

describe("enrichMessage() ingest wiring for the decoder search index (v4.3 Phase 3)", () => {
  it("writes a decoded_messages row when a fresh-ingest message decodes", () => {
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...DECODABLE };

    const result = enrichMessage(message, "ingest");

    expect(result.decodedText).toBeDefined();
    const row = getSqliteConnection()
      .prepare("SELECT message_id FROM decoded_messages WHERE message_id = ?")
      .get(messageId);
    expect(row).toBeDefined();
  });

  it("writes NO row when the message does not decode (row policy: absence means no output)", () => {
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...UNDECODABLE };

    const result = enrichMessage(message, "ingest");

    expect(result.decodedText).toBeUndefined();
    expect(countDecodedMessages()).toBe(0);
  });

  it("writes NO row when the message has no text at all", () => {
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, label: "H1" };

    enrichMessage(message, "ingest");

    expect(countDecodedMessages()).toBe(0);
  });

  it("writes NO row for a database-sourced message, even though it decodes (source is 'database', not a fresh ingest)", () => {
    const messageId = insertTestMessage();
    // Shape matches a row loaded from `messages` (search results,
    // ring-buffer warm-up, alert lookups): has `id`, not `uid`. The `source`
    // argument — not this shape — is what actually gates the index write;
    // see indexDecodedMessageAtIngest()'s doc comment.
    const message = { id: messageId, ...DECODABLE };

    const result = enrichMessage(message, "database");

    // Display decode must still happen (decode-on-read for display is
    // unconditional) — only the index write is gated.
    expect(result.decodedText).toBeDefined();
    expect(countDecodedMessages()).toBe(0);
  });

  it("the `source` argument alone controls the index write, for an otherwise-identical shape", () => {
    // Same object shape (no `id`, a plain `uid`) that would have triggered
    // the old `if ("id" in message) return;` heuristic to index in both
    // cases. Only the explicit `source` argument now decides.
    const databaseId = insertTestMessage();
    enrichMessage(
      { uid: String(databaseId), timestamp: 1, ...DECODABLE },
      "database",
    );
    expect(countDecodedMessages()).toBe(0);

    const ingestId = insertTestMessage();
    enrichMessage(
      { uid: String(ingestId), timestamp: 1, ...DECODABLE },
      "ingest",
    );
    expect(countDecodedMessages()).toBe(1);
  });

  it("writes NO row for an unsaved message (negative-uid placeholder from insert.ts)", () => {
    const message = { uid: "-3", timestamp: 1, ...DECODABLE };

    expect(() => enrichMessage(message, "ingest")).not.toThrow();
    expect(countDecodedMessages()).toBe(0);
  });

  it("writes NO row for a uid that is not a real positive integer", () => {
    const message = { uid: "not-a-number", timestamp: 1, ...DECODABLE };

    expect(() => enrichMessage(message, "ingest")).not.toThrow();
    expect(countDecodedMessages()).toBe(0);
  });

  it("decodes exactly once per message (index row and displayed decode come from the same decode call)", () => {
    const spy = vi.spyOn(MessageDecoder.prototype, "decode");
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...DECODABLE };

    try {
      enrichMessage(message, "ingest");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("the indexed variant description matches the displayed decode's Description item", () => {
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...DECODABLE };

    const result = enrichMessage(message, "ingest");
    const descriptionItem = result.decodedText?.formatted[0];
    expect(descriptionItem?.label).toBe("Description");

    const row = getSqliteConnection()
      .prepare(
        `SELECT dv.description AS description FROM decoded_messages dm
         JOIN decoder_variant dv ON dv.id = dm.variant_id
         WHERE dm.message_id = ?`,
      )
      .get(messageId) as { description: string } | undefined;

    expect(row?.description).toBe(descriptionItem?.value);
  });

  it("does not fail ingestion (still returns decodedText) when the index write throws", () => {
    // Exhaust the 126-bit field space so indexDecodedMessage() throws loudly
    // (see decoded-search-index.test.ts), then confirm enrichMessage() still
    // completes normally rather than propagating the error.
    const conn = getSqliteConnection();
    for (let bit = 0; bit <= 125; bit++) {
      conn
        .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
        .run(bit, `filler-${bit}`);
    }

    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...DECODABLE };

    let result: ReturnType<typeof enrichMessage> | undefined;
    expect(() => {
      result = enrichMessage(message, "ingest");
    }).not.toThrow();

    expect(result?.decodedText).toBeDefined();
    expect(countDecodedMessages()).toBe(0);
  });

  it("idempotent: re-enriching (re-ingesting) the same fresh message twice leaves one row", () => {
    const messageId = insertTestMessage();
    const message = { uid: String(messageId), timestamp: 1, ...DECODABLE };

    enrichMessage({ ...message }, "ingest");
    enrichMessage({ ...message }, "ingest");

    expect(countDecodedMessages()).toBe(1);
  });
});

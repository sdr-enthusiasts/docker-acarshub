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
 * decoded-search-index.ts — write path for the v4.3 Phase 3 decoder search
 * index (`decoder_variant` / `decoded_field` / `decoded_messages`).
 *
 * Runs the REAL migration chain against a temp-file SQLite database (not a
 * hand-written CREATE TABLE), following `system-config.test.ts`'s pattern:
 * `runMigrations(dbPath)` then `initDatabase(dbPath)` in `beforeAll`, so the
 * module under test's `getSqliteConnection()` calls resolve to this migrated
 * file. `initDatabase()` also turns `PRAGMA foreign_keys` ON
 * (`db/client.ts:134`), unlike the bare connection `runMigrations()` uses —
 * load-bearing here because `decoded_messages.message_id` and `.variant_id`
 * both carry foreign keys that several tests below rely on.
 *
 * Each test cleans up its own rows (`afterEach`) so the suite stays
 * order-independent despite sharing one on-disk database.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  closeDatabase,
  getDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { messages } from "../../db/schema.js";
import {
  assignFieldBit,
  buildFieldMask,
  fieldBitToMask,
  findOrCreateDecoderVariant,
  getMessageFieldMask,
  indexDecodedMessage,
  lookupFieldBit,
  MAX_FIELD_BIT,
  writeDecodedMessageIndexRow,
} from "../decoded-search-index.js";

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-decoded-search-index-"));
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
  const rows = db
    .insert(messages)
    .values({
      messageType: "ACARS",
      time: 1234567890,
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

/** Directly seed a `decoded_field` row at an exact bit position, bypassing
 * assignFieldBit's sequential "next free bit" logic — used by the precision
 * tests below, which need labels at exact, non-contiguous bit positions
 * rather than whatever the next-free-slot assignment would produce. */
function seedFieldAtBit(bit: number, label: string): void {
  getSqliteConnection()
    .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
    .run(bit, label);
}

function countRows(table: string): number {
  const row = getSqliteConnection()
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return row.count;
}

describe("assignFieldBit", () => {
  it("assigns bit 0 to the first label ever seen", () => {
    expect(assignFieldBit("Altitude")).toBe(0);
  });

  it("assigns sequential bits to distinct labels", () => {
    expect(assignFieldBit("Altitude")).toBe(0);
    expect(assignFieldBit("Heading")).toBe(1);
    expect(assignFieldBit("Groundspeed")).toBe(2);
  });

  it("returns the same bit for the same label on repeated calls", () => {
    const first = assignFieldBit("Altitude");
    const second = assignFieldBit("Altitude");
    const third = assignFieldBit("Altitude");
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(countRows("decoded_field")).toBe(1);
  });

  it("is stable across a simulated process restart (re-read from the DB, not in-memory state)", () => {
    const originalBit = assignFieldBit("Desired Altitude");
    assignFieldBit("Company Route"); // consume another bit so a naive re-derivation would drift

    // Simulate a restart: close the connection this module's getSqliteConnection()
    // resolves through and reopen the SAME file. Nothing in decoded-search-index.ts
    // may cache a label→bit mapping in memory, or this would still pass even if it
    // did — the whole point is that the answer comes from the file, not the process.
    closeDatabase();
    initDatabase(dbPath);

    expect(assignFieldBit("Desired Altitude")).toBe(originalBit);
  });

  it("a label at bit position 63 lands in mask_hi, not mask_lo", () => {
    // Seed 63 filler labels (ids 0-62) so the next assignment is exactly 63 —
    // the first id that crosses into mask_hi. See MASK_LO_BITS in the module
    // under test: bits 0-62 (63 of them) are mask_lo; bit 63 is mask_hi bit 0.
    for (let bit = 0; bit < 63; bit++) {
      seedFieldAtBit(bit, `filler-${bit}`);
    }

    const bit = assignFieldBit("Real Field At 63");
    expect(bit).toBe(63);

    const mask = fieldBitToMask(bit);
    expect(mask.maskLo).toBe(0n);
    expect(mask.maskHi).toBe(1n);
  });

  it("throws loudly when all 126 bit positions are exhausted, without truncating or wrapping", () => {
    for (let bit = 0; bit <= MAX_FIELD_BIT; bit++) {
      seedFieldAtBit(bit, `filler-${bit}`);
    }
    expect(countRows("decoded_field")).toBe(MAX_FIELD_BIT + 1);

    expect(() => assignFieldBit("One Field Too Many")).toThrow(
      /bit space exhausted/i,
    );

    // Nothing was silently truncated (no wraparound reuse of bit 0) or
    // wrapped in — the table still has exactly the 126 filler rows and no
    // new row for the rejected label.
    expect(countRows("decoded_field")).toBe(MAX_FIELD_BIT + 1);
    expect(lookupFieldBit("One Field Too Many")).toBeNull();
  });
});

describe("lookupFieldBit", () => {
  it("returns null for a label that has never been assigned a bit", () => {
    expect(lookupFieldBit("Never Seen")).toBeNull();
  });

  it("returns the assigned bit without creating a new one", () => {
    const bit = assignFieldBit("Altitude");
    expect(lookupFieldBit("Altitude")).toBe(bit);
    expect(countRows("decoded_field")).toBe(1);

    // Calling lookupFieldBit again must not create a second row.
    lookupFieldBit("Altitude");
    expect(countRows("decoded_field")).toBe(1);
  });
});

describe("buildFieldMask", () => {
  it("returns an all-zero mask for no field labels", () => {
    const mask = buildFieldMask([]);
    expect(mask.maskLo).toBe(0n);
    expect(mask.maskHi).toBe(0n);
  });

  it("ORs multiple field bits together", () => {
    const mask = buildFieldMask(["Altitude", "Heading", "Groundspeed"]);
    expect(mask.maskLo).toBe(0b111n);
    expect(mask.maskHi).toBe(0n);
  });

  it("is safe against duplicate labels in the input", () => {
    const withDupes = buildFieldMask(["Altitude", "Altitude", "Heading"]);
    const withoutDupes = buildFieldMask(["Altitude", "Heading"]);
    expect(withDupes.maskLo).toBe(withoutDupes.maskLo);
    expect(withDupes.maskHi).toBe(withoutDupes.maskHi);
  });
});

describe("findOrCreateDecoderVariant", () => {
  it("creates a new row and returns its id", () => {
    const id = findOrCreateDecoderVariant("label-sq", "1.9.1", "Squitter");
    expect(typeof id).toBe("number");
    expect(countRows("decoder_variant")).toBe(1);
  });

  it("returns the same id for the same (name, version, description) triple", () => {
    const first = findOrCreateDecoderVariant("label-sq", "1.9.1", "Squitter");
    const second = findOrCreateDecoderVariant("label-sq", "1.9.1", "Squitter");
    expect(second).toBe(first);
    expect(countRows("decoder_variant")).toBe(1);
  });

  it("a differing description yields a different id", () => {
    const first = findOrCreateDecoderVariant("arinc-702", "1.9.1", "Route A");
    const second = findOrCreateDecoderVariant("arinc-702", "1.9.1", "Route B");
    expect(second).not.toBe(first);
    expect(countRows("decoder_variant")).toBe(2);
  });

  // What these two prove, and what they do not: removing the JS-level
  // `decoderName ?? ""` normalisation does fail them, but via an uncaught
  // NOT NULL constraint from the schema rather than via the "same id / one
  // row" assertions below. The schema's NOT NULL is the backstop and it
  // fires first, so these pin that the sentinel is enforced SOMEWHERE, not
  // that the JS path specifically does it. That is the property that
  // matters — SQLite treats NULLs as distinct under UNIQUE, so a nullable
  // decoder_name would permit unlimited duplicate rows and make
  // find-or-create match nothing.
  it("does not duplicate on the '' decoder_name sentinel for null", () => {
    const first = findOrCreateDecoderVariant(null, "1.9.1", "Unknown");
    const second = findOrCreateDecoderVariant(null, "1.9.1", "Unknown");
    expect(second).toBe(first);
    expect(countRows("decoder_variant")).toBe(1);
  });

  it("does not duplicate on the '' decoder_name sentinel for undefined", () => {
    const first = findOrCreateDecoderVariant(undefined, "1.9.1", "Unknown");
    const second = findOrCreateDecoderVariant(undefined, "1.9.1", "Unknown");
    expect(second).toBe(first);
    expect(countRows("decoder_variant")).toBe(1);
  });

  it("null and undefined decoder_name intern to the SAME '' row", () => {
    const withNull = findOrCreateDecoderVariant(null, "1.9.1", "Unknown");
    const withUndefined = findOrCreateDecoderVariant(
      undefined,
      "1.9.1",
      "Unknown",
    );
    expect(withUndefined).toBe(withNull);
    expect(countRows("decoder_variant")).toBe(1);
  });
});

describe("writeDecodedMessageIndexRow / getMessageFieldMask", () => {
  it("returns null for a message with no decoded_messages row", () => {
    const messageId = insertTestMessage();
    expect(getMessageFieldMask(messageId)).toBeNull();
  });

  it("round-trips a simple mask exactly", () => {
    const messageId = insertTestMessage();
    const variantId = findOrCreateDecoderVariant("label-sq", "1.9.1", "Squitter");
    writeDecodedMessageIndexRow(messageId, variantId, {
      maskLo: 0b101n,
      maskHi: 0n,
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(0b101n);
    expect(mask?.maskHi).toBe(0n);
  });

  it("upsert is idempotent for the same message_id (no duplicate row, values replaced)", () => {
    const messageId = insertTestMessage();
    const variantA = findOrCreateDecoderVariant("label-a", "1.0.0", "A");
    const variantB = findOrCreateDecoderVariant("label-b", "1.0.0", "B");

    writeDecodedMessageIndexRow(messageId, variantA, { maskLo: 1n, maskHi: 0n });
    writeDecodedMessageIndexRow(messageId, variantB, { maskLo: 2n, maskHi: 0n });

    expect(countRows("decoded_messages")).toBe(1);
    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(2n);

    const row = getSqliteConnection()
      .prepare("SELECT variant_id AS variantId FROM decoded_messages WHERE message_id = ?")
      .get(messageId) as { variantId: number };
    expect(row.variantId).toBe(variantB);
  });
});

describe("mask precision — the critical regression tests", () => {
  // These pin exact bigint round-tripping at bit positions that are silently
  // corrupted if the implementation uses `number` instead of `bigint`:
  // - 52 and 53 straddle Number.MAX_SAFE_INTEGER's bit width (2^53 - 1)
  // - 62 is the top bit of mask_lo (SQLite INTEGER is signed 64-bit, so bit
  //   63 would be the sign bit — this is why the mask splits into two columns)
  // - 63 is the first bit of mask_hi
  // - 125 is the top bit of mask_hi (CHECK(id BETWEEN 0 AND 125))

  it("round-trips a single field at bit 52 with exact equality", () => {
    seedFieldAtBit(52, "Bit52Field");
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Bit52Field"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(1n << 52n);
    expect(mask?.maskHi).toBe(0n);
  });

  it("round-trips a single field at bit 53 with exact equality", () => {
    seedFieldAtBit(53, "Bit53Field");
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Bit53Field"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(1n << 53n);
    expect(mask?.maskHi).toBe(0n);
  });

  it("round-trips a single field at bit 62 (top of mask_lo) with exact equality", () => {
    seedFieldAtBit(62, "Bit62Field");
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Bit62Field"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(1n << 62n);
    expect(mask?.maskHi).toBe(0n);
  });

  it("round-trips a single field at bit 63 (first bit of mask_hi) with exact equality", () => {
    seedFieldAtBit(63, "Bit63Field");
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Bit63Field"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(0n);
    expect(mask?.maskHi).toBe(1n);
  });

  it("round-trips a single field at bit 125 (top of mask_hi) with exact equality", () => {
    seedFieldAtBit(125, "Bit125Field");
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Bit125Field"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(0n);
    expect(mask?.maskHi).toBe(1n << 62n);
  });

  it("round-trips a combined mask with bits 52, 53, 62, 63 AND 125 all set, with exact equality", () => {
    seedFieldAtBit(52, "Bit52Field");
    seedFieldAtBit(53, "Bit53Field");
    seedFieldAtBit(62, "Bit62Field");
    seedFieldAtBit(63, "Bit63Field");
    seedFieldAtBit(125, "Bit125Field");

    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: [
        "Bit52Field",
        "Bit53Field",
        "Bit62Field",
        "Bit63Field",
        "Bit125Field",
      ],
    });

    const expectedMaskLo = (1n << 52n) | (1n << 53n) | (1n << 62n);
    const expectedMaskHi = (1n << 0n) | (1n << 62n);

    const mask = getMessageFieldMask(messageId);
    expect(mask).not.toBeNull();
    // toBe (not toEqual) is deliberate: these must be the exact same bigint
    // value, not a `number` that happens to print the same digits.
    expect(mask?.maskLo).toBe(expectedMaskLo);
    expect(mask?.maskHi).toBe(expectedMaskHi);

    // Cross-check against Number.MAX_SAFE_INTEGER to make the "why this
    // matters" concrete: if maskLo had round-tripped through `number`, it
    // would not equal this exact bigint.
    expect(expectedMaskLo > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("a mask with only low bits set is unaffected (sanity check against a trivially-passing test)", () => {
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "precision-test",
      decoderVersion: "1.0.0",
      description: "Precision Test",
      fieldLabels: ["Altitude", "Heading"],
    });

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(0b11n);
    expect(mask?.maskHi).toBe(0n);
  });
});

describe("indexDecodedMessage", () => {
  it("writes a row referencing a found-or-created variant and a built mask", () => {
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Squitter",
      fieldLabels: ["Latitude", "Longitude"],
    });

    expect(countRows("decoded_messages")).toBe(1);
    expect(countRows("decoder_variant")).toBe(1);
    expect(countRows("decoded_field")).toBe(2);

    const mask = getMessageFieldMask(messageId);
    expect(mask?.maskLo).toBe(0b11n);
  });

  it("is idempotent for the same message_id", () => {
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Squitter",
      fieldLabels: ["Latitude"],
    });
    indexDecodedMessage({
      messageId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Squitter",
      fieldLabels: ["Latitude"],
    });

    expect(countRows("decoded_messages")).toBe(1);
  });

  it("re-indexing the same message with different content replaces the row rather than erroring", () => {
    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Squitter",
      fieldLabels: ["Latitude"],
    });
    indexDecodedMessage({
      messageId,
      decoderName: "arinc-702",
      decoderVersion: "1.9.1",
      description: "Route",
      fieldLabels: ["Company Route"],
    });

    expect(countRows("decoded_messages")).toBe(1);
    const row = getSqliteConnection()
      .prepare(
        `SELECT dv.description AS description FROM decoded_messages dm
         JOIN decoder_variant dv ON dv.id = dm.variant_id
         WHERE dm.message_id = ?`,
      )
      .get(messageId) as { description: string };
    expect(row.description).toBe("Route");
  });

  it("does not commit anything (no variant row, no field rows, no decoded_messages row) when bit exhaustion throws", () => {
    for (let bit = 0; bit <= MAX_FIELD_BIT; bit++) {
      seedFieldAtBit(bit, `filler-${bit}`);
    }
    const messageId = insertTestMessage();

    expect(() =>
      indexDecodedMessage({
        messageId,
        decoderName: "overflow-decoder",
        decoderVersion: "1.0.0",
        description: "Overflow",
        fieldLabels: ["One Field Too Many"],
      }),
    ).toThrow(/bit space exhausted/i);

    expect(countRows("decoder_variant")).toBe(0);
    expect(countRows("decoded_messages")).toBe(0);
    expect(countRows("decoded_field")).toBe(MAX_FIELD_BIT + 1);
  });

  it("cascades: deleting the referenced messages row removes the decoded_messages row", () => {
    // Uses the app's real runtime connection (initDatabase() at the top of
    // this file, which turns PRAGMA foreign_keys ON at db/client.ts:134) —
    // unlike runMigrations()'s bare connection, this is the connection
    // indexDecodedMessage() itself writes through, so this proves the
    // cascade fires for rows this module actually produces.
    expect(
      getSqliteConnection().pragma("foreign_keys", { simple: true }),
    ).toBe(1);

    const messageId = insertTestMessage();
    indexDecodedMessage({
      messageId,
      decoderName: "label-sq",
      decoderVersion: "1.9.1",
      description: "Squitter",
      fieldLabels: ["Latitude"],
    });
    expect(countRows("decoded_messages")).toBe(1);

    getDatabase()
      .delete(messages)
      .where(eq(messages.id, messageId))
      .run();

    expect(countRows("decoded_messages")).toBe(0);
  });
});

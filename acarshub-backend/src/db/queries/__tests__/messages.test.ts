/**
 * Unit tests for message query functions
 *
 * Tests cover:
 * - FTS5 full-text search with prefix matching
 * - LIKE-based fallback for substring matching
 * - Pagination and sorting
 * - Edge cases and error handling
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../client.js";
import * as schema from "../../schema.js";
import {
  addMessage,
  databaseSearch,
  deleteOldMessages,
  getMessageByUid,
  getRowCount,
  grabMostRecent,
} from "../messages.js";

describe("Message Query Functions", () => {
  let db: Database.Database;
  let _originalGetDatabase: typeof clientModule.getDatabase;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Set up test database with schema
    // Note: We're creating a simplified schema without full migrations for faster tests
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        message_type TEXT,
        msg_time INTEGER NOT NULL,
        station_id TEXT,
        toaddr TEXT,
        fromaddr TEXT,
        depa TEXT,
        dsta TEXT,
        eta TEXT,
        gtout TEXT,
        gtin TEXT,
        wloff TEXT,
        wlin TEXT,
        lat REAL,
        lon REAL,
        alt INTEGER,
        msg_text TEXT,
        tail TEXT,
        flight TEXT,
        icao TEXT,
        freq TEXT,
        ack TEXT,
        mode TEXT,
        label TEXT,
        block_id TEXT,
        msgno TEXT,
        is_response INTEGER,
        is_onground INTEGER,
        error INTEGER,
        libacars TEXT,
        level REAL,
        aircraft_id TEXT
      );

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

    // Mock getDatabase to return our test database
    _originalGetDatabase = clientModule.getDatabase;
    vi.spyOn(clientModule, "getDatabase").mockReturnValue(
      drizzle(db, { schema }),
    );

    // Insert test messages
    const testMessages = [
      {
        messageType: "ACARS",
        time: 1704067200, // 2024-01-01 00:00:00
        stationId: "KORD",
        toaddr: "123456",
        fromaddr: ".AAABCD",
        depa: "KORD",
        dsta: "KLAX",
        tail: "N123UA",
        flight: "UAL123",
        icao: "ABF308",
        freq: "131.550",
        label: "H1",
        text: "EMERGENCY FUEL LOW",
        lat: 41.9742,
        lon: -87.9073,
        alt: 35000,
        ack: "!",
        mode: "2",
        msgno: "M01A",
        blockId: "1",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -25,
      },
      {
        messageType: "VDLM2",
        time: 1704067260, // 2024-01-01 00:01:00
        stationId: "KJFK",
        toaddr: "234567",
        fromaddr: ".AABDEF",
        depa: "KJFK",
        dsta: "EGLL",
        tail: "N456AA",
        flight: "AAL456",
        icao: "C0FFEE",
        freq: "136.975",
        label: "SA",
        text: "POSITION REPORT LAT 40.7128 LON -74.0060",
        lat: 40.7128,
        lon: -74.006,
        alt: 38000,
        ack: "!",
        mode: "2",
        msgno: "M02A",
        blockId: "2",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -30,
      },
      {
        messageType: "HFDL",
        time: 1704067320, // 2024-01-01 00:02:00
        stationId: "KSFO",
        toaddr: "345678",
        fromaddr: ".AACGHI",
        depa: "KSFO",
        dsta: "RJTT",
        tail: "N789DL",
        flight: "DAL789",
        icao: "DEADBE",
        freq: "8.912",
        label: "Q0",
        text: "REQUEST DESCENT TO FL350",
        lat: 37.7749,
        lon: -122.4194,
        alt: 41000,
        ack: "!",
        mode: "2",
        msgno: "M03A",
        blockId: "3",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -20,
      },
      {
        messageType: "ACARS",
        time: 1704067380, // 2024-01-01 00:03:00
        stationId: "KORD",
        toaddr: "456789",
        fromaddr: ".AADJKL",
        depa: "KORD",
        dsta: "KATL",
        tail: "N111WN",
        flight: "SWA111",
        icao: "CAFE01",
        freq: "131.550",
        label: "10",
        text: "OUT TIME 0003Z",
        lat: 41.9742,
        lon: -87.9073,
        alt: 0,
        ack: "!",
        mode: "2",
        msgno: "M04A",
        blockId: "4",
        isResponse: 0,
        isOnground: 1,
        error: 0,
        level: -15,
      },
    ];

    for (const msg of testMessages) {
      addMessage(msg);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe("addMessage()", () => {
    it("should insert message and generate UID", () => {
      const message = {
        messageType: "ACARS",
        time: 1704067440,
        stationId: "TEST",
        toaddr: "567890",
        fromaddr: ".AAEMNO",
        depa: "TEST",
        dsta: "TEST",
        tail: "TEST123",
        flight: "TST999",
        icao: "TEST99",
        freq: "131.550",
        label: "H1",
        text: "TEST MESSAGE",
        lat: 0,
        lon: 0,
        alt: 0,
        ack: "!",
        mode: "2",
        msgno: "M05A",
        blockId: "5",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -25,
      };

      const inserted = addMessage(message);

      expect(inserted.uid).toBeDefined();
      expect(inserted.uid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(inserted.tail).toBe("TEST123");
      expect(inserted.flight).toBe("TST999");
    });
  });

  describe("getRowCount()", () => {
    it("should return total message count", () => {
      const count = getRowCount();
      expect(count).toBe(4);
    });

    it("should return 0 for empty database", () => {
      db.exec("DELETE FROM messages");
      const count = getRowCount();
      expect(count).toBe(0);
    });
  });

  describe("grabMostRecent()", () => {
    it("should return N most recent messages", () => {
      const recent = grabMostRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].flight).toBe("SWA111"); // Most recent
      expect(recent[1].flight).toBe("DAL789"); // Second most recent
    });

    it("should default to 50 messages", () => {
      const recent = grabMostRecent();
      expect(recent).toHaveLength(4); // Less than 50 in test DB
    });
  });

  describe("getMessageByUid()", () => {
    it("should find message by UID", () => {
      const inserted = addMessage({
        messageType: "ACARS",
        time: 1704067500,
        stationId: "TEST",
        toaddr: "678901",
        fromaddr: ".AAFPQR",
        depa: "TEST",
        dsta: "TEST",
        tail: "FIND123",
        flight: "FND999",
        icao: "FIND99",
        freq: "131.550",
        label: "H1",
        text: "FINDME",
        lat: 0,
        lon: 0,
        alt: 0,
        ack: "!",
        mode: "2",
        msgno: "M06A",
        blockId: "6",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -25,
      });

      const found = getMessageByUid(inserted.uid);
      expect(found).toBeDefined();
      expect(found?.uid).toBe(inserted.uid);
      expect(found?.tail).toBe("FIND123");
    });

    it("should return undefined for nonexistent UID", () => {
      const found = getMessageByUid("00000000-0000-0000-0000-000000000000");
      expect(found).toBeUndefined();
    });
  });

  describe("deleteOldMessages()", () => {
    it("should delete messages before timestamp", () => {
      const beforeCount = getRowCount();
      expect(beforeCount).toBe(4);

      // Delete messages before 2024-01-01 00:01:30 (should delete first 2)
      const deleted = deleteOldMessages(1704067290);
      expect(deleted).toBe(2);

      const afterCount = getRowCount();
      expect(afterCount).toBe(2);
    });

    it("should return 0 when no messages match", () => {
      const deleted = deleteOldMessages(1704067000); // Before all messages
      expect(deleted).toBe(0);
    });
  });

  describe("databaseSearch() - FTS5 Integration", () => {
    it("should search by flight number using FTS5 (prefix match)", () => {
      const result = databaseSearch({ flight: "UAL" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].flight).toBe("UAL123");
    });

    it("should search by tail number using FTS5 (prefix match)", () => {
      const result = databaseSearch({ tail: "N123" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].tail).toBe("N123UA");
    });

    it("should search by ICAO hex using FTS5 (prefix match)", () => {
      const result = databaseSearch({ icao: "ABF" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].icao).toBe("ABF308");
    });

    it("should search by departure airport using FTS5", () => {
      const result = databaseSearch({ depa: "KORD" });
      expect(result.totalCount).toBe(2);
      expect(result.messages).toHaveLength(2);
    });

    it("should search by destination airport using FTS5", () => {
      const result = databaseSearch({ dsta: "KLAX" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].dsta).toBe("KLAX");
    });

    it("should search by label using FTS5", () => {
      const result = databaseSearch({ label: "H1" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].label).toBe("H1");
    });

    it("should search message text using FTS5", () => {
      const result = databaseSearch({ text: "EMERGENCY" });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toContain("EMERGENCY");
    });

    it("should search by frequency using FTS5", () => {
      const result = databaseSearch({ freq: "131.550" });
      expect(result.totalCount).toBe(2);
      expect(result.messages).toHaveLength(2);
    });

    it("should combine multiple search terms with AND logic", () => {
      const result = databaseSearch({
        depa: "KORD",
        label: "H1",
      });
      expect(result.totalCount).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].flight).toBe("UAL123");
    });

    it("should return empty results when no matches", () => {
      const result = databaseSearch({ flight: "NONEXISTENT" });
      expect(result.totalCount).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("should handle case-insensitive search", () => {
      const result = databaseSearch({ flight: "ual" }); // lowercase
      expect(result.totalCount).toBe(1);
      expect(result.messages[0].flight).toBe("UAL123");
    });

    it("should support pagination with limit and offset", () => {
      // Insert more messages to test pagination
      for (let i = 0; i < 10; i++) {
        addMessage({
          messageType: "ACARS",
          time: 1704067400 + i,
          stationId: "PAGE",
          toaddr: `${100000 + i}`,
          fromaddr: ".AAPAGE",
          depa: "PAGE",
          dsta: "TEST",
          tail: `PAGE${i}`,
          flight: `PG${i}`,
          icao: `PAGE0${i}`,
          freq: "131.550",
          label: "PG",
          text: "PAGINATION TEST",
          lat: 0,
          lon: 0,
          alt: 0,
          ack: "!",
          mode: "2",
          msgno: `MP${i}`,
          blockId: `${100 + i}`,
          isResponse: 0,
          isOnground: 0,
          error: 0,
          level: -25,
        });
      }

      // Get first page
      const page1 = databaseSearch({ depa: "PAGE", limit: 5, offset: 0 });
      expect(page1.messages).toHaveLength(5);
      expect(page1.totalCount).toBe(10);

      // Get second page
      const page2 = databaseSearch({ depa: "PAGE", limit: 5, offset: 5 });
      expect(page2.messages).toHaveLength(5);
      expect(page2.totalCount).toBe(10);

      // Ensure no overlap
      const page1Ids = page1.messages.map((m) => m.id);
      const page2Ids = page2.messages.map((m) => m.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it("should handle time range filters", () => {
      const result = databaseSearch({
        startTime: 1704067200,
        endTime: 1704067300,
      });
      expect(result.totalCount).toBe(2); // First two messages
      expect(result.messages).toHaveLength(2);
    });

    it("should filter by message type", () => {
      const result = databaseSearch({ messageType: "VDLM2" });
      expect(result.totalCount).toBe(1);
      expect(result.messages[0].messageType).toBe("VDLM2");
    });

    it("should handle FTS5 special characters safely", () => {
      // Insert message with special characters
      addMessage({
        messageType: "ACARS",
        time: 1704067600,
        stationId: "SPEC",
        toaddr: "789012",
        fromaddr: ".AASPEC",
        depa: "SPEC",
        dsta: "TEST",
        tail: 'N"SPEC"',
        flight: "SPEC*123",
        icao: "SPEC99",
        freq: "131.550",
        label: "SP",
        text: 'SPECIAL "CHARS" TEST*',
        lat: 0,
        lon: 0,
        alt: 0,
        ack: "!",
        mode: "2",
        msgno: "MSP",
        blockId: "999",
        isResponse: 0,
        isOnground: 0,
        error: 0,
        level: -25,
      });

      // Should not crash with special characters
      const result = databaseSearch({ text: 'SPECIAL "CHARS"' });
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("databaseSearch() - LIKE Fallback", () => {
    it("should use LIKE search when station_id is specified", () => {
      // Should find messages with KORD as station_id
      const result = databaseSearch({ stationId: "KORD" });
      expect(result.totalCount).toBe(2);
      expect(result.messages).toHaveLength(2);
    });

    it("should support substring matching with LIKE for station_id", () => {
      // Should find messages with "ORD" anywhere in station_id
      const result = databaseSearch({ stationId: "ORD" });
      expect(result.totalCount).toBe(2);
      expect(result.messages.every((m) => m.stationId?.includes("ORD"))).toBe(
        true,
      );
    });

    it("should combine LIKE search with other filters", () => {
      const result = databaseSearch({
        stationId: "KORD",
        label: "H1",
      });
      expect(result.totalCount).toBe(1);
      expect(result.messages[0].flight).toBe("UAL123");
    });
  });

  describe("databaseSearch() - Sorting", () => {
    it("should sort by time descending by default", () => {
      const result = databaseSearch({});
      if (result.messages.length > 0) {
        expect(result.messages[0].time).toBeGreaterThanOrEqual(
          result.messages[result.messages.length - 1].time,
        );
      }
    });

    it("should sort by time ascending when specified", () => {
      const result = databaseSearch({ sortBy: "time", sortOrder: "asc" });
      if (result.messages.length > 0) {
        expect(result.messages[0].time).toBeLessThanOrEqual(
          result.messages[result.messages.length - 1].time,
        );
      }
    });

    it("should sort by tail number", () => {
      const result = databaseSearch({ sortBy: "tail", sortOrder: "asc" });
      if (result.messages.length > 1) {
        const firstTail = result.messages[0].tail || "";
        const lastTail = result.messages[result.messages.length - 1].tail || "";
        expect(firstTail.localeCompare(lastTail)).toBeLessThanOrEqual(0);
      }
    });

    it("should sort by flight number", () => {
      const result = databaseSearch({ sortBy: "flight", sortOrder: "asc" });
      if (result.messages.length > 1) {
        const firstFlight = result.messages[0].flight || "";
        const lastFlight =
          result.messages[result.messages.length - 1].flight || "";
        expect(firstFlight.localeCompare(lastFlight)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("databaseSearch() - Edge Cases", () => {
    it("should handle empty search parameters", () => {
      const result = databaseSearch({});
      expect(result.totalCount).toBe(4);
      expect(result.messages).toHaveLength(4);
    });

    it("should handle whitespace-only search terms", () => {
      const result = databaseSearch({ flight: "   " });
      expect(result.totalCount).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("should handle very large limit", () => {
      const result = databaseSearch({ limit: 1000000 });
      expect(result.messages.length).toBeLessThanOrEqual(result.totalCount);
    });

    it("should handle offset beyond result set", () => {
      const result = databaseSearch({ offset: 1000 });
      expect(result.messages).toHaveLength(0);
      expect(result.totalCount).toBeGreaterThan(0); // Total count still valid
    });

    it("should handle null/undefined optional fields", () => {
      const result = databaseSearch({
        flight: undefined,
        tail: undefined,
        icao: undefined,
      });
      expect(result.totalCount).toBe(4);
    });
  });
});

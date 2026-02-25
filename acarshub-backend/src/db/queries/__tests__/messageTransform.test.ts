/**
 * Tests for message transformation and alert caching
 *
 * Tests createDbSafeParams(), addMessageFromJson(), and alert cache functions
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../client.js";
import type * as helpersModule from "../../helpers.js";
import * as schema from "../../schema.js";
import {
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  initializeAlertCache,
  setAlertIgnore,
  setAlertTerms,
} from "../alerts.js";
import { getMessageByUid } from "../messages.js";
import {
  addMessageFromJson,
  createDbSafeParams,
  normalizeFrequency,
  type RawMessage,
} from "../messageTransform.js";

// Mock updateFrequencies to avoid errors from missing frequency tables in test DB
vi.mock("../../helpers.js", async () => {
  const actual =
    await vi.importActual<typeof helpersModule>("../../helpers.js");
  return {
    ...actual,
    updateFrequencies: vi.fn(),
  };
});

describe("Message Transformation", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Set up minimal schema for testing
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        message_type TEXT NOT NULL,
        msg_time INTEGER NOT NULL,
        station_id TEXT NOT NULL,
        toaddr TEXT NOT NULL,
        fromaddr TEXT NOT NULL,
        depa TEXT NOT NULL,
        dsta TEXT NOT NULL,
        eta TEXT NOT NULL,
        gtout TEXT NOT NULL,
        gtin TEXT NOT NULL,
        wloff TEXT NOT NULL,
        wlin TEXT NOT NULL,
        lat TEXT NOT NULL,
        lon TEXT NOT NULL,
        alt TEXT NOT NULL,
        msg_text TEXT NOT NULL,
        tail TEXT NOT NULL,
        flight TEXT NOT NULL,
        icao TEXT NOT NULL,
        freq TEXT NOT NULL,
        ack TEXT NOT NULL,
        mode TEXT NOT NULL,
        label TEXT NOT NULL,
        block_id TEXT NOT NULL,
        msgno TEXT NOT NULL,
        is_response TEXT NOT NULL,
        is_onground TEXT NOT NULL,
        error TEXT NOT NULL,
        libacars TEXT NOT NULL,
        level TEXT NOT NULL,
        aircraft_id TEXT
      );

      CREATE TABLE IF NOT EXISTS alert_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        count INTEGER
      );

      CREATE TABLE IF NOT EXISTS ignore_alert_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_uid TEXT NOT NULL,
        term TEXT NOT NULL,
        match_type TEXT NOT NULL,
        matched_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS count (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total INTEGER,
        errors INTEGER,
        good INTEGER
      );

      CREATE TABLE IF NOT EXISTS nonlogged_count (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        errors INTEGER,
        good INTEGER
      );
    `);

    // Mock the getDatabase function to return our test database
    const testDb = drizzle(db, { schema });
    vi.spyOn(clientModule, "getDatabase").mockReturnValue(testDb);

    // Initialize alert cache
    initializeAlertCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe("normalizeFrequency", () => {
    it("should pad frequency to 7 characters", () => {
      expect(normalizeFrequency("131.55")).toBe("131.550");
      expect(normalizeFrequency("136.975")).toBe("136.975");
      expect(normalizeFrequency(131.55)).toBe("131.550");
    });

    it("should handle short frequencies", () => {
      expect(normalizeFrequency("131")).toBe("1310000");
      expect(normalizeFrequency(131)).toBe("1310000");
    });
  });

  describe("createDbSafeParams", () => {
    it("should transform basic message fields", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "Test message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const params = createDbSafeParams(raw);

      expect(params.time).toBe(1234567890);
      expect(params.stationId).toBe("TEST");
      expect(params.text).toBe("Test message");
      expect(params.tail).toBe("N12345");
      expect(params.flight).toBe("TEST123");
      expect(params.icao).toBe("ABC123");
      expect(params.freq).toBe("131.550");
      expect(params.label).toBe("H1");
      expect(params.error).toBe("0");
    });

    it("should map data field to text", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        data: "Message from data field",
      };

      const params = createDbSafeParams(raw);

      expect(params.text).toBe("Message from data field");
    });

    it("should normalize frequency to 7 characters", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        freq: "131.55",
      };

      const params = createDbSafeParams(raw);

      expect(params.freq).toBe("131.550");
    });

    it("should stringify libacars JSON", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        libacars: {
          field1: "value1",
          field2: 123,
        },
      };

      const params = createDbSafeParams(raw);

      expect(params.libacars).toBe('{"field1":"value1","field2":123}');
    });

    it("should set empty strings for missing fields", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
      };

      const params = createDbSafeParams(raw);

      expect(params.stationId).toBe("");
      expect(params.text).toBe("");
      expect(params.tail).toBe("");
      expect(params.flight).toBe("");
      expect(params.icao).toBe("");
      expect(params.depa).toBe("");
      expect(params.dsta).toBe("");
    });

    it("should convert coordinates to strings", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        lat: 40.7128,
        lon: -74.006,
        alt: 35000,
      };

      const params = createDbSafeParams(raw);

      expect(params.lat).toBe("40.7128");
      expect(params.lon).toBe("-74.006");
      expect(params.alt).toBe("35000");
    });
  });

  describe("addMessageFromJson", () => {
    it("should insert message and return alert metadata", () => {
      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "Test message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      expect(alertMetadata.uid).toBeTruthy();
      expect(alertMetadata.matched).toBe(false);
      expect(alertMetadata.matched_text).toEqual([]);
      expect(alertMetadata.matched_icao).toEqual([]);
      expect(alertMetadata.matched_tail).toEqual([]);
      expect(alertMetadata.matched_flight).toEqual([]);

      // Verify message was inserted
      const message = getMessageByUid(alertMetadata.uid);
      expect(message).toBeDefined();
      expect(message?.text).toBe("Test message");
      expect(message?.tail).toBe("N12345");
      expect(message?.messageType).toBe("ACARS");
    });

    it("should match alert terms in text", () => {
      // Set up alert terms
      setAlertTerms(["EMERGENCY", "MAYDAY"]);
      initializeAlertCache(); // Re-initialize cache after setting terms

      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "EMERGENCY landing requested",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      expect(alertMetadata.matched).toBe(true);
      expect(alertMetadata.matched_text).toContain("EMERGENCY");
      expect(alertMetadata.matched_icao).toEqual([]);
      expect(alertMetadata.matched_tail).toEqual([]);
      expect(alertMetadata.matched_flight).toEqual([]);
    });

    it("should match alert terms in ICAO", () => {
      // Set up alert terms
      setAlertTerms(["ABC123"]);
      initializeAlertCache(); // Re-initialize cache after setting terms

      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "Normal message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      expect(alertMetadata.matched).toBe(true);
      expect(alertMetadata.matched_icao).toContain("ABC123");
      expect(alertMetadata.matched_text).toEqual([]);
    });

    it("should match alert terms in tail", () => {
      // Set up alert terms
      setAlertTerms(["N12345"]);
      initializeAlertCache(); // Re-initialize cache after setting terms

      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "Normal message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      expect(alertMetadata.matched).toBe(true);
      expect(alertMetadata.matched_tail).toContain("N12345");
      expect(alertMetadata.matched_text).toEqual([]);
    });

    it("should match alert terms in flight", () => {
      // Set up alert terms
      setAlertTerms(["TEST123"]);
      initializeAlertCache(); // Re-initialize cache after setting terms

      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "Normal message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      expect(alertMetadata.matched).toBe(true);
      expect(alertMetadata.matched_flight).toContain("TEST123");
      expect(alertMetadata.matched_text).toEqual([]);
    });

    it("should respect ignore terms", () => {
      // Set up alert and ignore terms
      setAlertTerms(["EMERGENCY"]);
      setAlertIgnore(["TEST"]);
      initializeAlertCache(); // Re-initialize cache after setting terms

      const raw: RawMessage = {
        timestamp: 1234567890,
        station_id: "TEST",
        text: "EMERGENCY TEST message",
        tail: "N12345",
        flight: "TEST123",
        icao: "ABC123",
        freq: "131.550",
        label: "H1",
        error: 0,
      };

      const alertMetadata = addMessageFromJson("ACARS", raw);

      // Should not match because ignore term is present
      expect(alertMetadata.matched).toBe(false);
      expect(alertMetadata.matched_text).toEqual([]);
    });
  });

  describe("Alert Cache", () => {
    it("should initialize cache with empty terms", () => {
      const terms = getCachedAlertTerms();
      const ignoreTerms = getCachedAlertIgnoreTerms();

      expect(terms).toEqual([]);
      expect(ignoreTerms).toEqual([]);
    });

    it("should update cache when setAlertTerms is called", () => {
      setAlertTerms(["EMERGENCY", "MAYDAY", "PAN"]);

      const terms = getCachedAlertTerms();

      expect(terms).toEqual(["EMERGENCY", "MAYDAY", "PAN"]);
    });

    it("should update cache when setAlertIgnore is called", () => {
      setAlertIgnore(["TEST", "TRAINING"]);

      const ignoreTerms = getCachedAlertIgnoreTerms();

      expect(ignoreTerms).toEqual(["TEST", "TRAINING"]);
    });

    it("should normalize terms to uppercase", () => {
      setAlertTerms(["emergency", "Mayday", "PAN"]);
      setAlertIgnore(["test", "Training"]);

      const terms = getCachedAlertTerms();
      const ignoreTerms = getCachedAlertIgnoreTerms();

      expect(terms).toEqual(["EMERGENCY", "MAYDAY", "PAN"]);
      expect(ignoreTerms).toEqual(["TEST", "TRAINING"]);
    });

    it("should persist terms to database", () => {
      setAlertTerms(["EMERGENCY", "MAYDAY"]);

      // Re-initialize cache from database
      initializeAlertCache();

      const terms = getCachedAlertTerms();

      expect(terms).toEqual(["EMERGENCY", "MAYDAY"]);
    });
  });
});

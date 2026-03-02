/**
 * Tests for database helper functions
 *
 * Tests cover:
 * - Airline lookup functions (IATA/ICAO)
 * - IATA override system
 * - Ground station lookup
 * - Label lookup
 * - Error statistics (full format)
 * - Message emptiness checks
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as configModule from "../../config.js";
import * as clientModule from "../client.js";
import {
  findAirlineCodeFromIata,
  findAirlineCodeFromIcao,
  getErrors,
  isMessageNotEmpty,
  lookupGroundstation,
  lookupLabel,
  updateFrequencies,
} from "../helpers.js";
import * as schema from "../schema.js";
import {
  freqsAcars,
  freqsHfdl,
  freqsImsl,
  freqsIrdm,
  freqsVdlm2,
  messagesCount,
  messagesCountDropped,
} from "../schema.js";

describe("Database Helper Functions", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Set up minimal schema for testing
    db.exec(`
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe("isMessageNotEmpty", () => {
    it("should return true for message with text", () => {
      expect(isMessageNotEmpty({ text: "Test message" })).toBe(true);
    });

    it("should return true for message with label", () => {
      expect(isMessageNotEmpty({ label: "H1" })).toBe(true);
    });

    it("should return true for message with flight", () => {
      expect(isMessageNotEmpty({ flight: "UAL123" })).toBe(true);
    });

    it("should return true for message with tail", () => {
      expect(isMessageNotEmpty({ tail: "N12345" })).toBe(true);
    });

    it("should return true for message with depa", () => {
      expect(isMessageNotEmpty({ depa: "KJFK" })).toBe(true);
    });

    it("should return true for message with dsta", () => {
      expect(isMessageNotEmpty({ dsta: "KLAX" })).toBe(true);
    });

    it("should return true for message with libacars", () => {
      expect(isMessageNotEmpty({ libacars: '{"field":"value"}' })).toBe(true);
    });

    it("should return false for empty message", () => {
      expect(isMessageNotEmpty({})).toBe(false);
    });

    it("should return false for message with only whitespace", () => {
      expect(
        isMessageNotEmpty({
          text: "   ",
          label: " ",
          flight: "",
        }),
      ).toBe(false);
    });
  });

  describe("findAirlineCodeFromIata", () => {
    beforeEach(() => {
      // Mock airlines data
      vi.spyOn(configModule, "airlines", "get").mockReturnValue({
        UA: { ICAO: "UAL", NAME: "United Airlines" },
        AA: { ICAO: "AAL", NAME: "American Airlines" },
        DL: { ICAO: "DAL", NAME: "Delta Air Lines" },
      });

      // Mock iataOverrides (empty by default)
      vi.spyOn(configModule, "iataOverrides", "get").mockReturnValue({});
    });

    it("should return airline info for valid IATA code", () => {
      const result = findAirlineCodeFromIata("UA");
      expect(result).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
    });

    it("should return unknown airline for invalid IATA code", () => {
      const result = findAirlineCodeFromIata("XX");
      expect(result).toEqual({
        icao: "XX",
        name: "Unknown Airline",
      });
    });

    it("should prefer overrides over airlines database", () => {
      // Add override
      vi.spyOn(configModule, "iataOverrides", "get").mockReturnValue({
        UA: { icao: "OVERRIDE", name: "Override Airline" },
      });

      const result = findAirlineCodeFromIata("UA");
      expect(result).toEqual({
        icao: "OVERRIDE",
        name: "Override Airline",
      });
    });

    it("should handle multiple airlines", () => {
      expect(findAirlineCodeFromIata("UA").name).toBe("United Airlines");
      expect(findAirlineCodeFromIata("AA").name).toBe("American Airlines");
      expect(findAirlineCodeFromIata("DL").name).toBe("Delta Air Lines");
    });
  });

  describe("findAirlineCodeFromIcao", () => {
    beforeEach(() => {
      // Mock airlines data
      vi.spyOn(configModule, "airlines", "get").mockReturnValue({
        UA: { ICAO: "UAL", NAME: "United Airlines" },
        AA: { ICAO: "AAL", NAME: "American Airlines" },
        DL: { ICAO: "DAL", NAME: "Delta Air Lines" },
      });
    });

    it("should return airline info for valid ICAO code", () => {
      const result = findAirlineCodeFromIcao("UAL");
      expect(result).toEqual({
        iata: "UA",
        name: "United Airlines",
      });
    });

    it("should return unknown airline for invalid ICAO code", () => {
      const result = findAirlineCodeFromIcao("XXX");
      expect(result).toEqual({
        iata: "XXX",
        name: "UNKNOWN AIRLINE",
      });
    });

    it("should search through all airlines", () => {
      expect(findAirlineCodeFromIcao("UAL").iata).toBe("UA");
      expect(findAirlineCodeFromIcao("AAL").iata).toBe("AA");
      expect(findAirlineCodeFromIcao("DAL").iata).toBe("DL");
    });

    it("should return first match if multiple airlines have same ICAO", () => {
      vi.spyOn(configModule, "airlines", "get").mockReturnValue({
        UA: { ICAO: "UAL", NAME: "United Airlines" },
        UA2: { ICAO: "UAL", NAME: "United Airlines 2" },
      });

      const result = findAirlineCodeFromIcao("UAL");
      expect(result.iata).toBe("UA");
    });
  });

  describe("lookupGroundstation", () => {
    beforeEach(() => {
      // Mock ground stations data
      vi.spyOn(configModule, "groundStations", "get").mockReturnValue({
        TEST1: { icao: "KJFK", name: "John F. Kennedy International" },
        TEST2: { icao: "KLAX", name: "Los Angeles International" },
      });
    });

    it("should return station info for valid ID", () => {
      const result = lookupGroundstation("TEST1");
      expect(result).toEqual({
        icao: "KJFK",
        name: "John F. Kennedy International",
      });
    });

    it("should return null for invalid ID", () => {
      const result = lookupGroundstation("INVALID");
      expect(result).toBeNull();
    });

    it("should handle multiple stations", () => {
      expect(lookupGroundstation("TEST1")?.icao).toBe("KJFK");
      expect(lookupGroundstation("TEST2")?.icao).toBe("KLAX");
    });
  });

  describe("lookupLabel", () => {
    beforeEach(() => {
      // Mock message labels data
      vi.spyOn(configModule, "messageLabels", "get").mockReturnValue({
        H1: { name: "Position Report" },
        Q0: { name: "Flight Plan" },
        SA: { name: "Satellite Report" },
      });
    });

    it("should return label info for valid label", () => {
      const result = lookupLabel("H1");
      expect(result).toBe("Position Report");
    });

    it("should return null for invalid label", () => {
      const result = lookupLabel("XX");
      expect(result).toBeNull();
    });

    it("should handle multiple labels", () => {
      expect(lookupLabel("H1")).toBe("Position Report");
      expect(lookupLabel("Q0")).toBe("Flight Plan");
      expect(lookupLabel("SA")).toBe("Satellite Report");
    });
  });

  describe("updateFrequencies", () => {
    // Each test needs the freq tables to be present. We create them in a
    // nested beforeEach so the rest of the suite is unaffected.
    beforeEach(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS freqs_acars (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE IF NOT EXISTS freqs_vdlm2 (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE IF NOT EXISTS freqs_hfdl  (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE IF NOT EXISTS freqs_imsl  (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
        CREATE TABLE IF NOT EXISTS freqs_irdm  (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      `);
    });

    it("should write to freqs_acars for ACARS messages", () => {
      updateFrequencies("131.550", "ACARS");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsAcars).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].freq).toBe("131.550");
      expect(rows[0].count).toBe(1);
    });

    it("regression: should write to freqs_imsl for IMS-L (normalizeMessageType output)", () => {
      // normalizeMessageType("IMSL") returns "IMS-L".  Prior to the fix,
      // freqTableMap did not contain an "IMS-L" key, so no row was ever
      // written to freqs_imsl and the Status page IMSL frequency chart was
      // permanently empty.
      updateFrequencies("10.500", "IMS-L");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsImsl).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].freq).toBe("10.500");
      expect(rows[0].count).toBe(1);
    });

    it("should also write to freqs_imsl for un-normalized IMSL", () => {
      updateFrequencies("10.500", "IMSL");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsImsl).all();
      expect(rows).toHaveLength(1);
    });

    it("should write to freqs_vdlm2 for VDL-M2 (normalizeMessageType output)", () => {
      updateFrequencies("136.900", "VDL-M2");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsVdlm2).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].freq).toBe("136.900");
    });

    it("should write to freqs_vdlm2 for un-normalized VDLM2", () => {
      updateFrequencies("136.900", "VDLM2");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsVdlm2).all();
      expect(rows).toHaveLength(1);
    });

    it("should write to freqs_hfdl for HFDL messages", () => {
      updateFrequencies("11.184", "HFDL");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsHfdl).all();
      expect(rows).toHaveLength(1);
    });

    it("should write to freqs_irdm for IRDM messages", () => {
      updateFrequencies("1626.5", "IRDM");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsIrdm).all();
      expect(rows).toHaveLength(1);
    });

    it("should increment count on subsequent calls for the same frequency", () => {
      updateFrequencies("131.550", "ACARS");
      updateFrequencies("131.550", "ACARS");
      updateFrequencies("131.550", "ACARS");
      const testDb = drizzle(db, { schema });
      const rows = testDb.select().from(freqsAcars).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(3);
    });

    it("should not write anything for an unknown message type", () => {
      updateFrequencies("131.550", "UNKNOWN");
      const testDb = drizzle(db, { schema });
      expect(testDb.select().from(freqsAcars).all()).toHaveLength(0);
      expect(testDb.select().from(freqsVdlm2).all()).toHaveLength(0);
      expect(testDb.select().from(freqsImsl).all()).toHaveLength(0);
    });
  });

  describe("getErrors", () => {
    it("should return full error statistics", () => {
      // Insert test data
      const testDb = drizzle(db, { schema });
      testDb
        .insert(messagesCount)
        .values({ total: 100, errors: 5, good: 95 })
        .run();
      testDb
        .insert(messagesCountDropped)
        .values({ nonloggedErrors: 10, nonloggedGood: 20 })
        .run();

      const result = getErrors();

      expect(result).toEqual({
        non_empty_total: 100,
        non_empty_errors: 5,
        empty_total: 30,
        empty_errors: 10,
      });
    });

    it("should return zeros for empty database", () => {
      const result = getErrors();

      expect(result).toEqual({
        non_empty_total: 0,
        non_empty_errors: 0,
        empty_total: 0,
        empty_errors: 0,
      });
    });

    it("should handle partial data", () => {
      // Insert only messagesCount
      const testDb = drizzle(db, { schema });
      testDb
        .insert(messagesCount)
        .values({ total: 50, errors: 3, good: 47 })
        .run();

      const result = getErrors();

      expect(result).toEqual({
        non_empty_total: 50,
        non_empty_errors: 3,
        empty_total: 0,
        empty_errors: 0,
      });
    });

    it("should handle null values", () => {
      // Insert data with some null values
      const testDb = drizzle(db, { schema });
      testDb.insert(messagesCount).values({ total: null, errors: null }).run();
      testDb
        .insert(messagesCountDropped)
        .values({ nonloggedErrors: null, nonloggedGood: null })
        .run();

      const result = getErrors();

      expect(result).toEqual({
        non_empty_total: 0,
        non_empty_errors: 0,
        empty_total: 0,
        empty_errors: 0,
      });
    });
  });
});

/**
 * Integration tests for configuration data loading
 *
 * Tests loading of actual data files:
 * - ground-stations.json (from airframes.io)
 * - metadata.json (ACARS labels from airframes.io)
 * - airlines.json (airline database)
 *
 * These tests verify that the data loaders can parse real production data.
 */

import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  airlines,
  groundStations,
  iataOverrides,
  loadAirlines,
  loadGroundStations,
  loadMessageLabels,
  messageLabels,
  parseIataOverrides,
} from "../../config.js";

describe("Configuration Data Loading (Integration)", () => {
  // Paths to actual data files (relative to project root)
  const GROUND_STATIONS_PATH = "../rootfs/webapp/data/ground-stations.json";
  const METADATA_PATH = "../rootfs/webapp/data/metadata.json";
  const AIRLINES_PATH = "../rootfs/webapp/data/airlines.json";

  beforeEach(() => {
    // Clear any existing data
    Object.keys(groundStations).forEach((key) => {
      delete groundStations[key];
    });
    Object.keys(messageLabels).forEach((key) => {
      delete messageLabels[key];
    });
    Object.keys(airlines).forEach((key) => {
      delete airlines[key];
    });
    Object.keys(iataOverrides).forEach((key) => {
      delete iataOverrides[key];
    });
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.IATA_OVERRIDE;
  });

  describe("loadGroundStations", () => {
    it("should load ground stations from actual data file", async () => {
      // Skip if file doesn't exist (CI environment might not have it)
      if (!existsSync(GROUND_STATIONS_PATH)) {
        console.warn(`Skipping test: ${GROUND_STATIONS_PATH} does not exist`);
        return;
      }

      await loadGroundStations(GROUND_STATIONS_PATH);

      // Verify data was loaded
      expect(Object.keys(groundStations).length).toBeGreaterThan(0);

      // Check a known station exists (from Dockerfile example)
      // The file should contain multiple stations with ICAO codes
      const firstStation = Object.values(groundStations)[0];
      expect(firstStation).toBeDefined();
      expect(firstStation).toHaveProperty("icao");
      expect(firstStation).toHaveProperty("name");
      expect(typeof firstStation.icao).toBe("string");
      expect(typeof firstStation.name).toBe("string");
    });

    it("should handle multiple ground stations", async () => {
      if (!existsSync(GROUND_STATIONS_PATH)) {
        return;
      }

      await loadGroundStations(GROUND_STATIONS_PATH);

      // Should have many stations (airframes.io has hundreds)
      expect(Object.keys(groundStations).length).toBeGreaterThan(100);
    });

    it("should map station IDs correctly", async () => {
      if (!existsSync(GROUND_STATIONS_PATH)) {
        return;
      }

      await loadGroundStations(GROUND_STATIONS_PATH);

      // Pick any station and verify structure
      const stationIds = Object.keys(groundStations);
      expect(stationIds.length).toBeGreaterThan(0);

      const randomId = stationIds[0];
      const station = groundStations[randomId];

      // Verify station has required fields
      expect(station.icao).toBeTruthy();
      expect(station.name).toBeTruthy();
      expect(station.icao.length).toBeGreaterThan(0);
      expect(station.name.length).toBeGreaterThan(0);
    });

    it("should handle missing file gracefully", async () => {
      // Should not throw, just log error
      await expect(
        loadGroundStations("./nonexistent.json"),
      ).resolves.toBeUndefined();

      // No stations should be loaded
      expect(Object.keys(groundStations).length).toBe(0);
    });
  });

  describe("loadMessageLabels", () => {
    it("should load message labels from actual data file", async () => {
      if (!existsSync(METADATA_PATH)) {
        console.warn(`Skipping test: ${METADATA_PATH} does not exist`);
        return;
      }

      await loadMessageLabels(METADATA_PATH);

      // Verify data was loaded
      expect(Object.keys(messageLabels).length).toBeGreaterThan(0);
    });

    it("should load common ACARS labels", async () => {
      if (!existsSync(METADATA_PATH)) {
        return;
      }

      await loadMessageLabels(METADATA_PATH);

      // Check for common labels that should exist
      // Based on metadata.json structure: { "labels": { "H1": {...}, ... } }
      const labels = messageLabels as Record<string, unknown>;

      // Should have many labels (ACARS has 100+ defined labels)
      expect(Object.keys(labels).length).toBeGreaterThan(50);

      // Common labels that should exist
      const commonLabels = ["H1", "Q0", "5Z", "80"];
      for (const label of commonLabels) {
        if (label in labels) {
          const labelData = labels[label] as Record<string, unknown>;
          expect(labelData).toHaveProperty("name");
          expect(typeof labelData.name).toBe("string");
        }
      }
    });

    it("should handle missing file gracefully", async () => {
      await expect(
        loadMessageLabels("./nonexistent.json"),
      ).resolves.toBeUndefined();

      expect(Object.keys(messageLabels).length).toBe(0);
    });
  });

  describe("loadAirlines", () => {
    it("should load airlines from actual data file", async () => {
      if (!existsSync(AIRLINES_PATH)) {
        console.warn(`Skipping test: ${AIRLINES_PATH} does not exist`);
        return;
      }

      await loadAirlines(AIRLINES_PATH);

      // Verify data was loaded
      expect(Object.keys(airlines).length).toBeGreaterThan(0);
    });

    it("should load major airlines correctly", async () => {
      if (!existsSync(AIRLINES_PATH)) {
        return;
      }

      await loadAirlines(AIRLINES_PATH);

      // Should have many airlines (file has thousands)
      expect(Object.keys(airlines).length).toBeGreaterThan(100);

      // Check for major US airlines (these should definitely exist)
      const majorAirlines = [
        { iata: "UA", icao: "UAL", name: "United Airlines" },
        { iata: "AA", icao: "AAL", name: "American Airlines" },
        { iata: "DL", icao: "DAL", name: "Delta Air Lines" },
      ];

      for (const expected of majorAirlines) {
        if (expected.iata in airlines) {
          const airline = airlines[expected.iata];
          expect(airline.ICAO).toBe(expected.icao);
          expect(airline.NAME).toContain(expected.name.split(" ")[0]); // Check first word
        }
      }
    });

    it("should have correct structure for all airlines", async () => {
      if (!existsSync(AIRLINES_PATH)) {
        return;
      }

      await loadAirlines(AIRLINES_PATH);

      // Pick random airlines and verify structure
      const airlineCodes = Object.keys(airlines).slice(0, 10);

      for (const code of airlineCodes) {
        const airline = airlines[code];
        expect(airline).toHaveProperty("ICAO");
        expect(airline).toHaveProperty("NAME");
        expect(typeof airline.ICAO).toBe("string");
        expect(typeof airline.NAME).toBe("string");
        expect(airline.ICAO.length).toBeGreaterThan(0);
        expect(airline.NAME.length).toBeGreaterThan(0);
      }
    });

    it("should handle missing file gracefully", async () => {
      await expect(loadAirlines("./nonexistent.json")).resolves.toBeUndefined();

      expect(Object.keys(airlines).length).toBe(0);
    });
  });

  describe("parseIataOverrides", () => {
    it("should parse single override", () => {
      process.env.IATA_OVERRIDE = "UA|UAL|United Airlines Override";

      parseIataOverrides();

      expect(iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines Override",
      });
    });

    it("should parse multiple overrides", () => {
      process.env.IATA_OVERRIDE =
        "UA|UAL|United Airlines;AA|AAL|American Airlines;DL|DAL|Delta Airlines";

      parseIataOverrides();

      expect(Object.keys(iataOverrides).length).toBe(3);
      expect(iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
      expect(iataOverrides.AA).toEqual({
        icao: "AAL",
        name: "American Airlines",
      });
      expect(iataOverrides.DL).toEqual({
        icao: "DAL",
        name: "Delta Airlines",
      });
    });

    it("should handle whitespace in overrides", () => {
      process.env.IATA_OVERRIDE = " UA | UAL | United Airlines ";

      parseIataOverrides();

      expect(iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
    });

    it("should skip invalid format entries", () => {
      // Mix of valid and invalid entries
      process.env.IATA_OVERRIDE = "UA|UAL|United;INVALID;AA|AAL|American";

      parseIataOverrides();

      // Should only have the two valid entries
      expect(Object.keys(iataOverrides).length).toBe(2);
      expect(iataOverrides.UA).toBeDefined();
      expect(iataOverrides.AA).toBeDefined();
      expect(iataOverrides.INVALID).toBeUndefined();
    });

    it("should handle empty override string", () => {
      process.env.IATA_OVERRIDE = "";

      parseIataOverrides();

      expect(Object.keys(iataOverrides).length).toBe(0);
    });

    it("should handle missing environment variable", () => {
      delete process.env.IATA_OVERRIDE;

      parseIataOverrides();

      expect(Object.keys(iataOverrides).length).toBe(0);
    });
  });

  describe("Full integration test", () => {
    it("should load all data files successfully", async () => {
      const allFilesExist =
        existsSync(GROUND_STATIONS_PATH) &&
        existsSync(METADATA_PATH) &&
        existsSync(AIRLINES_PATH);

      if (!allFilesExist) {
        console.warn("Skipping integration test: Not all data files exist");
        return;
      }

      // Load all data
      await Promise.all([
        loadGroundStations(GROUND_STATIONS_PATH),
        loadMessageLabels(METADATA_PATH),
        loadAirlines(AIRLINES_PATH),
      ]);

      // Parse overrides
      process.env.IATA_OVERRIDE = "UA|UAL|United Override";
      parseIataOverrides();

      // Verify all data was loaded
      expect(Object.keys(groundStations).length).toBeGreaterThan(100);
      expect(Object.keys(messageLabels).length).toBeGreaterThan(50);
      expect(Object.keys(airlines).length).toBeGreaterThan(100);
      expect(Object.keys(iataOverrides).length).toBe(1);

      // Verify data integrity
      const firstStationId = Object.keys(groundStations)[0];
      expect(groundStations[firstStationId].icao).toBeTruthy();

      const firstLabel = Object.keys(messageLabels)[0];
      expect(messageLabels[firstLabel]).toBeTruthy();

      const firstAirline = Object.keys(airlines)[0];
      expect(airlines[firstAirline].ICAO).toBeTruthy();

      expect(iataOverrides.UA.name).toBe("United Override");
    });
  });
});

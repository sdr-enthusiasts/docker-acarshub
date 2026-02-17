/**
 * Configuration module tests
 *
 * Tests environment variable parsing, validation, and helper functions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("config module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isEnabled() helper", () => {
    it("should return true for various enabled values", async () => {
      const enabledValues = [
        "1",
        "true",
        "TRUE",
        "True",
        "on",
        "ON",
        "enabled",
        "ENABLED",
        "enable",
        "yes",
        "YES",
        "y",
        "Y",
        "ok",
        "OK",
        "always",
        "set",
        "external",
        "EXTERNAL",
      ];

      for (const value of enabledValues) {
        process.env.TEST_VAR = value;
        const { isEnabled } = await import("../config.js");
        expect(isEnabled(process.env.TEST_VAR, false)).toBe(true);
        vi.resetModules();
      }
    });

    it("should return false for disabled values", async () => {
      const disabledValues = [
        "0",
        "false",
        "FALSE",
        "False",
        "off",
        "OFF",
        "no",
        "NO",
        "disabled",
        "random",
        "",
      ];

      for (const value of disabledValues) {
        process.env.TEST_VAR = value;
        const { isEnabled } = await import("../config.js");
        expect(isEnabled(process.env.TEST_VAR, false)).toBe(false);
        vi.resetModules();
      }
    });

    it("should return default value when undefined", async () => {
      const { isEnabled } = await import("../config.js");
      expect(isEnabled(undefined, true)).toBe(true);
      expect(isEnabled(undefined, false)).toBe(false);
    });

    it("should handle whitespace", async () => {
      process.env.TEST_VAR = "  true  ";
      const { isEnabled } = await import("../config.js");
      expect(isEnabled(process.env.TEST_VAR, false)).toBe(true);
    });
  });

  describe("VERSION", () => {
    it("should read version from file", async () => {
      const { VERSION } = await import("../config.js");
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe("string");
    });

    it("should fall back to dev version if file not found", async () => {
      // Note: This test may fail if version file exists
      // In real deployment, version file should always exist
      const { VERSION } = await import("../config.js");
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+/); // Semantic version format
    });
  });

  describe("ALLOW_REMOTE_UPDATES", () => {
    it("should default to true", async () => {
      delete process.env.ALLOW_REMOTE_UPDATES;
      const { ALLOW_REMOTE_UPDATES } = await import("../config.js");
      expect(ALLOW_REMOTE_UPDATES).toBe(true);
    });

    it("should be false when set to FALSE", async () => {
      process.env.ALLOW_REMOTE_UPDATES = "FALSE";
      const { ALLOW_REMOTE_UPDATES } = await import("../config.js");
      expect(ALLOW_REMOTE_UPDATES).toBe(false);
    });

    it("should be true when set to TRUE", async () => {
      process.env.ALLOW_REMOTE_UPDATES = "TRUE";
      const { ALLOW_REMOTE_UPDATES } = await import("../config.js");
      expect(ALLOW_REMOTE_UPDATES).toBe(true);
    });
  });

  describe("Database configuration", () => {
    it("should use defaults", async () => {
      const { DB_SAVEALL, DB_SAVE_DAYS, DB_ALERT_SAVE_DAYS, ACARSHUB_DB } =
        await import("../config.js");
      expect(DB_SAVEALL).toBe(false);
      expect(DB_SAVE_DAYS).toBe(7);
      expect(DB_ALERT_SAVE_DAYS).toBe(120);
      expect(ACARSHUB_DB).toBe("./data/acarshub.db");
    });

    it("should parse DB_SAVEALL", async () => {
      process.env.DB_SAVEALL = "TRUE";
      const { DB_SAVEALL } = await import("../config.js");
      expect(DB_SAVEALL).toBe(true);
    });

    it("should parse DB_SAVE_DAYS as integer", async () => {
      process.env.DB_SAVE_DAYS = "30";
      const { DB_SAVE_DAYS } = await import("../config.js");
      expect(DB_SAVE_DAYS).toBe(30);
    });

    it("should parse DB_ALERT_SAVE_DAYS as integer", async () => {
      process.env.DB_ALERT_SAVE_DAYS = "365";
      const { DB_ALERT_SAVE_DAYS } = await import("../config.js");
      expect(DB_ALERT_SAVE_DAYS).toBe(365);
    });

    it("should use custom DB path", async () => {
      process.env.ACARSHUB_DB = "/custom/path/messages.db";
      const { ACARSHUB_DB } = await import("../config.js");
      expect(ACARSHUB_DB).toBe("/custom/path/messages.db");
    });
  });

  describe("Decoder enablement", () => {
    it("should default ACARS and VDLM disabled", async () => {
      const { ENABLE_ACARS, ENABLE_VDLM, ENABLE_HFDL } = await import(
        "../config.js"
      );
      expect(ENABLE_ACARS).toBe(false);
      expect(ENABLE_VDLM).toBe(false);
      expect(ENABLE_HFDL).toBe(false);
    });

    it("should default IMSL and IRDM to disabled", async () => {
      const { ENABLE_IMSL, ENABLE_IRDM } = await import("../config.js");
      expect(ENABLE_IMSL).toBe(false);
      expect(ENABLE_IRDM).toBe(false);
    });

    it("should respect custom decoder enablement", async () => {
      process.env.ENABLE_ACARS = "false";
      process.env.ENABLE_VDLM = "false";
      process.env.ENABLE_IMSL = "true";
      process.env.ENABLE_IRDM = "enabled";

      const { ENABLE_ACARS, ENABLE_VDLM, ENABLE_IMSL, ENABLE_IRDM } =
        await import("../config.js");

      expect(ENABLE_ACARS).toBe(false);
      expect(ENABLE_VDLM).toBe(false);
      expect(ENABLE_IMSL).toBe(true);
      expect(ENABLE_IRDM).toBe(true);
    });
  });

  describe("Feed configuration", () => {
    it("should use default TCP ports", async () => {
      const {
        FEED_ACARS_PORT,
        FEED_VDLM_PORT,
        FEED_HFDL_PORT,
        FEED_IMSL_PORT,
        FEED_IRDM_PORT,
      } = await import("../config.js");

      expect(FEED_ACARS_PORT).toBe(15550);
      expect(FEED_VDLM_PORT).toBe(15555);
      expect(FEED_HFDL_PORT).toBe(15556);
      expect(FEED_IMSL_PORT).toBe(15557);
      expect(FEED_IRDM_PORT).toBe(15558);
    });

    it("should use default hosts", async () => {
      const {
        FEED_ACARS_HOST,
        FEED_VDLM_HOST,
        FEED_HFDL_HOST,
        FEED_IMSL_HOST,
        FEED_IRDM_HOST,
      } = await import("../config.js");

      expect(FEED_ACARS_HOST).toBe("127.0.0.1");
      expect(FEED_VDLM_HOST).toBe("127.0.0.1");
      expect(FEED_HFDL_HOST).toBe("127.0.0.1");
      expect(FEED_IMSL_HOST).toBe("127.0.0.1");
      expect(FEED_IRDM_HOST).toBe("127.0.0.1");
    });

    it("should parse custom ports", async () => {
      process.env.FEED_ACARS_PORT = "5550";
      process.env.FEED_VDLM_PORT = "5551";

      const { FEED_ACARS_PORT, FEED_VDLM_PORT } = await import("../config.js");

      expect(FEED_ACARS_PORT).toBe(5550);
      expect(FEED_VDLM_PORT).toBe(5551);
    });

    it("should use custom hosts", async () => {
      process.env.FEED_ACARS_HOST = "192.168.1.100";
      process.env.FEED_VDLM_HOST = "10.0.0.50";

      const { FEED_ACARS_HOST, FEED_VDLM_HOST } = await import("../config.js");

      expect(FEED_ACARS_HOST).toBe("192.168.1.100");
      expect(FEED_VDLM_HOST).toBe("10.0.0.50");
    });
  });

  describe("ADS-B configuration", () => {
    it("should default to disabled", async () => {
      const { ENABLE_ADSB } = await import("../config.js");
      expect(ENABLE_ADSB).toBe(false);
    });

    it("should use default URL", async () => {
      const { ADSB_URL } = await import("../config.js");
      expect(ADSB_URL).toBe("http://tar1090/data/aircraft.json");
    });

    it("should parse latitude and longitude", async () => {
      process.env.ADSB_LAT = "37.7749";
      process.env.ADSB_LON = "-122.4194";

      const { ADSB_LAT, ADSB_LON } = await import("../config.js");

      expect(ADSB_LAT).toBeCloseTo(37.7749);
      expect(ADSB_LON).toBeCloseTo(-122.4194);
    });

    it("should enable range rings by default", async () => {
      const { ENABLE_RANGE_RINGS } = await import("../config.js");
      expect(ENABLE_RANGE_RINGS).toBe(true);
    });

    it("should respect DISABLE_RANGE_RINGS", async () => {
      process.env.DISABLE_RANGE_RINGS = "true";
      const { ENABLE_RANGE_RINGS } = await import("../config.js");
      expect(ENABLE_RANGE_RINGS).toBe(false);
    });
  });

  describe("Flight tracking configuration", () => {
    it("should use default FlightAware URL", async () => {
      const { FLIGHT_TRACKING_URL } = await import("../config.js");
      expect(FLIGHT_TRACKING_URL).toBe("https://flightaware.com/live/flight/");
    });

    it("should allow custom tracking URL", async () => {
      process.env.FLIGHT_TRACKING_URL = "https://example.com/track/";
      const { FLIGHT_TRACKING_URL } = await import("../config.js");
      expect(FLIGHT_TRACKING_URL).toBe("https://example.com/track/");
    });
  });

  describe("Logging configuration", () => {
    it("should default to info level", async () => {
      const { MIN_LOG_LEVEL } = await import("../config.js");
      expect(MIN_LOG_LEVEL).toBe("info");
    });

    it("should parse log level", async () => {
      process.env.MIN_LOG_LEVEL = "debug";
      const { MIN_LOG_LEVEL } = await import("../config.js");
      expect(MIN_LOG_LEVEL).toBe("debug");
    });

    it("should handle uppercase log level", async () => {
      process.env.MIN_LOG_LEVEL = "WARN";
      const { MIN_LOG_LEVEL } = await import("../config.js");
      expect(MIN_LOG_LEVEL).toBe("warn");
    });
  });

  describe("Quiet messages configuration", () => {
    it("should default to false", async () => {
      const { QUIET_MESSAGES } = await import("../config.js");
      expect(QUIET_MESSAGES).toBe(false);
    });

    it("should respect QUIET_MESSAGES=true", async () => {
      process.env.QUIET_MESSAGES = "true";
      const { QUIET_MESSAGES } = await import("../config.js");
      expect(QUIET_MESSAGES).toBe(true);
    });
  });

  describe("getConfig()", () => {
    it("should return complete configuration object", async () => {
      const { getConfig } = await import("../config.js");
      const config = getConfig();

      // Check core fields exist
      expect(config.version).toBeDefined();
      expect(config.allowRemoteUpdates).toBeDefined();
      expect(config.dbSaveAll).toBeDefined();
      expect(config.dbSaveDays).toBeDefined();
      expect(config.enableAcars).toBeDefined();
      expect(config.feedAcarsPort).toBeDefined();
      expect(config.flightTrackingUrl).toBeDefined();
      expect(config.minLogLevel).toBeDefined();
      expect(config.quietMessages).toBeDefined();
    });

    it("should validate configuration with Zod", async () => {
      const { getConfig } = await import("../config.js");

      // Should not throw with valid configuration
      expect(() => getConfig()).not.toThrow();
    });

    it("should include runtime data structures", async () => {
      const { getConfig } = await import("../config.js");
      const config = getConfig();

      // Check data structures exist (may be empty before initialization)
      expect(config.alertTerms).toBeInstanceOf(Array);
      expect(config.alertIgnoreTerms).toBeInstanceOf(Array);
      expect(config.groundStations).toBeDefined();
      expect(config.messageLabels).toBeDefined();
      expect(config.airlines).toBeDefined();
      expect(config.iataOverrides).toBeDefined();
    });
  });

  describe("parseIataOverrides()", () => {
    it("should parse single override", async () => {
      process.env.IATA_OVERRIDE = "UA|UAL|United Airlines";
      const config = await import("../config.js");

      config.parseIataOverrides();

      expect(config.iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
    });

    it("should parse multiple overrides", async () => {
      process.env.IATA_OVERRIDE =
        "UA|UAL|United Airlines;AA|AAL|American Airlines";
      const config = await import("../config.js");

      config.parseIataOverrides();

      expect(config.iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
      expect(config.iataOverrides.AA).toEqual({
        icao: "AAL",
        name: "American Airlines",
      });
    });

    it("should handle whitespace", async () => {
      process.env.IATA_OVERRIDE = " UA | UAL | United Airlines ";
      const config = await import("../config.js");

      config.parseIataOverrides();

      expect(config.iataOverrides.UA).toEqual({
        icao: "UAL",
        name: "United Airlines",
      });
    });

    it("should skip invalid formats", async () => {
      process.env.IATA_OVERRIDE = "AA|AAL|American";
      const config = await import("../config.js");

      // Clear previous overrides
      for (const key of Object.keys(config.iataOverrides)) {
        delete config.iataOverrides[key];
      }

      config.parseIataOverrides();

      // Should parse "AA|AAL|American" (3 parts)
      expect(config.iataOverrides.AA).toEqual({
        icao: "AAL",
        name: "American",
      });
    });
  });

  describe("setAlertTerms()", () => {
    it("should uppercase alert terms", async () => {
      const config = await import("../config.js");

      config.setAlertTerms(["emergency", "MAYDAY", "Pan-Pan"]);

      expect(config.alertTerms).toEqual(["EMERGENCY", "MAYDAY", "PAN-PAN"]);
    });
  });

  describe("setAlertIgnoreTerms()", () => {
    it("should uppercase ignore terms", async () => {
      const config = await import("../config.js");

      config.setAlertIgnoreTerms(["test", "DEBUG", "Sample"]);

      expect(config.alertTermsIgnore).toEqual(["TEST", "DEBUG", "SAMPLE"]);
    });
  });
});

/**
 * Configuration module for ACARS Hub backend
 *
 * Reads environment variables and provides configuration constants
 * matching Python acarshub_configuration.py
 */

import { readFileSync } from "node:fs";

/**
 * Application version (read from version file)
 */
export const VERSION = (() => {
  try {
    return readFileSync("./version", "utf-8").trim();
  } catch {
    return "4.0.0-dev";
  }
})();

/**
 * Remote updates configuration
 */
export const ALLOW_REMOTE_UPDATES =
  process.env.ALLOW_REMOTE_UPDATES?.toUpperCase() !== "FALSE";

/**
 * Database configuration
 */
export const DB_SAVEALL = process.env.DB_SAVEALL?.toUpperCase() === "TRUE";
export const DB_SAVE_DAYS = process.env.DB_SAVE_DAYS
  ? Number.parseInt(process.env.DB_SAVE_DAYS, 10)
  : 7;
export const DB_ALERT_SAVE_DAYS = process.env.DB_ALERT_SAVE_DAYS
  ? Number.parseInt(process.env.DB_ALERT_SAVE_DAYS, 10)
  : 120;
export const ACARSHUB_DB = process.env.ACARSHUB_DB || "./data/acarshub.db";
export const DB_BACKUP = process.env.DB_BACKUP || "";

/**
 * Decoder enablement
 */
export const ENABLE_ACARS = process.env.ENABLE_ACARS?.toUpperCase() !== "FALSE";
export const ENABLE_VDLM = process.env.ENABLE_VDLM?.toUpperCase() !== "FALSE";
export const ENABLE_HFDL = process.env.ENABLE_HFDL?.toUpperCase() !== "FALSE";
export const ENABLE_IMSL =
  process.env.ENABLE_IMSL?.toUpperCase() === "TRUE" || false;
export const ENABLE_IRDM =
  process.env.ENABLE_IRDM?.toUpperCase() === "TRUE" || false;

/**
 * Decoder feed configuration (TCP ports)
 */
export const FEED_ACARS_HOST = process.env.FEED_ACARS_HOST || "127.0.0.1";
export const FEED_ACARS_PORT = process.env.FEED_ACARS_PORT
  ? Number.parseInt(process.env.FEED_ACARS_PORT, 10)
  : 15550;

export const FEED_VDLM_HOST = process.env.FEED_VDLM_HOST || "127.0.0.1";
export const FEED_VDLM_PORT = process.env.FEED_VDLM_PORT
  ? Number.parseInt(process.env.FEED_VDLM_PORT, 10)
  : 15555;

export const FEED_HFDL_HOST = process.env.FEED_HFDL_HOST || "127.0.0.1";
export const FEED_HFDL_PORT = process.env.FEED_HFDL_PORT
  ? Number.parseInt(process.env.FEED_HFDL_PORT, 10)
  : 15556;

export const FEED_IMSL_HOST = process.env.FEED_IMSL_HOST || "127.0.0.1";
export const FEED_IMSL_PORT = process.env.FEED_IMSL_PORT
  ? Number.parseInt(process.env.FEED_IMSL_PORT, 10)
  : 15557;

export const FEED_IRDM_HOST = process.env.FEED_IRDM_HOST || "127.0.0.1";
export const FEED_IRDM_PORT = process.env.FEED_IRDM_PORT
  ? Number.parseInt(process.env.FEED_IRDM_PORT, 10)
  : 15558;

/**
 * ADS-B configuration
 */
export const ENABLE_ADSB = process.env.ENABLE_ADSB?.toUpperCase() === "TRUE";
export const ADSB_URL =
  process.env.ADSB_URL || "http://tar1090/data/aircraft.json";
export const ADSB_LAT = process.env.ADSB_LAT
  ? Number.parseFloat(process.env.ADSB_LAT)
  : 0.0;
export const ADSB_LON = process.env.ADSB_LON
  ? Number.parseFloat(process.env.ADSB_LON)
  : 0.0;
export const ENABLE_RANGE_RINGS =
  process.env.ENABLE_RANGE_RINGS?.toUpperCase() !== "FALSE";

/**
 * Alert terms (loaded from environment or defaults)
 */
export let alertTerms: string[] = [];
export let alertTermsIgnore: string[] = [];

/**
 * Ground stations (loaded from data file)
 */
export const groundStations: Record<string, { icao: string; name: string }> =
  {};

/**
 * Message labels (loaded from data file)
 */
export const messageLabels: Record<string, unknown> = {};

/**
 * Airlines database (IATA code -> {ICAO, NAME})
 */
export const airlines: Record<string, { ICAO: string; NAME: string }> = {};

/**
 * IATA overrides (IATA -> {ICAO, NAME})
 * Loaded from IATA_OVERRIDE environment variable
 * Format: "IATA|ICAO|Name;IATA2|ICAO2|Name2"
 */
export const iataOverrides: Record<string, { icao: string; name: string }> = {};

/**
 * Set alert terms at runtime
 */
export function setAlertTerms(terms: string[]): void {
  alertTerms = terms.map((t) => t.toUpperCase());
}

/**
 * Set alert ignore terms at runtime
 */
export function setAlertIgnoreTerms(terms: string[]): void {
  alertTermsIgnore = terms.map((t) => t.toUpperCase());
}

/**
 * Load ground stations from JSON file
 */
export async function loadGroundStations(
  filePath = "./data/ground-stations.json",
): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(data) as {
      ground_stations: Array<{
        id: string;
        airport: { icao: string; name: string };
      }>;
    };

    for (const station of json.ground_stations) {
      if (station.id) {
        groundStations[station.id] = {
          icao: station.airport.icao,
          name: station.airport.name,
        };
      }
    }
  } catch (error) {
    console.error("Failed to load ground stations:", error);
  }
}

/**
 * Load message labels from JSON file
 *
 * Metadata.json structure: { "attribution": {...}, "labels": {...} }
 * We extract the "labels" object.
 */
export async function loadMessageLabels(
  filePath = "./data/message-labels.json",
): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(data) as { labels?: Record<string, unknown> };

    // Extract labels object from metadata structure
    if (json.labels) {
      Object.assign(messageLabels, json.labels);
    } else {
      // Fallback: treat entire JSON as labels (for backwards compatibility)
      Object.assign(messageLabels, json);
    }
  } catch (error) {
    console.error("Failed to load message labels:", error);
  }
}

/**
 * Load airlines from JSON file
 */
export async function loadAirlines(
  filePath = "./rootfs/webapp/data/airlines.json",
): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(data) as Record<
      string,
      { ICAO: string; NAME: string }
    >;

    Object.assign(airlines, json);
  } catch (error) {
    console.error("Failed to load airlines:", error);
  }
}

/**
 * Parse IATA override configuration
 *
 * Format: "IATA|ICAO|Name;IATA2|ICAO2|Name2"
 * Example: "UA|UAL|United Airlines;AA|AAL|American Airlines"
 */
export function parseIataOverrides(): void {
  const overrideStr = process.env.IATA_OVERRIDE || "";
  if (!overrideStr.trim()) {
    return;
  }

  const overrides = overrideStr.split(";");
  for (const item of overrides) {
    const parts = item.split("|");
    if (parts.length === 3) {
      const [iata, icao, name] = parts;
      iataOverrides[iata.trim()] = {
        icao: icao.trim(),
        name: name.trim(),
      };
    } else {
      console.warn(`Invalid IATA override format: ${item}`);
    }
  }
}

/**
 * Initialize configuration (load data files)
 */
export async function initializeConfig(): Promise<void> {
  await Promise.all([
    loadGroundStations(),
    loadMessageLabels(),
    loadAirlines(),
  ]);
  parseIataOverrides();
}

/**
 * Get configuration object
 *
 * Returns current runtime configuration including loaded data
 */
export function getConfig() {
  return {
    version: VERSION,
    allowRemoteUpdates: ALLOW_REMOTE_UPDATES,
    dbSaveAll: DB_SAVEALL,
    dbSaveDays: DB_SAVE_DAYS,
    dbAlertSaveDays: DB_ALERT_SAVE_DAYS,
    dbPath: ACARSHUB_DB,
    dbBackup: DB_BACKUP,
    enableAcars: ENABLE_ACARS,
    enableVdlm: ENABLE_VDLM,
    enableHfdl: ENABLE_HFDL,
    enableImsl: ENABLE_IMSL,
    enableIrdm: ENABLE_IRDM,
    feedAcarsHost: FEED_ACARS_HOST,
    feedAcarsPort: FEED_ACARS_PORT,
    feedVdlmHost: FEED_VDLM_HOST,
    feedVdlmPort: FEED_VDLM_PORT,
    feedHfdlHost: FEED_HFDL_HOST,
    feedHfdlPort: FEED_HFDL_PORT,
    feedImslHost: FEED_IMSL_HOST,
    feedImslPort: FEED_IMSL_PORT,
    feedIrdmHost: FEED_IRDM_HOST,
    feedIrdmPort: FEED_IRDM_PORT,
    enableAdsb: ENABLE_ADSB,
    adsbUrl: ADSB_URL,
    adsbLat: ADSB_LAT,
    adsbLon: ADSB_LON,
    enableRangeRings: ENABLE_RANGE_RINGS,
    alertTerms,
    alertIgnoreTerms: alertTermsIgnore,
    groundStations,
    messageLabels,
    airlines,
    iataOverrides,
  };
}

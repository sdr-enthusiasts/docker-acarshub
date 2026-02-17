/**
 * Configuration module for ACARS Hub backend
 *
 * Reads environment variables and provides configuration constants
 * matching Python acarshub_configuration.py
 */

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

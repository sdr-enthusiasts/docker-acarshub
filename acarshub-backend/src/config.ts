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
 */
export async function loadMessageLabels(
  filePath = "./data/message-labels.json",
): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(filePath, "utf-8");
    Object.assign(messageLabels, JSON.parse(data));
  } catch (error) {
    console.error("Failed to load message labels:", error);
  }
}

/**
 * Initialize configuration (load data files)
 */
export async function initializeConfig(): Promise<void> {
  await Promise.all([loadGroundStations(), loadMessageLabels()]);
}

/**
 * Configuration module for ACARS Hub backend
 *
 * Reads environment variables and provides configuration constants
 * matching Python acarshub_configuration.py with Zod validation
 */

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("config");

// ============================================================================
// Decoder Connection Types
// ============================================================================

/**
 * Transport protocol for a decoder connection.
 *
 * - `udp`  — bind a UDP datagram socket (incoming datagrams from the decoder)
 * - `tcp`  — open an outbound TCP connection (connect to decoder / acars_router)
 * - `zmq`  — subscribe to a ZMQ PUB endpoint (decoder or acars_router)
 */
export type ListenType = "udp" | "tcp" | "zmq";

/**
 * Parsed representation of a single connection descriptor string.
 *
 * Examples of raw strings that produce a ConnectionDescriptor:
 *   "udp"                    → { listenType:"udp", host:"0.0.0.0", port:<default> }
 *   "udp://0.0.0.0:9550"     → { listenType:"udp", host:"0.0.0.0", port:9550 }
 *   "tcp://acars_router:15550" → { listenType:"tcp", host:"acars_router", port:15550 }
 *   "zmq://dumpvdl2:45555"   → { listenType:"zmq", host:"dumpvdl2", port:45555 }
 */
export interface ConnectionDescriptor {
  listenType: ListenType;
  /** Bind address (UDP) or remote host (TCP/ZMQ) */
  host: string;
  /** Port number (1–65535) */
  port: number;
}

/** All resolved descriptors for one decoder type. */
export interface DecoderConnections {
  descriptors: ConnectionDescriptor[];
}

// Default UDP ports per decoder type (match legacy relay ports)
const DEFAULT_UDP_PORTS: Record<string, number> = {
  ACARS: 5550,
  VDLM: 5555,
  HFDL: 5556,
  IMSL: 5557,
  IRDM: 5558,
};

/**
 * Parse a single descriptor token into a ConnectionDescriptor.
 *
 * Returns `null` and emits a warn log for any unrecognised or invalid token.
 * The `defaultPort` is used only for the bare `udp` token.
 */
function parseDescriptor(
  token: string,
  defaultPort: number,
): ConnectionDescriptor | null {
  const trimmed = token.trim();

  // Bare "udp" — bind default port on all interfaces
  if (trimmed === "udp") {
    return { listenType: "udp", host: "0.0.0.0", port: defaultPort };
  }

  // URI forms: udp://<host>:<port>, tcp://<host>:<port>, zmq://<host>:<port>
  const match = /^(udp|tcp|zmq):\/\/([^:]+):(\d+)$/.exec(trimmed);
  if (!match) {
    logger.warn("Unrecognised connection descriptor, skipping", {
      token: trimmed,
    });
    return null;
  }

  const listenType = match[1] as ListenType;
  const host = match[2];
  const port = Number.parseInt(match[3], 10);

  if (port < 1 || port > 65535) {
    logger.warn("Port out of range (1–65535), skipping descriptor", {
      token: trimmed,
      port,
    });
    return null;
  }

  return { listenType, host, port };
}

/**
 * Parse a comma-separated `<TYPE>_CONNECTIONS` environment variable value into
 * a `DecoderConnections` object.
 *
 * - Whitespace around commas is trimmed.
 * - Unrecognised descriptors are skipped with a warn log.
 * - Port out of range is skipped with a warn log.
 * - An empty result after parsing emits an error log.
 *
 * This is a pure function with no side-effects; it is straightforward to
 * unit-test exhaustively.
 */
export function parseConnections(
  raw: string,
  defaultPort: number,
): DecoderConnections {
  if (!raw || raw.trim().length === 0) {
    logger.error("Connection string is empty; no listeners will be created", {
      raw,
    });
    return { descriptors: [] };
  }

  const tokens = raw.split(",");
  const descriptors: ConnectionDescriptor[] = [];

  for (const token of tokens) {
    const descriptor = parseDescriptor(token, defaultPort);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }

  if (descriptors.length === 0) {
    logger.error("No valid descriptors parsed; no listeners will be created", {
      raw,
    });
  }

  return { descriptors };
}

/**
 * Helper function to check if a value represents "enabled"
 *
 * Matches Python's is_enabled() function which accepts:
 * "1", "true", "on", "enabled", "enable", "yes", "y", "ok", "always", "set", "external"
 *
 * @param value - Environment variable value
 * @param defaultValue - Default value if undefined
 * @returns true if enabled, false otherwise
 */
function isEnabled(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.toLowerCase().trim();
  const enabledValues = [
    "1",
    "true",
    "on",
    "enabled",
    "enable",
    "yes",
    "y",
    "ok",
    "always",
    "set",
    "external",
  ];

  return enabledValues.includes(normalized);
}

/**
 * Zod schema for configuration validation
 */
const ConfigSchema = z.object({
  version: z.string(),
  allowRemoteUpdates: z.boolean(),
  dbSaveAll: z.boolean(),
  dbSaveDays: z.number().int().positive(),
  dbAlertSaveDays: z.number().int().positive(),
  dbPath: z.string(),
  dbBackup: z.string(),
  enableAcars: z.boolean(),
  enableVdlm: z.boolean(),
  enableHfdl: z.boolean(),
  enableImsl: z.boolean(),
  enableIrdm: z.boolean(),
  enableAdsb: z.boolean(),
  adsbUrl: z.string(),
  adsbLat: z.number(),
  adsbLon: z.number(),
  enableRangeRings: z.boolean(),
  heywhatsThatId: z.string(),
  heywhatsThatAlts: z.string(),
  heywhatsThatSave: z.string(),
  flightTrackingUrl: z.string().url(),
  minLogLevel: z.enum(["trace", "debug", "info", "warn", "error"]),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Per-package version strings read directly from each workspace's package.json.
 *
 * Why two layouts?
 *
 * Production (Docker): the backend runs from /backend/ where npm ci was run.
 *   The Dockerfile copies each workspace's package.json into predictable paths:
 *     /backend/package.json              → workspace root
 *     /backend/acarshub-backend/package.json → backend
 *     /backend/acarshub-react/package.json   → frontend
 *
 * Development: `npm run dev` is executed from acarshub-backend/, so cwd is
 *   that directory and the relative layout is:
 *     ./package.json        → backend
 *     ../package.json       → workspace root
 *     ../acarshub-react/package.json → frontend
 *
 * We detect the environment by checking whether the production-only sub-path
 * acarshub-backend/package.json exists in the cwd.
 */
function readPkgVersion(filePath: string): string {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" && pkg.version.length > 0
      ? pkg.version
      : "unknown";
  } catch {
    return "unknown";
  }
}

export interface VersionData {
  /** Version from workspace root package.json (overall container release tag) */
  container: string;
  /** Version from acarshub-backend package.json */
  backend: string;
  /** Version from acarshub-react package.json */
  frontend: string;
}

export const VERSIONS: VersionData = (() => {
  const isProduction = existsSync("./acarshub-backend/package.json");

  if (isProduction) {
    return {
      container: readPkgVersion("./package.json"),
      backend: readPkgVersion("./acarshub-backend/package.json"),
      frontend: readPkgVersion("./acarshub-react/package.json"),
    };
  }

  // Development: cwd is acarshub-backend/
  return {
    container: readPkgVersion("../package.json"),
    backend: readPkgVersion("./package.json"),
    frontend: readPkgVersion("../acarshub-react/package.json"),
  };
})();

/**
 * Container version string — backwards-compat alias for VERSIONS.container.
 * Use VERSIONS directly when you need all three component versions.
 */
export const VERSION = VERSIONS.container;

/**
 * Remote updates configuration
 * Defaults to true (enabled) unless explicitly set to false
 */
export const ALLOW_REMOTE_UPDATES = isEnabled(
  process.env.ALLOW_REMOTE_UPDATES,
  true,
);

/**
 * Database configuration
 */
export const DB_SAVEALL = isEnabled(process.env.DB_SAVEALL, false);
export const DB_SAVE_DAYS = process.env.DB_SAVE_DAYS
  ? Number.parseInt(process.env.DB_SAVE_DAYS, 10)
  : 7;
export const DB_ALERT_SAVE_DAYS = process.env.DB_ALERT_SAVE_DAYS
  ? Number.parseInt(process.env.DB_ALERT_SAVE_DAYS, 10)
  : 120;
export const ACARSHUB_DB = process.env.ACARSHUB_DB || "./data/acarshub.db";
export const DB_BACKUP = process.env.DB_BACKUP || "";

/**
 * Decoder enablement (using isEnabled() for flexible boolean parsing)
 */
export const ENABLE_ACARS = isEnabled(process.env.ENABLE_ACARS, false);
export const ENABLE_VDLM = isEnabled(process.env.ENABLE_VDLM, false);
export const ENABLE_HFDL = isEnabled(process.env.ENABLE_HFDL, false);
export const ENABLE_IMSL = isEnabled(process.env.ENABLE_IMSL, false);
export const ENABLE_IRDM = isEnabled(process.env.ENABLE_IRDM, false);

// ============================================================================
// Decoder Connection Configuration
// ============================================================================

/**
 * Resolved connection descriptors for each decoder type.
 *
 * Parsed from the `<TYPE>_CONNECTIONS` environment variables.
 * Defaults to a single bare UDP descriptor on the legacy default port when the
 * environment variable is unset (matches the old `socat` relay behaviour).
 *
 * `ENABLE_<TYPE>` is still the gate; these are consulted only when enabled.
 */
export const ACARS_CONNECTIONS: DecoderConnections = parseConnections(
  process.env.ACARS_CONNECTIONS ?? "udp",
  DEFAULT_UDP_PORTS.ACARS,
);

export const VDLM_CONNECTIONS: DecoderConnections = parseConnections(
  process.env.VDLM_CONNECTIONS ?? "udp",
  DEFAULT_UDP_PORTS.VDLM,
);

export const HFDL_CONNECTIONS: DecoderConnections = parseConnections(
  process.env.HFDL_CONNECTIONS ?? "udp",
  DEFAULT_UDP_PORTS.HFDL,
);

export const IMSL_CONNECTIONS: DecoderConnections = parseConnections(
  process.env.IMSL_CONNECTIONS ?? "udp",
  DEFAULT_UDP_PORTS.IMSL,
);

export const IRDM_CONNECTIONS: DecoderConnections = parseConnections(
  process.env.IRDM_CONNECTIONS ?? "udp",
  DEFAULT_UDP_PORTS.IRDM,
);

/**
 * ADS-B configuration
 */
export const ENABLE_ADSB = isEnabled(process.env.ENABLE_ADSB, false);
export const ADSB_URL =
  process.env.ADSB_URL || "http://tar1090/data/aircraft.json";
export const ADSB_LAT = process.env.ADSB_LAT
  ? Number.parseFloat(process.env.ADSB_LAT)
  : 0.0;
export const ADSB_LON = process.env.ADSB_LON
  ? Number.parseFloat(process.env.ADSB_LON)
  : 0.0;
export const ENABLE_RANGE_RINGS = !isEnabled(
  process.env.DISABLE_RANGE_RINGS,
  false,
); // Inverted logic: DISABLE_RANGE_RINGS=true means rings OFF

/**
 * Hey What's That antenna coverage configuration
 *
 * HEYWHATSTHAT: Site ID token from heywhatsthat.com (e.g. "NN6R7EXG").
 *   When set, the live map will display the estimated antenna coverage outline.
 * HEYWHATSTHAT_ALTS: Comma-separated list of altitudes in feet to request.
 *   Defaults to "10000,30000" if not specified.
 * HEYWHATSTHAT_SAVE: Override the save path (useful for dev/testing).
 *   Defaults to "/run/acars/heywhatsthat.geojson" (same dir as RRD).
 */
export const HEYWHATSTHAT_ID = process.env.HEYWHATSTHAT ?? "";
export const HEYWHATSTHAT_ALTS = process.env.HEYWHATSTHAT_ALTS ?? "10000,30000";
export const HEYWHATSTHAT_SAVE =
  process.env.HEYWHATSTHAT_SAVE ?? "/run/acars/heywhatsthat.geojson";

/**
 * Flight tracking configuration
 */
export const FLIGHT_TRACKING_URL =
  process.env.FLIGHT_TRACKING_URL || "https://flightaware.com/live/flight/";

/**
 * Logging configuration
 */
const validLogLevels = ["trace", "debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof validLogLevels)[number];

const rawLogLevel = process.env.MIN_LOG_LEVEL ?? "info";

function parseLogLevel(input: string): LogLevel {
  // Try numeric first
  const numeric = Number(input);

  if (!Number.isNaN(numeric)) {
    if (numeric >= 6) return "trace";
    if (numeric === 5) return "debug";
    if (numeric === 4) return "info";
    if (numeric === 3) return "warn";
    return "error"; // <= 2
  }

  // Fallback to string validation
  if (validLogLevels.includes(input.toLocaleLowerCase() as LogLevel)) {
    return input.toLowerCase() as LogLevel;
  }

  return "info";
}

export const MIN_LOG_LEVEL: LogLevel = parseLogLevel(rawLogLevel);

/**
 * RRD migration configuration
 */
export const RRD_PATH = process.env.RRD_PATH || "/run/acars/acarshub.rrd";

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
    logger.error("Failed to load ground stations", { error });
  }
}

/**
 * Load message labels from JSON file
 *
 * Metadata.json structure: { "attribution": {...}, "labels": {...} }
 * We extract the "labels" object.
 */
export async function loadMessageLabels(
  filePath = "./data/metadata.json",
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
    logger.error("Failed to load message labels", { error });
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
    logger.error("Failed to load airlines", { error });
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
      logger.warn("Invalid IATA override format", { item });
    }
  }
}

/**
 * Initialize configuration (load data files)
 */
export async function initializeConfig(): Promise<void> {
  // Determine base path: when running from acarshub-backend/, go up one level
  // When running from project root, use current directory
  const fs = await import("node:fs");
  const path = await import("node:path");

  let basePath = "./rootfs/webapp/data";
  if (!fs.existsSync(basePath)) {
    basePath = "../rootfs/webapp/data"; // Running from acarshub-backend/
  }

  const ground_station_path =
    process.env.GROUND_STATION_PATH ||
    path.join(basePath, "ground-stations.json");
  const message_labels_path =
    process.env.MESSAGE_LABELS_PATH || path.join(basePath, "metadata.json");
  const airlines_path =
    process.env.AIRLINES_PATH || path.join(basePath, "airlines.json");

  await Promise.all([
    loadGroundStations(ground_station_path),
    loadMessageLabels(message_labels_path),
    loadAirlines(airlines_path),
  ]);
  parseIataOverrides();
}

/**
 * Get configuration object with validation
 *
 * Returns current runtime configuration including loaded data
 * Validates core configuration against Zod schema
 *
 * @throws {z.ZodError} if configuration is invalid
 */
export function getConfig(): Config & {
  alertTerms: string[];
  alertIgnoreTerms: string[];
  groundStations: Record<string, { icao: string; name: string }>;
  messageLabels: Record<string, unknown>;
  airlines: Record<string, { ICAO: string; NAME: string }>;
  iataOverrides: Record<string, { icao: string; name: string }>;
} {
  const config = {
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
    enableAdsb: ENABLE_ADSB,
    adsbUrl: ADSB_URL,
    adsbLat: ADSB_LAT,
    adsbLon: ADSB_LON,
    enableRangeRings: ENABLE_RANGE_RINGS,
    heywhatsThatId: HEYWHATSTHAT_ID,
    heywhatsThatAlts: HEYWHATSTHAT_ALTS,
    heywhatsThatSave: HEYWHATSTHAT_SAVE,
    flightTrackingUrl: FLIGHT_TRACKING_URL,
    minLogLevel: MIN_LOG_LEVEL,
    rrdPath: RRD_PATH,
    alertTerms,
    alertIgnoreTerms: alertTermsIgnore,
    groundStations,
    messageLabels,
    airlines,
    iataOverrides,
  };

  // Validate core configuration (throws on error)
  ConfigSchema.parse(config);

  return config;
}

/**
 * Export isEnabled helper for external use
 */
export { isEnabled };

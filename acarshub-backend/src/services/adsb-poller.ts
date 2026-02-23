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

import { EventEmitter } from "node:events";
import type { ADSBSourceType } from "@acarshub/types";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("adsb-poller");

/**
 * Minimal aircraft data structure (optimized from ~52 fields to 18 essential fields)
 */
export interface Aircraft {
  hex: string;
  flight?: string;
  alt_baro?: number;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  lat?: number;
  lon?: number;
  seen?: number;
  seen_pos?: number;
  rssi?: number;
  messages?: number;
  category?: string;
  type?: ADSBSourceType; // Best source / tracking method (adsb_icao, mlat, adsr_icao, etc.)
  t?: string; // ICAO aircraft type designator (e.g. "B738", "A320")
  r?: string; // Registration / tail number
  dbFlags?: number; // Bitfield: military=1, interesting=2, PIA=4, LADD=8
}

export interface AdsbData {
  now: number;
  aircraft: Aircraft[];
}

export interface AdsbPollerConfig {
  url: string;
  pollInterval?: number;
  timeout?: number;
}

export interface AdsbPollerEvents {
  data: [data: AdsbData];
  error: [error: Error];
}

/**
 * ADS-B data poller for tar1090/readsb aircraft.json
 *
 * Features:
 * - HTTP polling at configurable intervals (default: 5 seconds)
 * - Data optimization (strips unused fields, reduces payload ~70%)
 * - Caching for new client connections
 * - Event emission for real-time broadcasting
 * - Automatic error handling and retry
 */
export class AdsbPoller extends EventEmitter<AdsbPollerEvents> {
  private config: Required<AdsbPollerConfig>;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private cachedData: AdsbData | null = null;

  constructor(config: AdsbPollerConfig) {
    super();
    this.config = {
      url: config.url,
      pollInterval: config.pollInterval ?? 5000,
      timeout: config.timeout ?? 5000,
    };
  }

  /**
   * Start polling ADS-B data
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("ADS-B poller already running");
      return;
    }

    this.isRunning = true;

    logger.info("Starting ADS-B poller", {
      url: this.config.url,
      pollInterval: this.config.pollInterval,
    });

    // Start polling immediately, then at intervals
    this.poll();
  }

  /**
   * Stop polling ADS-B data
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping ADS-B poller");

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get cached ADS-B data (for new client connections)
   */
  public getCachedData(): AdsbData | null {
    return this.cachedData;
  }

  /**
   * Get current polling status
   */
  public get running(): boolean {
    return this.isRunning;
  }

  /**
   * Poll ADS-B data source
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout,
      );

      const response = await fetch(this.config.url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rawData = (await response.json()) as {
        now: number;
        aircraft: Record<string, unknown>[];
      };

      // Optimize the data (strip unused fields)
      const optimizedData = this.optimizeData(rawData);

      // Cache for new connections
      this.cachedData = optimizedData;

      // Emit for broadcasting
      this.emit("data", optimizedData);

      logger.debug("ADS-B data fetched", {
        aircraftCount: optimizedData.aircraft.length,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Check if it's an abort error (timeout)
      if (error.name === "AbortError") {
        logger.warn("ADS-B fetch timeout", {
          url: this.config.url,
          timeout: this.config.timeout,
        });
      } else {
        logger.error("ADS-B fetch failed", {
          url: this.config.url,
          error: error.message,
        });
      }

      this.emit("error", error);
    } finally {
      // Schedule next poll
      if (this.isRunning) {
        this.pollTimer = setTimeout(() => {
          this.poll();
        }, this.config.pollInterval);
      }
    }
  }

  /**
   * Optimize ADS-B data by pruning unused fields
   * Reduces payload from ~52 fields to 18 essential fields (~65% reduction)
   */
  private optimizeData(rawData: {
    now: number;
    aircraft: Record<string, unknown>[];
  }): AdsbData {
    const optimized: AdsbData = {
      now: rawData.now,
      aircraft: [],
    };

    for (const aircraft of rawData.aircraft) {
      const optimizedAircraft: Aircraft = {
        hex: this.getString(aircraft.hex),
      };

      // Optional fields
      if (aircraft.flight !== undefined) {
        optimizedAircraft.flight = this.getString(aircraft.flight);
      }
      if (aircraft.alt_baro !== undefined) {
        optimizedAircraft.alt_baro = this.getNumber(aircraft.alt_baro);
      }
      if (aircraft.alt_geom !== undefined) {
        optimizedAircraft.alt_geom = this.getNumber(aircraft.alt_geom);
      }
      if (aircraft.gs !== undefined) {
        optimizedAircraft.gs = this.getNumber(aircraft.gs);
      }
      if (aircraft.track !== undefined) {
        optimizedAircraft.track = this.getNumber(aircraft.track);
      }
      if (aircraft.baro_rate !== undefined) {
        optimizedAircraft.baro_rate = this.getNumber(aircraft.baro_rate);
      }
      if (aircraft.lat !== undefined) {
        optimizedAircraft.lat = this.getNumber(aircraft.lat);
      }
      if (aircraft.lon !== undefined) {
        optimizedAircraft.lon = this.getNumber(aircraft.lon);
      }
      if (aircraft.seen !== undefined) {
        optimizedAircraft.seen = this.getNumber(aircraft.seen);
      }
      if (aircraft.seen_pos !== undefined) {
        optimizedAircraft.seen_pos = this.getNumber(aircraft.seen_pos);
      }
      if (aircraft.rssi !== undefined) {
        optimizedAircraft.rssi = this.getNumber(aircraft.rssi);
      }
      if (aircraft.messages !== undefined) {
        optimizedAircraft.messages = this.getNumber(aircraft.messages);
      }
      if (aircraft.category !== undefined) {
        optimizedAircraft.category = this.getString(aircraft.category);
      }
      if (aircraft.type !== undefined) {
        optimizedAircraft.type = this.getString(
          aircraft.type,
        ) as ADSBSourceType;
      }
      if (aircraft.t !== undefined) {
        optimizedAircraft.t = this.getString(aircraft.t);
      }
      if (aircraft.r !== undefined) {
        optimizedAircraft.r = this.getString(aircraft.r);
      }
      if (aircraft.dbFlags !== undefined) {
        optimizedAircraft.dbFlags = this.getNumber(aircraft.dbFlags);
      }

      optimized.aircraft.push(optimizedAircraft);
    }

    return optimized;
  }

  /**
   * Safely extract string value
   */
  private getString(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    return String(value ?? "");
  }

  /**
   * Safely extract number value
   */
  private getNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }
}

/**
 * Singleton ADS-B poller instance
 */
let adsbPollerInstance: AdsbPoller | null = null;

/**
 * Get or create the singleton ADS-B poller
 */
export function getAdsbPoller(config: AdsbPollerConfig): AdsbPoller {
  if (!adsbPollerInstance) {
    adsbPollerInstance = new AdsbPoller(config);
  }
  return adsbPollerInstance;
}

/**
 * Destroy the singleton ADS-B poller
 */
export function destroyAdsbPoller(): void {
  if (adsbPollerInstance) {
    adsbPollerInstance.stop();
    adsbPollerInstance.removeAllListeners();
    adsbPollerInstance = null;
  }
}

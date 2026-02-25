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

/**
 * Prometheus Metrics Service
 *
 * Uses prom-client to produce a Prometheus-compatible scrape endpoint.
 *
 * Architecture
 * ------------
 * All metrics are registered against a lazily-created Registry instance.
 * Each custom Gauge uses a `collect()` callback so data is fetched fresh
 * on every scrape request — no background polling, no stale values.
 *
 * `collectDefaultMetrics()` is called at init time (skipped in Vitest) so
 * that the standard process_* and nodejs_* families appear automatically,
 * mirroring what Python's prometheus_client emits for free.
 *
 * Test isolation
 * --------------
 * Call `resetMetricsForTesting()` in beforeEach to tear down the registry
 * and the initialized flag so the next `collectMetrics()` rebuilds cleanly.
 *
 * Metrics produced (custom)
 * -------------------------
 *   acarshub_database_messages_total
 *   acarshub_database_size_bytes
 *   acarshub_database_non_empty_messages_total
 *   acarshub_database_non_empty_errors_total
 *   acarshub_database_empty_messages_total
 *   acarshub_database_empty_errors_total
 *   acarshub_rrd_acars_messages_per_minute
 *   acarshub_rrd_vdlm_messages_per_minute
 *   acarshub_rrd_total_messages_per_minute
 *   acarshub_rrd_error_messages_per_minute
 *   acarshub_rrd_hfdl_messages_per_minute
 *   acarshub_rrd_imsl_messages_per_minute
 *   acarshub_rrd_irdm_messages_per_minute
 *   acarshub_signal_level_distribution        (labeled: level, type)
 *   acarshub_frequency_distribution           (labeled: frequency, type)
 *   acarshub_alert_terms_configured
 *   acarshub_alert_term_matches               (labeled: term)
 *   acarshub_alert_saved_messages_total
 *   acarshub_application_info                 (labeled: version, arch, *_enabled)
 *
 * Metrics produced (prom-client default — process_* and nodejs_*)
 * ---------------------------------------------------------------
 *   process_cpu_seconds_total
 *   process_start_time_seconds
 *   process_resident_memory_bytes
 *   process_virtual_memory_bytes
 *   process_heap_bytes
 *   process_open_fds
 *   process_max_fds
 *   nodejs_version_info
 *   nodejs_gc_duration_seconds      (histogram, labeled by gc kind)
 *   nodejs_eventloop_lag_*
 *   nodejs_heap_size_total_bytes
 *   nodejs_heap_size_used_bytes
 *   nodejs_external_memory_bytes
 *   nodejs_heap_space_size_*        (labeled by v8 heap space)
 *   nodejs_active_resources_total
 *   ... (full list: https://github.com/siimon/prom-client#default-metrics)
 */

import { collectDefaultMetrics, Gauge, Registry } from "prom-client";
import {
  ENABLE_ACARS,
  ENABLE_ADSB,
  ENABLE_HFDL,
  ENABLE_IMSL,
  ENABLE_IRDM,
  ENABLE_VDLM,
  VERSION,
} from "../config.js";
import {
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getErrors,
  getRowCount,
  getSavedAlertCount,
} from "../db/index.js";
import { createLogger } from "../utils/logger.js";
import { getLatestTimeseriesData } from "./rrd-migration.js";

const logger = createLogger("metrics");

// ---------------------------------------------------------------------------
// Registry singleton
// ---------------------------------------------------------------------------

let _registry: Registry | null = null;

/**
 * Return true when running inside Vitest so we can skip collectDefaultMetrics.
 * The default metrics include a GC PerformanceObserver that accumulates state
 * across test runs and can cause spurious errors when the registry is torn
 * down and rebuilt between each test.
 */
function isTestEnvironment(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

// ---------------------------------------------------------------------------
// Metric registration helpers (typed boolean label value to match Python)
// ---------------------------------------------------------------------------

const pyBool = (v: boolean): string => (v ? "True" : "False");

// ---------------------------------------------------------------------------
// Registry initialisation
// ---------------------------------------------------------------------------

function buildRegistry(): Registry {
  const registry = new Registry();

  // Collect standard process_* and nodejs_* metrics unless we are in a test
  // environment where repeated re-registration causes noise.
  if (!isTestEnvironment()) {
    collectDefaultMetrics({ register: registry });
  }

  // -------------------------------------------------------------------------
  // Database metrics
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_database_messages_total",
    help: "Total number of messages in database",
    registers: [registry],
    collect() {
      try {
        const { count } = getRowCount();
        this.set(count);
      } catch (err) {
        logger.error("Failed to collect database row-count metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_database_size_bytes",
    help: "Database file size in bytes",
    registers: [registry],
    collect() {
      try {
        const { size } = getRowCount();
        this.set(size ?? 0);
      } catch (err) {
        logger.error("Failed to collect database size metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_database_non_empty_messages_total",
    help: "Total non-empty messages",
    registers: [registry],
    collect() {
      try {
        const errors = getErrors();
        this.set(errors.non_empty_total);
      } catch (err) {
        logger.error("Failed to collect non_empty_messages metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_database_non_empty_errors_total",
    help: "Total non-empty messages with errors",
    registers: [registry],
    collect() {
      try {
        const errors = getErrors();
        this.set(errors.non_empty_errors);
      } catch (err) {
        logger.error("Failed to collect non_empty_errors metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_database_empty_messages_total",
    help: "Total empty messages",
    registers: [registry],
    collect() {
      try {
        const errors = getErrors();
        this.set(errors.empty_total);
      } catch (err) {
        logger.error("Failed to collect empty_messages metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_database_empty_errors_total",
    help: "Total empty messages with errors",
    registers: [registry],
    collect() {
      try {
        const errors = getErrors();
        this.set(errors.empty_errors);
      } catch (err) {
        logger.error("Failed to collect empty_errors metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  // -------------------------------------------------------------------------
  // Timeseries / RRD metrics
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_rrd_acars_messages_per_minute",
    help: "1-minute average ACARS messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.acarsCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect ACARS timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_vdlm_messages_per_minute",
    help: "1-minute average VDLM messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.vdlmCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect VDLM timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_total_messages_per_minute",
    help: "1-minute average total messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.totalCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect total timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_error_messages_per_minute",
    help: "1-minute average error messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.errorCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect error timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_hfdl_messages_per_minute",
    help: "1-minute average HFDL messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.hfdlCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect HFDL timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_imsl_messages_per_minute",
    help: "1-minute average IMSL messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.imslCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect IMSL timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_rrd_irdm_messages_per_minute",
    help: "1-minute average IRDM messages",
    registers: [registry],
    async collect() {
      try {
        const latest = await getLatestTimeseriesData("1min");
        this.set(latest?.irdmCount ?? 0);
      } catch (err) {
        logger.error("Failed to collect IRDM timeseries metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  // -------------------------------------------------------------------------
  // Signal level distribution
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_signal_level_distribution",
    help: "Signal level distribution",
    labelNames: ["level", "type"] as const,
    registers: [registry],
    collect() {
      this.reset();
      try {
        const allLevels = getAllSignalLevels();
        for (const [decoder, levels] of Object.entries(allLevels)) {
          for (const row of levels) {
            if (row.level === null || row.count === null) continue;
            this.labels(String(row.level), decoder).set(row.count);
          }
        }
      } catch (err) {
        logger.error("Failed to collect signal level metrics", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  // -------------------------------------------------------------------------
  // Frequency distribution
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_frequency_distribution",
    help: "Message count by frequency",
    labelNames: ["frequency", "type"] as const,
    registers: [registry],
    collect() {
      this.reset();
      try {
        const allFreqs = getAllFreqCounts();
        for (const row of allFreqs) {
          if (row.freq === null || row.count === null) continue;
          this.labels(row.freq, row.decoder).set(row.count);
        }
      } catch (err) {
        logger.error("Failed to collect frequency distribution metrics", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  // -------------------------------------------------------------------------
  // Alert metrics
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_alert_terms_configured",
    help: "Number of alert terms configured",
    registers: [registry],
    collect() {
      try {
        const counts = getAlertCounts();
        this.set(counts.length);
      } catch (err) {
        logger.error("Failed to collect alert terms configured metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  new Gauge({
    name: "acarshub_alert_term_matches",
    help: "Alert term match counts",
    labelNames: ["term"] as const,
    registers: [registry],
    collect() {
      this.reset();
      try {
        const counts = getAlertCounts();
        for (const entry of counts) {
          if (entry.term === null) continue;
          this.labels(entry.term).set(entry.count ?? 0);
        }
      } catch (err) {
        logger.error("Failed to collect alert term match metrics", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  new Gauge({
    name: "acarshub_alert_saved_messages_total",
    help: "Total number of saved alert messages",
    registers: [registry],
    collect() {
      try {
        this.set(getSavedAlertCount());
      } catch (err) {
        logger.error("Failed to collect saved alert count metric", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.set(0);
      }
    },
  });

  // -------------------------------------------------------------------------
  // Application info
  // -------------------------------------------------------------------------

  new Gauge({
    name: "acarshub_application_info",
    help: "Application information",
    // Label names intentionally mirror the Python implementation so existing
    // Grafana dashboards continue to work without modification.
    labelNames: [
      "acars_enabled",
      "adsb_enabled",
      "arch",
      "hfdl_enabled",
      "imsl_enabled",
      "irdm_enabled",
      "vdlm_enabled",
      "version",
    ] as const,
    registers: [registry],
    collect() {
      this.reset();
      this.labels(
        pyBool(ENABLE_ACARS),
        pyBool(ENABLE_ADSB),
        process.arch,
        pyBool(ENABLE_HFDL),
        pyBool(ENABLE_IMSL),
        pyBool(ENABLE_IRDM),
        pyBool(ENABLE_VDLM),
        VERSION,
      ).set(1);
    },
  });

  return registry;
}

function getRegistry(): Registry {
  if (!_registry) {
    _registry = buildRegistry();
  }
  return _registry;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reset the registry singleton and reinitialize on next call to collectMetrics.
 *
 * This is intended for use in test `beforeEach` / `afterEach` hooks only.
 * Production code should never call this.
 */
export function resetMetricsForTesting(): void {
  _registry = null;
}

/**
 * Collect all metrics and return a Prometheus text-format string.
 *
 * Each registered Gauge's `collect()` callback is invoked synchronously or
 * asynchronously by prom-client before the string is assembled, ensuring
 * all values are fresh at the time of the scrape.
 */
export async function collectMetrics(): Promise<string> {
  return getRegistry().metrics();
}

/**
 * The Content-Type header value to use when serving the metrics endpoint.
 * Resolves to the standard Prometheus text format MIME type.
 */
export { prometheusContentType as METRICS_CONTENT_TYPE } from "prom-client";

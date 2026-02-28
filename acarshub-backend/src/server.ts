// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * ACARS Hub Node.js Backend Server
 */

import cors from "@fastify/cors";
import { gte } from "drizzle-orm";
import Fastify from "fastify";
import { getConfig, initializeConfig } from "./config.js";
import {
  checkpoint,
  closeDatabase,
  getAlertCounts,
  getDatabase,
  getMessageCountStats,
  getRowCount,
  healthCheck,
  initDatabase,
  initializeAlertCache,
  initializeMessageCounters,
  initializeMessageCounts,
  timeseriesStats,
} from "./db/index.js";
import { runMigrationsInWorker } from "./db/migrate.js";
import {
  getHeyWhatsThatUrl,
  initHeyWhatsThat,
  readSavedGeoJSON,
} from "./services/heywhatsthat.js";
import { createBackgroundServices } from "./services/index.js";
import { collectMetrics, METRICS_CONTENT_TYPE } from "./services/metrics.js";
import { migrateRrdToSqlite } from "./services/rrd-migration.js";
import { initializeStationIds } from "./services/station-ids.js";
import { startStatsWriter, stopStatsWriter } from "./services/stats-writer.js";
import {
  initTimeSeriesCache,
  stopTimeSeriesCache,
} from "./services/timeseries-cache.js";
import { handleConnect } from "./socket/handlers.js";
import {
  initializeSocketServer,
  shutdownSocketServer,
} from "./socket/index.js";
import {
  drainPendingSockets,
  isMigrationRunning,
  setMigrationRunning,
} from "./startup-state.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
}

const config: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "8888", 10),
  host: process.env.HOST ?? "0.0.0.0",
  dbPath: process.env.ACARSHUB_DB ?? "./data/acarshub.db",
};

/**
 * Create and configure Fastify server
 */
function createServer() {
  const fastify = Fastify({
    logger: false, // Use Pino logger instead
    trustProxy: true,
  });

  // Register CORS
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Health check endpoint
  fastify.get("/health", async () => {
    const isHealthy = healthCheck();
    const { count, size } = getRowCount();

    return {
      status: isHealthy ? "healthy" : "unhealthy",
      database: {
        connected: isHealthy,
        messages: count,
        size: size,
      },
      version: getConfig().version,
    };
  });

  // Root endpoint
  fastify.get("/", async () => {
    return {
      service: "ACARS Hub Backend",
      version: getConfig().version,
      status: "running",
    };
  });

  // HeyWhatsThat antenna coverage GeoJSON endpoint
  // Serves the pre-fetched and converted GeoJSON file from the configured save path.
  // The ?v= query parameter (set by the backend and passed to the frontend via
  // features_enabled) acts as a cache-bust token — when config changes, the hash
  // changes and the browser fetches a fresh copy.
  fastify.get("/data/heywhatsthat.geojson", async (_request, reply) => {
    const config = getConfig();
    if (!config.heywhatsThatId) {
      return reply.status(404).send({ error: "HeyWhatsThat not configured" });
    }

    const url = getHeyWhatsThatUrl();
    if (!url) {
      return reply.status(503).send({
        error: "Coverage data not yet available — check startup logs",
      });
    }

    const content = readSavedGeoJSON(config.heywhatsThatSave);
    if (!content) {
      return reply
        .status(404)
        .send({ error: "Coverage GeoJSON file not found on disk" });
    }

    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Cache-Control", "public, max-age=86400")
      .send(content);
  });

  // Stats endpoint — replaces the legacy /webapp/data/stats.json static file.
  //
  // Returns per-decoder message counts for the last hour by summing rows in
  // timeseries_stats with timestamp >= (now - 3600).  Falls back to the
  // MessageQueue live counters when no rows exist yet (first minute of
  // operation).  The response schema matches the old static file exactly so
  // that external consumers are not broken.
  fastify.get("/data/stats.json", async (_request, reply) => {
    // During migration the DB is not yet open — return a clean 503 so the
    // frontend knows to retry rather than treating it as an application error.
    if (isMigrationRunning()) {
      return reply
        .status(503)
        .header("Retry-After", "5")
        .send({ error: "Database migration in progress — retry shortly" });
    }

    try {
      const db = getDatabase();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const oneHourAgo = nowSeconds - 3600;

      const rows = db
        .select()
        .from(timeseriesStats)
        .where(gte(timeseriesStats.timestamp, oneHourAgo))
        .all();

      let acars = 0;
      let vdlm2 = 0;
      let hfdl = 0;
      let imsl = 0;
      let irdm = 0;

      if (rows.length > 0) {
        for (const row of rows) {
          acars += row.acarsCount;
          vdlm2 += row.vdlmCount;
          hfdl += row.hfdlCount;
          imsl += row.imslCount;
          irdm += row.irdmCount;
        }
      } else {
        // First minute of operation — no DB rows yet, use live queue counters.
        const { getMessageQueue } = await import("./services/message-queue.js");
        const qStats = getMessageQueue().getStats();
        acars = qStats.acars.total;
        vdlm2 = qStats.vdlm2.total;
        hfdl = qStats.hfdl.total;
        imsl = qStats.imsl.total;
        irdm = qStats.irdm.total;
      }

      const total = acars + vdlm2 + hfdl + imsl + irdm;

      return reply
        .header("Cache-Control", "no-cache")
        .send({ acars, vdlm2, hfdl, imsl, irdm, total });
    } catch (err) {
      logger.error("Failed to generate stats.json", {
        error: err instanceof Error ? err.message : String(err),
      });
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });

  // Prometheus metrics endpoint
  // Content-Type follows the Prometheus text format specification (version 0.0.4).
  fastify.get("/metrics", async (_request, reply) => {
    try {
      const body = await collectMetrics();
      return reply.header("Content-Type", METRICS_CONTENT_TYPE).send(body);
    } catch (err) {
      logger.error("Failed to generate metrics", {
        error: err instanceof Error ? err.message : String(err),
      });
      return reply.status(500).send("Internal Server Error");
    }
  });

  return fastify;
}

/**
 * Main server initialization
 */
async function main(): Promise<void> {
  logger.info("Starting ACARS Hub backend", {
    port: config.port,
    host: config.host,
    database: config.dbPath,
  });

  let fastify: ReturnType<typeof createServer> | null = null;
  let io: Awaited<ReturnType<typeof initializeSocketServer>> | null = null;
  let backgroundServices: Awaited<
    ReturnType<typeof createBackgroundServices>
  > | null = null;

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Start HTTP + Socket.IO IMMEDIATELY.
    //
    // The server must be accepting connections (and reporting migrationRunning
    // = true) before any async work begins.  In Docker with compiled JS the
    // migration worker starts and can complete in under a second for databases
    // that don't need migration — if we wait for initializeConfig() first, the
    // browser's first Socket.IO polling request arrives *after* the migration
    // window has already closed and the banner never shows.
    //
    // Keeping the server start unconditionally first guarantees that even the
    // fastest possible migration path (no-op, <50 ms) has the migration flag
    // set before the first TCP connection can complete the HTTP handshake.
    // -----------------------------------------------------------------------
    fastify = createServer();
    await fastify.listen({ port: config.port, host: config.host });
    logger.info("HTTP server listening", {
      host: config.host,
      port: config.port,
    });

    io = initializeSocketServer(fastify.server, {
      cors: {
        origin: "*",
        credentials: true,
      },
    });
    logger.info("Socket.IO server accepting connections", {
      namespace: "/main",
    });

    // Flag the migration window OPEN immediately — before any async work.
    // Any Socket.IO client that connects from this point on will see
    // isMigrationRunning() = true and receive migration_status { running: true }.
    setMigrationRunning(true);
    logger.info(
      "Migration window open — connections will receive migration banner",
    );

    // -----------------------------------------------------------------------
    // Phase 2: Run enrichment-data loading and DB migration in parallel.
    //
    // initializeConfig() is async (fs.readFile for airlines/ground-stations/
    // labels JSON files) and does not touch SQLite — safe to run alongside the
    // migration worker.
    //
    // runMigrationsInWorker() spawns a child process so the main event loop
    // stays fully responsive during VACUUM / FTS rebuild.  Clients that connect
    // while either task is running receive migration_status { running: true }
    // and are held in the pending queue until Phase 4.
    //
    // Running both in parallel also reduces total startup time on slow storage.
    // -----------------------------------------------------------------------
    await Promise.all([
      initializeConfig(),
      runMigrationsInWorker(config.dbPath),
    ]);

    let appConfig = getConfig();
    logger.info("Enrichment data loaded", {
      airlines: Object.keys(appConfig.airlines).length,
      groundStations: Object.keys(appConfig.groundStations).length,
      messageLabels: Object.keys(appConfig.messageLabels).length,
      iataOverrides: Object.keys(appConfig.iataOverrides).length,
    });
    logger.info("Database migrations complete");

    // initDatabase() is synchronous and fast (no VACUUM).  Open the connection
    // immediately after the worker finishes so the DB is ready for every
    // subsequent init step.  The migration flag stays true — new connections
    // that arrive here still get migration_status { running: true } and are
    // queued; they will be drained after background services are ready.
    initDatabase(config.dbPath);
    logger.info("Database connection established");

    const isHealthy = healthCheck();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }

    // Flush any WAL frames left over from the previous run.
    //
    // WHY THIS MATTERS
    // ----------------
    // The scheduled TRUNCATE checkpoint does not fire until 5 minutes after
    // startup.  On busy installs the leftover WAL from the previous session
    // (container restart, OOM kill, etc.) can be large — combined with fresh
    // writes during those 5 minutes it can push disk usage to alarming levels
    // before the first scheduled flush.  Running TRUNCATE at startup clears
    // the slate immediately.
    try {
      const { framesCheckpointed, framesRemaining } = checkpoint("TRUNCATE");
      logger.info("Startup WAL checkpoint complete", {
        framesCheckpointed,
        framesRemaining,
      });
      if (framesRemaining > 0) {
        logger.warn(
          "Startup WAL checkpoint left frames unprocessed — WAL may not be fully flushed",
          { framesRemaining },
        );
      }
    } catch (err) {
      // Non-fatal: the scheduled task will pick this up within 5 minutes.
      logger.warn("Startup WAL checkpoint failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Migrate RRD to SQLite (blocking startup task)
    const rrdPath = process.env.RRD_PATH ?? "/run/acars/acarshub.rrd";
    await migrateRrdToSqlite(rrdPath);

    // Fetch Hey What's That antenna coverage data (once at startup, cached to disk)
    await initHeyWhatsThat();
    const hwtUrl = getHeyWhatsThatUrl();
    if (hwtUrl) {
      logger.info("Hey What's That coverage overlay enabled", { url: hwtUrl });
    }

    initializeMessageCounts();
    initializeMessageCounters();
    initializeAlertCache();
    initializeStationIds();

    // Warm the time-series cache immediately after the DB is open.
    //
    // WHY HERE (not after backgroundServices.start())
    // ------------------------------------------------
    // initTimeSeriesCache() runs all 8 DB queries synchronously and arms
    // wall-clock-aligned timers.  Placing it here — before sockets are
    // drained from the migration queue — guarantees that the cache is fully
    // populated before the first client can request a graph.  The broadcaster
    // closes over `io`, which is already accepting connections at this point.
    initTimeSeriesCache((_period, data) => {
      if (io) {
        // Dynamic event emission requires a type assertion; the payload shape
        // is well-defined as TimeSeriesResponse from utils/timeseries.ts.
        const ns = io.of("/main") as unknown as {
          emit: (event: string, data: unknown) => void;
        };
        ns.emit("rrd_timeseries_data", data);
      }
    });

    logger.info("Initialization complete");

    const { count: messageCount, size: dbSize } = getRowCount();
    const countStats = getMessageCountStats();
    const alertStats = getAlertCounts();
    logger.info("Database statistics", {
      messages: messageCount,
      sizeMB:
        dbSize !== null ? Number((dbSize / 1024 / 1024).toFixed(2)) : null,
      good: countStats?.good ?? 0,
      errors: countStats?.errors ?? 0,
      alertTerms: alertStats.length,
    });

    backgroundServices = await createBackgroundServices({
      socketio: {
        emit: (event: string, data: unknown) => {
          if (io) {
            // Use type assertion to handle dynamic event emission
            // Socket.IO's strict typing doesn't allow arbitrary event names at runtime
            const namespace = io.of("/main") as unknown as {
              emit: (event: string, data: unknown) => void;
            };
            namespace.emit(event, data);
          }
        },
      },
    });
    backgroundServices.start();
    startStatsWriter();

    // System is fully initialised.  Clear the migration flag first so that
    // any connection arriving after this point receives handleConnect()
    // directly.  Then drain the pending queue — sockets that connected during
    // the migration window receive migration_status { running: false } followed
    // by the full connect sequence, exactly as if they had just connected.
    setMigrationRunning(false);

    if (io) {
      const pendingSockets = drainPendingSockets();
      for (const socket of pendingSockets) {
        socket.emit("migration_status", {
          running: false,
          message: "",
        });
        handleConnect(socket, io);
      }
    }

    appConfig = getConfig();
    logger.info("ACARS Hub backend ready", {
      version: appConfig.version,
      decoders: {
        acars: appConfig.enableAcars,
        vdlm2: appConfig.enableVdlm,
        hfdl: appConfig.enableHfdl,
        imsl: appConfig.enableImsl,
        irdm: appConfig.enableIrdm,
        adsb: appConfig.enableAdsb,
      },
    });

    // Handle shutdown signals
    const shutdown = async (signal: string) => {
      logger.info("Shutting down", { signal });

      stopTimeSeriesCache();
      stopStatsWriter();

      if (backgroundServices) {
        backgroundServices.stop();
      }

      if (io) {
        await shutdownSocketServer(io);
      }

      if (fastify) {
        await fastify.close();
      }

      closeDatabase();
      logger.info("Shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Startup failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    stopStatsWriter();

    if (backgroundServices) {
      backgroundServices.stop();
    }

    if (io) {
      await shutdownSocketServer(io);
    }

    if (fastify) {
      await fastify.close();
    }

    closeDatabase();
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.fatal("Fatal error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

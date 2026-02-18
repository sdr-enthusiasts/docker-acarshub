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
 *
 * Week 3 Implementation: Background Services Integration
 * - Fastify HTTP server
 * - Socket.IO real-time communication
 * - Drizzle ORM + better-sqlite3
 * - TCP listeners for all decoder types
 * - Message processing pipeline
 * - Scheduled background tasks
 * - ADS-B integration
 *
 * See: dev-docs/NODEJS_MIGRATION_PLAN.md
 */

import cors from "@fastify/cors";
import Fastify from "fastify";
import { getConfig, initializeConfig } from "./config.js";
import {
  closeDatabase,
  getAlertCounts,
  getAllSignalLevels,
  getMessageCountStats,
  getRowCount,
  grabMostRecent,
  healthCheck,
  initDatabase,
  initializeAlertCache,
  initializeMessageCounters,
  initializeMessageCounts,
} from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { createBackgroundServices } from "./services/index.js";
import { collectMetrics, METRICS_CONTENT_TYPE } from "./services/metrics.js";
import { migrateRrdToSqlite } from "./services/rrd-migration.js";
import { startStatsWriter, stopStatsWriter } from "./services/stats-writer.js";
import {
  initializeSocketServer,
  shutdownSocketServer,
} from "./socket/index.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
}

const config: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "8080", 10),
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
  logger.info("========================================");
  logger.info("ACARS Hub Node.js Backend - Week 3");
  logger.info("Background Services Integration");
  logger.info("========================================");
  logger.info("");
  logger.info("Configuration:", {
    port: config.port,
    host: config.host,
    database: config.dbPath,
  });
  logger.info("");

  let fastify: ReturnType<typeof createServer> | null = null;
  let io: Awaited<ReturnType<typeof initializeSocketServer>> | null = null;
  let backgroundServices: Awaited<
    ReturnType<typeof createBackgroundServices>
  > | null = null;

  try {
    // Load enrichment data (airlines, ground stations, labels)
    // CRITICAL: This must run BEFORE processing messages to enable proper enrichment
    logger.info("📚 Loading enrichment data...");
    await initializeConfig();

    // Show what was loaded
    let appConfig = getConfig();
    const airlineCount = Object.keys(appConfig.airlines).length;
    const groundStationCount = Object.keys(appConfig.groundStations).length;
    const labelCount = Object.keys(appConfig.messageLabels).length;
    const iataOverrideCount = Object.keys(appConfig.iataOverrides).length;

    logger.info("✅ Enrichment data loaded:");
    logger.info(`   - Airlines: ${airlineCount}`);
    logger.info(`   - Ground Stations: ${groundStationCount}`);
    logger.info(`   - Message Labels: ${labelCount}`);
    if (iataOverrideCount > 0) {
      logger.info(`   - IATA Overrides: ${iataOverrideCount}`);
    }
    logger.info("");

    // Run database migrations
    // CRITICAL: This must run BEFORE initDatabase() to ensure schema is up-to-date
    // Migration 9 creates timeseries_stats table if it doesn't exist
    // This fixes bug where stats writer fails with "no such table: timeseries_stats"
    // when no RRD file is present (RRD migration is skipped, table never created)
    logger.info("📦 Running database migrations...");
    runMigrations();
    logger.info("✅ Database migrations complete");
    logger.info("");

    // Initialize database connection
    logger.info("📦 Initializing database connection...");
    initDatabase();
    logger.info("✅ Database connection established");
    logger.info("");

    // Run health check
    logger.info("🏥 Running health check...");
    const isHealthy = healthCheck();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }
    logger.info("✅ Database is healthy");
    logger.info("");

    // Migrate RRD to SQLite (blocking startup task)
    const rrdPath = process.env.RRD_PATH ?? "/run/acars/acarshub.rrd";
    logger.info("📊 Checking for RRD migration...");
    await migrateRrdToSqlite(rrdPath);
    logger.info("✅ RRD migration check complete");
    logger.info("");

    // Initialize message counts if needed
    initializeMessageCounts();

    // Initialize in-memory message counters from database
    logger.info("🔢 Initializing message counters...");
    initializeMessageCounters();
    logger.info("✅ Message counters initialized");
    logger.info("");

    // Initialize alert term cache (load from database)
    logger.info("🚨 Initializing alert term cache...");
    initializeAlertCache();
    logger.info("✅ Alert term cache initialized");
    logger.info("");

    // Display current database statistics
    logger.info("📊 Current Database Statistics:");
    logger.info("────────────────────────────────────────");

    const { count: messageCount, size: dbSize } = getRowCount();
    logger.info(`  Total Messages: ${messageCount}`);
    if (dbSize !== null) {
      const sizeMB = (dbSize / 1024 / 1024).toFixed(2);
      logger.info(`  Database Size: ${sizeMB} MB`);
    }

    const countStats = getMessageCountStats();
    if (countStats) {
      logger.info(`  Good Messages: ${countStats.good ?? 0}`);
      logger.info(`  Error Messages: ${countStats.errors ?? 0}`);
    }

    // Show recent messages (just count, not full data)
    const recentMessages = grabMostRecent(10);
    logger.info(`  Recent Messages (last 10): ${recentMessages.length}`);

    // Show alert statistics
    const alertStats = getAlertCounts();
    logger.info(`  Alert Terms: ${alertStats.length}`);
    if (alertStats.length > 0) {
      logger.info("  Alert Term Counts:");
      for (const stat of alertStats.slice(0, 5)) {
        logger.info(`    - ${stat.term}: ${stat.count ?? 0}`);
      }
      if (alertStats.length > 5) {
        logger.info(`    ... and ${alertStats.length - 5} more`);
      }
    }

    // Show signal level statistics
    const signalLevels = getAllSignalLevels();
    const acarsLevels = signalLevels.ACARS.length;
    const vdlm2Levels = signalLevels["VDL-M2"].length;
    const hfdlLevels = signalLevels.HFDL.length;
    logger.info("  Signal Levels:");
    logger.info(`    - ACARS: ${acarsLevels} unique levels`);
    logger.info(`    - VDLM2: ${vdlm2Levels} unique levels`);
    logger.info(`    - HFDL: ${hfdlLevels} unique levels`);

    logger.info("");

    // Create Fastify server
    logger.info("🚀 Starting Fastify HTTP server...");
    fastify = createServer();

    // Start server
    await fastify.listen({ port: config.port, host: config.host });
    logger.info(
      `✅ Fastify server listening on http://${config.host}:${config.port}`,
    );
    logger.info("");

    // Initialize Socket.IO server
    logger.info("🔌 Initializing Socket.IO server...");
    io = initializeSocketServer(fastify.server, {
      cors: {
        origin: "*",
        credentials: true,
      },
    });
    logger.info("✅ Socket.IO server initialized on /main namespace");
    logger.info("");

    // Initialize background services
    logger.info("⚙️  Initializing background services...");
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
    logger.info("✅ Background services initialized");
    logger.info("");

    // Start background services
    logger.info("🚀 Starting background services...");
    backgroundServices.start();
    logger.info("✅ Background services started");
    logger.info("");

    // Start stats writer (minute-aligned timeseries insertion)
    logger.info("📈 Starting stats writer...");
    startStatsWriter();
    logger.info("✅ Stats writer started (writes every 60s)");
    logger.info("");

    logger.info("========================================");
    logger.info("✅ Week 3 Complete: Background Services");
    logger.info("========================================");
    logger.info("");
    logger.info("Implemented:");
    logger.info("  ✅ Fastify HTTP server with health checks");
    logger.info("  ✅ Socket.IO server on /main namespace");
    logger.info("  ✅ All 13 event handlers (connect, query_search, etc.)");
    logger.info(
      "  ✅ TCP listeners for all decoder types (ACARS, VDLM2, HFDL, IMSL, IRDM)",
    );
    logger.info("  ✅ Message queue with statistics tracking");
    logger.info(
      "  ✅ Scheduled background tasks (pruning, optimization, health checks)",
    );
    logger.info("  ✅ ADS-B integration with HTTP polling");
    logger.info("  ✅ Real-time connection status tracking");
    logger.info("  ✅ Auto-reconnect logic for decoder feeds");
    logger.info("");
    logger.info("Background Tasks:");
    logger.info("  ✅ Every 30s: Emit system status");
    logger.info("  ✅ Every 1min: Prune old messages");
    logger.info("  ✅ Every 5min: Optimize DB (merge FTS5 segments)");
    logger.info("  ✅ Every 6hr: Full database optimization");
    logger.info("  ✅ Every 1min: Check thread health");
    logger.info("  ✅ Continuous: ADS-B polling (5s intervals)");
    logger.info("");
    logger.info("Decoder Status:");
    appConfig = getConfig();
    logger.info(`  - ACARS: ${appConfig.enableAcars ? "enabled" : "disabled"}`);
    logger.info(`  - VDLM2: ${appConfig.enableVdlm ? "enabled" : "disabled"}`);
    logger.info(`  - HFDL: ${appConfig.enableHfdl ? "enabled" : "disabled"}`);
    logger.info(`  - IMSL: ${appConfig.enableImsl ? "enabled" : "disabled"}`);
    logger.info(`  - IRDM: ${appConfig.enableIrdm ? "enabled" : "disabled"}`);
    logger.info(`  - ADS-B: ${appConfig.enableAdsb ? "enabled" : "disabled"}`);
    logger.info("");
    logger.info("Next Steps (Week 4):");
    logger.info("  - Port message formatters (ACARS, VDLM2, HFDL, IMSL, IRDM)");
    logger.info("  - Implement message enrichment pipeline");
    logger.info("  - Add alert matching logic");
    logger.info("  - Implement RRD time-series metrics");
    logger.info("");
    logger.info("To test:");
    logger.info("  1. Frontend: Update SOCKET_URL to http://localhost:8080");
    logger.info("  2. Connect to /main namespace");
    logger.info("  3. Messages should flow from decoders → queue → Socket.IO");
    logger.info("  4. System status updates every 30 seconds");
    logger.info("");

    // Handle shutdown signals
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      stopStatsWriter();
      logger.info("Stats writer stopped");

      if (backgroundServices) {
        backgroundServices.stop();
        logger.info("Background services stopped");
      }

      if (io) {
        await shutdownSocketServer(io);
      }

      if (fastify) {
        await fastify.close();
        logger.info("Fastify server closed");
      }

      closeDatabase();
      logger.info("Database closed");

      logger.info("Shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("❌ Error during startup:", {
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
  logger.fatal("❌ Fatal error:", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

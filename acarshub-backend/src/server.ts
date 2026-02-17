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
 * Week 2 Implementation: Socket.IO Server + Database Layer
 * - Fastify HTTP server
 * - Socket.IO real-time communication
 * - Drizzle ORM + better-sqlite3
 * - Type-safe database operations
 *
 * See: dev-docs/NODEJS_MIGRATION_PLAN.md
 */

import cors from "@fastify/cors";
import Fastify from "fastify";
import { getConfig } from "./config.js";
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
  initializeMessageCounts,
} from "./db/index.js";
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

  return fastify;
}

/**
 * Main server initialization
 */
async function main(): Promise<void> {
  logger.info("========================================");
  logger.info("ACARS Hub Node.js Backend - Week 2");
  logger.info("Socket.IO Server + Database Layer");
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

  try {
    // Initialize database
    logger.info("📦 Initializing database...");
    initDatabase();
    logger.info("✅ Database initialized successfully");
    logger.info("");

    // Run health check
    logger.info("🏥 Running health check...");
    const isHealthy = healthCheck();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }
    logger.info("✅ Database is healthy");
    logger.info("");

    // Initialize message counts if needed
    initializeMessageCounts();

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
    const acarsLevels = signalLevels.acars.length;
    const vdlm2Levels = signalLevels.vdlm2.length;
    const hfdlLevels = signalLevels.hfdl.length;
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

    logger.info("========================================");
    logger.info("✅ Week 2 Complete: Socket.IO Server");
    logger.info("========================================");
    logger.info("");
    logger.info("Implemented:");
    logger.info("  ✅ Fastify HTTP server with health checks");
    logger.info("  ✅ Socket.IO server on /main namespace");
    logger.info("  ✅ All 13 event handlers (connect, query_search, etc.)");
    logger.info("  ✅ Real-time message broadcasting infrastructure");
    logger.info("  ✅ Type-safe Socket.IO with @acarshub/types");
    logger.info("  ✅ CORS support for frontend communication");
    logger.info("");
    logger.info("Event Handlers:");
    logger.info("  ✅ connect - Initial data load");
    logger.info("  ✅ query_search - Database search");
    logger.info("  ✅ update_alerts - Alert term management");
    logger.info("  ✅ regenerate_alert_matches - Full alert rebuild");
    logger.info("  ✅ request_status - System status");
    logger.info("  ✅ signal_freqs - Frequency counts");
    logger.info("  ✅ signal_count - Message counts");
    logger.info("  ✅ request_recent_alerts - Recent alerts");
    logger.info("  ✅ signal_graphs - Alert statistics");
    logger.info("  ✅ rrd_timeseries - Time-series data (placeholder)");
    logger.info("  ✅ query_alerts_by_term - Term-specific search");
    logger.info("  ✅ reset_alert_counts - Reset statistics");
    logger.info("  ✅ disconnect - Cleanup");
    logger.info("");
    logger.info("Next Steps (Week 3):");
    logger.info("  - TCP listeners (ACARS, VDLM2, HFDL, IMSL, IRDM)");
    logger.info("  - Message processing pipeline");
    logger.info("  - Background scheduled tasks");
    logger.info("  - ADS-B integration");
    logger.info("");
    logger.info("To test Socket.IO:");
    logger.info("  1. Frontend: Update SOCKET_URL to http://localhost:8080");
    logger.info("  2. Connect to /main namespace");
    logger.info("  3. All events should work with zero frontend changes");
    logger.info("");

    // Handle shutdown signals
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

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

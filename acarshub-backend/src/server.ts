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
import Fastify from "fastify";
import { getConfig, initializeConfig } from "./config.js";
import {
  closeDatabase,
  getAlertCounts,
  getMessageCountStats,
  getRowCount,
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
    // Load enrichment data (airlines, ground stations, labels)
    // CRITICAL: This must run BEFORE processing messages to enable proper enrichment
    await initializeConfig();

    let appConfig = getConfig();
    logger.info("Enrichment data loaded", {
      airlines: Object.keys(appConfig.airlines).length,
      groundStations: Object.keys(appConfig.groundStations).length,
      messageLabels: Object.keys(appConfig.messageLabels).length,
      iataOverrides: Object.keys(appConfig.iataOverrides).length,
    });

    // Run database migrations
    // CRITICAL: This must run BEFORE initDatabase() to ensure schema is up-to-date
    // Migration 9 creates timeseries_stats table if it doesn't exist
    // This fixes bug where stats writer fails with "no such table: timeseries_stats"
    // when no RRD file is present (RRD migration is skipped, table never created)
    runMigrations();
    logger.info("Database migrations complete");

    initDatabase();
    logger.info("Database connection established");

    const isHealthy = healthCheck();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }

    // Migrate RRD to SQLite (blocking startup task)
    const rrdPath = process.env.RRD_PATH ?? "/run/acars/acarshub.rrd";
    await migrateRrdToSqlite(rrdPath);

    initializeMessageCounts();
    initializeMessageCounters();
    initializeAlertCache();
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
    logger.info("Socket.IO server ready", { namespace: "/main" });

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

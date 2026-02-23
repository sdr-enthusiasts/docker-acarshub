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
import type { SystemStatus } from "@acarshub/types";
import { getConfig } from "../config.js";
import {
  addMessageFromJson,
  getPerDecoderMessageCounts,
  optimizeDbMerge,
  optimizeDbRegular,
  pruneDatabase,
} from "../db/index.js";
import type { RawMessage } from "../db/queries/messageTransform.js";
import { enrichMessage } from "../formatters/enrichment.js";
import { formatAcarsMessage } from "../formatters/index.js";
import { createLogger } from "../utils/logger.js";
import {
  type AdsbData,
  destroyAdsbPoller,
  getAdsbPoller,
} from "./adsb-poller.js";
import {
  destroyMessageQueue,
  getMessageQueue,
  type QueuedMessage,
} from "./message-queue.js";
import { destroyScheduler, getScheduler } from "./scheduler.js";
import { checkAndAddStationId, getStationIds } from "./station-ids.js";
import { startStatsPruning } from "./stats-pruning.js";
import {
  createTcpListener,
  type MessageType,
  type TcpListener,
} from "./tcp-listener.js";

/**
 * Convert MessageType enum to database format
 * Matches Python getQueType() function behavior
 *
 * Python stores: "VDL-M2", "ACARS", "HFDL", "IMS-L", "IRDM"
 * TypeScript receives: "VDLM2", "ACARS", "HFDL", "IMSL", "IRDM"
 */
function normalizeMessageType(type: MessageType): string {
  switch (type) {
    case "VDLM2":
      return "VDL-M2";
    case "IMSL":
      return "IMS-L";
    case "ACARS":
    case "HFDL":
    case "IRDM":
      return type;
  }
}

const logger = createLogger("services");

export interface ServicesConfig {
  socketio: {
    emit: (event: string, data: unknown) => void;
  };
}

export interface ConnectionStatus {
  ACARS: boolean;
  VDLM2: boolean;
  HFDL: boolean;
  IMSL: boolean;
  IRDM: boolean;
}

/**
 * Background services orchestrator
 *
 * Manages:
 * - TCP listeners for all decoder types
 * - Message queue and processing pipeline
 * - Scheduled tasks (pruning, stats, health checks)
 * - ADS-B data polling
 * - Real-time status broadcasting
 *
 * Lifecycle:
 * 1. initialize() - Set up all services
 * 2. start() - Begin processing
 * 3. stop() - Graceful shutdown
 */
export class BackgroundServices extends EventEmitter {
  private config: ServicesConfig;
  private tcpListeners: Map<MessageType, TcpListener> = new Map();
  private connectionStatus: ConnectionStatus = {
    ACARS: false,
    VDLM2: false,
    HFDL: false,
    IMSL: false,
    IRDM: false,
  };
  private isRunning = false;

  constructor(config: ServicesConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize all background services
   * Does NOT start them - call start() to begin processing
   */
  public async initialize(): Promise<void> {
    logger.info("Initializing background services");

    const appConfig = getConfig();

    // Initialize TCP listeners for enabled decoders
    if (appConfig.enableAcars) {
      this.setupListener(
        "ACARS",
        appConfig.feedAcarsHost,
        appConfig.feedAcarsPort,
      );
    }

    if (appConfig.enableVdlm) {
      this.setupListener(
        "VDLM2",
        appConfig.feedVdlmHost,
        appConfig.feedVdlmPort,
      );
    }

    if (appConfig.enableHfdl) {
      this.setupListener(
        "HFDL",
        appConfig.feedHfdlHost,
        appConfig.feedHfdlPort,
      );
    }

    if (appConfig.enableImsl) {
      this.setupListener(
        "IMSL",
        appConfig.feedImslHost,
        appConfig.feedImslPort,
      );
    }

    if (appConfig.enableIrdm) {
      this.setupListener(
        "IRDM",
        appConfig.feedIrdmHost,
        appConfig.feedIrdmPort,
      );
    }

    // Set up message queue processing
    this.setupMessageQueue();

    // Set up scheduled tasks
    this.setupScheduledTasks();

    // Set up ADS-B polling if enabled
    if (appConfig.enableAdsb) {
      this.setupAdsbPolling();
    }

    logger.info("Background services initialized", {
      listeners: Array.from(this.tcpListeners.keys()),
      adsbEnabled: appConfig.enableAdsb,
    });
  }

  /**
   * Start all background services
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("Background services already running");
      return;
    }

    logger.info("Starting background services");

    this.isRunning = true;

    // Start all TCP listeners
    for (const listener of this.tcpListeners.values()) {
      listener.start();
    }

    // Start scheduler
    const scheduler = getScheduler();
    scheduler.start();

    // Start ADS-B polling if configured
    const appConfig = getConfig();
    if (appConfig.enableAdsb) {
      const adsbPoller = getAdsbPoller({
        url: appConfig.adsbUrl,
        pollInterval: 5000,
        timeout: 5000,
      });
      adsbPoller.start();
    }

    logger.info("Background services started");
  }

  /**
   * Stop all background services
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping background services");

    this.isRunning = false;

    // Stop all TCP listeners
    for (const listener of this.tcpListeners.values()) {
      listener.stop();
    }

    // Stop scheduler
    destroyScheduler();

    // Stop ADS-B polling
    destroyAdsbPoller();

    // Clear message queue
    destroyMessageQueue();

    logger.info("Background services stopped");
  }

  /**
   * Get current connection status for all decoders
   */
  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get cached ADS-B data (for new client connections)
   */
  public getCachedAdsbData(): AdsbData | null {
    const appConfig = getConfig();
    if (!appConfig.enableAdsb) {
      return null;
    }

    const adsbPoller = getAdsbPoller({
      url: appConfig.adsbUrl,
    });
    return adsbPoller.getCachedData();
  }

  /**
   * Set up a TCP listener for a decoder type
   */
  private setupListener(type: MessageType, host: string, port: number): void {
    const listener = createTcpListener({
      type,
      host,
      port,
      reconnectDelay: 1000,
    });

    // Handle connection state changes
    listener.on("connected", (listenerType: MessageType) => {
      this.connectionStatus[listenerType] = true;
      this.emitSystemStatus();

      logger.info(`${listenerType} connected`, {
        type: listenerType,
        host,
        port,
      });
    });

    listener.on("disconnected", (listenerType: MessageType) => {
      this.connectionStatus[listenerType] = false;
      this.emitSystemStatus();

      logger.warn(`${listenerType} disconnected`, {
        type: listenerType,
      });
    });

    listener.on("error", (listenerType: MessageType, error: Error) => {
      logger.error(`${listenerType} error`, {
        type: listenerType,
        error: error.message,
      });
    });

    // Handle incoming messages
    listener.on("message", (listenerType: MessageType, data: unknown) => {
      // Add to message queue for processing
      const messageQueue = getMessageQueue();
      messageQueue.push(listenerType, data);
    });

    this.tcpListeners.set(type, listener);
  }

  /**
   * Set up message queue processing
   * Messages are processed by formatters and saved to database
   */
  private setupMessageQueue(): void {
    const messageQueue = getMessageQueue(15);

    messageQueue.on("message", async (queuedMessage: QueuedMessage) => {
      try {
        // Format message using appropriate formatter.
        // The formatted message is a normalized flat dict matching Python's
        // format_acars_message() output: keys like timestamp, station_id,
        // text, icao (hex string), freq, level, etc.
        const rawMessage = queuedMessage.data as Record<string, unknown>;
        const formattedMessage = formatAcarsMessage(rawMessage);

        if (!formattedMessage) {
          logger.debug("Message formatter returned null, skipping", {
            type: queuedMessage.type,
          });
          return;
        }

        // Normalize message type to DB format BEFORE the DB call so the same
        // string is used for both insertion and Socket.IO emission.
        // Maps: VDLM2 → VDL-M2, IMSL → IMS-L, others unchanged.
        // NOTE: We do NOT set formattedMessage.message_type yet — if that key
        // is present when createDbSafeParams iterates the object it falls into
        // the unrecognized-key debug-log branch (noise). The type is passed as
        // the explicit first argument to addMessageFromJson instead.
        const dbMessageType = normalizeMessageType(queuedMessage.type);

        logger.debug("Message formatted", {
          type: queuedMessage.type,
          timestamp: formattedMessage.timestamp,
          hasText: !!formattedMessage.text,
          hasIcao: !!formattedMessage.icao,
        });

        // Save to database with alert matching.
        //
        // Pass the *formatted* message (not rawMessage) — this matches the
        // Python pipeline exactly:
        //   format_acars_message(raw) → formatted_dict → add_message_from_json()
        //
        // createDbSafeParams() reads the same flat keys the formatter produces:
        //   timestamp → msg_time (preserved as float or int per decoder)
        //   text/data  → msg_text
        //   icao       → icao  (already a hex string from the formatter)
        //   freq       → freq  (padEnd(7,"0") normalization applied)
        //   level      → level (stored as text, e.g. "-18.2")
        //   error      → error (stored as text, e.g. "0")
        //   …all other fields default to ""
        const alertMetadata = addMessageFromJson(
          dbMessageType,
          formattedMessage as RawMessage,
        );

        // Attach uid and alert metadata BEFORE enrichment.
        // enrichMessage() preserves these via PROTECTED_KEYS, so they will be
        // present on the enriched message emitted to clients — matching the
        // Python messageRelayListener which adds them to client_message after
        // retrieving them from alert_metadata_cache.
        formattedMessage.uid = alertMetadata.uid;
        formattedMessage.matched = alertMetadata.matched;
        formattedMessage.matched_text = alertMetadata.matched_text;
        formattedMessage.matched_icao = alertMetadata.matched_icao;
        formattedMessage.matched_tail = alertMetadata.matched_tail;
        formattedMessage.matched_flight = alertMetadata.matched_flight;

        // Set message_type now (after the DB call) for enrichment / Socket.IO.
        formattedMessage.message_type = dbMessageType;

        // Enrich message with additional fields (ICAO hex, airline, ground stations, etc.)
        const enrichedMessage = enrichMessage(formattedMessage);

        logger.trace("Message enriched and saved", {
          type: queuedMessage.type,
          uid: alertMetadata.uid,
          matched: alertMetadata.matched,
          hasIcaoHex: !!enrichedMessage.icao_hex,
          hasToaddrHex: !!enrichedMessage.toaddr_hex,
          hasFromaddrHex: !!enrichedMessage.fromaddr_hex,
        });

        // Emit enriched message to Socket.IO clients
        this.config.socketio.emit("acars_msg", {
          msghtml: enrichedMessage,
        });

        // Check for a new station ID and broadcast updated list to all clients
        const rawStationId = (formattedMessage as RawMessage).station_id;
        if (checkAndAddStationId(rawStationId)) {
          this.config.socketio.emit("station_ids", {
            station_ids: getStationIds(),
          });
        }
      } catch (err) {
        logger.error("Failed to process message", {
          type: queuedMessage.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  /**
   * Set up scheduled background tasks
   */
  private setupScheduledTasks(): void {
    const scheduler = getScheduler();

    // Emit system status every 30 seconds
    scheduler.every(30, "seconds").do(async () => {
      this.emitSystemStatus();
    }, "emit_system_status");

    // Prune old messages every 30 seconds
    scheduler
      .every(1, "minutes")
      .at(":30")
      .do(async () => {
        try {
          const pruneConfig = getConfig();
          await pruneDatabase(
            pruneConfig.dbSaveDays,
            pruneConfig.dbAlertSaveDays,
          );
          logger.debug("Database pruned");
        } catch (err) {
          logger.error("Failed to prune database", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, "prune_database");

    // Optimize database (merge FTS5 segments) every 5 minutes
    scheduler.every(5, "minutes").do(async () => {
      try {
        await optimizeDbMerge();
        logger.debug("Database optimized (merge)");
      } catch (err) {
        logger.error("Failed to optimize database (merge)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, "optimize_db_merge");

    // Full database optimization every 6 hours
    scheduler.every(6, "hours").do(async () => {
      try {
        await optimizeDbRegular();
        logger.info("Database optimized (full)");
      } catch (err) {
        logger.error("Failed to optimize database (full)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, "optimize_db_full");

    // Prune old time-series stats (configurable retention, default 3 years)
    startStatsPruning(scheduler);

    // Check thread health every minute (restart dead listeners)
    scheduler
      .every(1, "minutes")
      .at(":45")
      .do(async () => {
        this.checkThreadHealth();
      }, "check_thread_health");

    logger.info("Scheduled tasks configured", {
      taskCount: scheduler.getTasks().length,
    });
  }

  /**
   * Set up ADS-B polling
   */
  private setupAdsbPolling(): void {
    const appConfig = getConfig();
    const adsbPoller = getAdsbPoller({
      url: appConfig.adsbUrl,
      pollInterval: 5000,
      timeout: 5000,
    });

    adsbPoller.on("data", (data: AdsbData) => {
      // Broadcast to all connected clients
      this.config.socketio.emit("adsb_aircraft", data);

      logger.debug("ADS-B data broadcast", {
        aircraftCount: data.aircraft.length,
      });
    });

    adsbPoller.on("error", (error: Error) => {
      logger.error("ADS-B polling error", {
        error: error.message,
      });
    });

    logger.info("ADS-B polling configured", {
      url: appConfig.adsbUrl,
    });
  }

  /**
   * Emit real-time system status to all connected clients
   *
   * Builds a SystemStatus-conforming payload (matching the shared @acarshub/types
   * interface) so the frontend receives a consistent structure whether the status
   * originates from a scheduled broadcast or a request_status event response.
   *
   * Also uses the actual TCP connection state tracked by this class rather than
   * the hardcoded Connected:true/Alive:true values in getSystemStatus().
   */
  private emitSystemStatus(): void {
    const config = getConfig();
    const decoderCounts = getPerDecoderMessageCounts();
    const queueStats = getMessageQueue().getStats();

    const decodersStatus: Record<
      string,
      { Status: string; Connected: boolean; Alive: boolean }
    > = {};
    const serversStatus: Record<string, { Status: string; Messages: number }> =
      {};
    const globalStatus: Record<
      string,
      { Status: string; Count: number; LastMinute?: number }
    > = {};

    if (config.enableAcars) {
      const connected = this.connectionStatus.ACARS;
      const statusText = connected ? "Ok" : "Not Connected";
      decodersStatus.ACARS = {
        Status: statusText,
        Connected: connected,
        Alive: connected,
      };
      serversStatus.acars_server = {
        Status: statusText,
        Messages: decoderCounts.acars,
      };
      globalStatus.ACARS = {
        Status: statusText,
        Count: decoderCounts.acars,
        LastMinute: queueStats.acars.lastMinute,
      };
    }

    if (config.enableVdlm) {
      const connected = this.connectionStatus.VDLM2;
      const statusText = connected ? "Ok" : "Not Connected";
      decodersStatus.VDLM2 = {
        Status: statusText,
        Connected: connected,
        Alive: connected,
      };
      serversStatus.vdlm2_server = {
        Status: statusText,
        Messages: decoderCounts.vdlm2,
      };
      globalStatus.VDLM2 = {
        Status: statusText,
        Count: decoderCounts.vdlm2,
        LastMinute: queueStats.vdlm2.lastMinute,
      };
    }

    if (config.enableHfdl) {
      const connected = this.connectionStatus.HFDL;
      const statusText = connected ? "Ok" : "Not Connected";
      decodersStatus.HFDL = {
        Status: statusText,
        Connected: connected,
        Alive: connected,
      };
      serversStatus.hfdl_server = {
        Status: statusText,
        Messages: decoderCounts.hfdl,
      };
      globalStatus.HFDL = {
        Status: statusText,
        Count: decoderCounts.hfdl,
        LastMinute: queueStats.hfdl.lastMinute,
      };
    }

    if (config.enableImsl) {
      const connected = this.connectionStatus.IMSL;
      const statusText = connected ? "Ok" : "Not Connected";
      decodersStatus.IMSL = {
        Status: statusText,
        Connected: connected,
        Alive: connected,
      };
      serversStatus.imsl_server = {
        Status: statusText,
        Messages: decoderCounts.imsl,
      };
      globalStatus.IMSL = {
        Status: statusText,
        Count: decoderCounts.imsl,
        LastMinute: queueStats.imsl.lastMinute,
      };
    }

    if (config.enableIrdm) {
      const connected = this.connectionStatus.IRDM;
      const statusText = connected ? "Ok" : "Not Connected";
      decodersStatus.IRDM = {
        Status: statusText,
        Connected: connected,
        Alive: connected,
      };
      serversStatus.irdm_server = {
        Status: statusText,
        Messages: decoderCounts.irdm,
      };
      globalStatus.IRDM = {
        Status: statusText,
        Count: decoderCounts.irdm,
        LastMinute: queueStats.irdm.lastMinute,
      };
    }

    const systemStatus: SystemStatus = {
      status: {
        error_state: false,
        decoders: decodersStatus,
        servers: serversStatus,
        global: globalStatus,
        stats: {},
        external_formats: {},
        errors: {
          Total: queueStats.error.total,
          LastMinute: queueStats.error.lastMinute,
        },
        threads: {
          database: true,
          scheduler: true,
        },
      },
    };

    this.config.socketio.emit("system_status", systemStatus);
  }

  /**
   * Check health of all listeners and restart if needed
   */
  private checkThreadHealth(): void {
    for (const [type, listener] of this.tcpListeners.entries()) {
      if (!listener.connected) {
        logger.warn(
          `${type} listener not connected, restart will be automatic`,
          {
            type,
          },
        );
      }
    }
  }
}

/**
 * Create and initialize background services
 */
export async function createBackgroundServices(
  config: ServicesConfig,
): Promise<BackgroundServices> {
  const services = new BackgroundServices(config);
  await services.initialize();
  return services;
}

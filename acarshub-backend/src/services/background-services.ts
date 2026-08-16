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

// ----------------------------------------------------------------------------
// GOD-04: split out of the former services/index.ts (848 lines). Listener
// fan-in/status tracking now lives in listener-manager.ts; the SystemStatus
// payload builder lives in system-status.ts. This file keeps the top-level
// lifecycle: initialize/start/stop, the message-processing pipeline, and
// scheduled-task wiring. services/index.ts is now a thin barrel re-exporting
// from here.
// ----------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import {
  ACARS_CONNECTIONS,
  getConfig,
  HFDL_CONNECTIONS,
  IMSL_CONNECTIONS,
  IRDM_CONNECTIONS,
  VDLM_CONNECTIONS,
} from "../config.js";
import {
  addMessageFromJson,
  checkpoint,
  optimizeDbFts,
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
import { type ConnectionStatus, ListenerManager } from "./listener-manager.js";
import {
  destroyMessageQueue,
  getMessageQueue,
  type QueuedMessage,
} from "./message-queue.js";
import {
  pushAlert,
  pushMessage,
  reheatMessageBuffers,
} from "./message-ring-buffer.js";
import { destroyScheduler, getScheduler } from "./scheduler.js";
import {
  destroySearchIndexRebuilder,
  getSearchIndexRebuilder,
} from "./search-index-rebuild.js";
import { checkAndAddStationId, getStationIds } from "./station-ids.js";
import { startStatsPruning, stopStatsPruning } from "./stats-pruning.js";
import { buildMessageRate, buildSystemStatus } from "./system-status.js";
import type { MessageType } from "./tcp-listener.js";

export type { ConnectionStatus } from "./listener-manager.js";

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

const logger = createLogger("services:background-services");

export interface ServicesConfig {
  socketio: {
    emit: (event: string, data: unknown) => void;
  };
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
  private listenerManager: ListenerManager;
  private isRunning = false;

  constructor(config: ServicesConfig) {
    super();
    this.config = config;
    this.listenerManager = new ListenerManager({
      onMessage: (type, data) => getMessageQueue().push(type, data),
      onStatusChange: () => this.emitSystemStatus(),
    });
  }

  /**
   * Initialize all background services
   * Does NOT start them - call start() to begin processing
   */
  public async initialize(): Promise<void> {
    logger.info("Initializing background services");

    const appConfig = getConfig();

    // Wire up decoder listeners for each enabled type.
    if (appConfig.enableAcars) {
      this.listenerManager.setupDecoderConnections(
        "ACARS",
        ACARS_CONNECTIONS.descriptors,
      );
    }

    if (appConfig.enableVdlm) {
      this.listenerManager.setupDecoderConnections(
        "VDLM2",
        VDLM_CONNECTIONS.descriptors,
      );
    }

    if (appConfig.enableHfdl) {
      this.listenerManager.setupDecoderConnections(
        "HFDL",
        HFDL_CONNECTIONS.descriptors,
      );
    }

    if (appConfig.enableImsl) {
      this.listenerManager.setupDecoderConnections(
        "IMSL",
        IMSL_CONNECTIONS.descriptors,
      );
    }

    if (appConfig.enableIrdm) {
      this.listenerManager.setupDecoderConnections(
        "IRDM",
        IRDM_CONNECTIONS.descriptors,
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

    // Decide whether a decoder-version change requires a search-index
    // rebuild (v4.3 Phase 4) and, if so, fire it in the background. Wrapped
    // in try/catch: a scheduling failure here must never prevent the
    // backend from starting — the rebuild is a search-quality repair, not a
    // correctness requirement for ingest.
    try {
      getSearchIndexRebuilder().scheduleIfNeeded();
    } catch (error) {
      logger.error("Failed to schedule search index rebuild", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug("Background services initialized", {
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

    // Start all decoder listeners
    this.listenerManager.startAll();

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

    // Stop all decoder listeners
    this.listenerManager.stopAll();

    // Cancel pending stats-pruning alignment-window setTimeout (if the first
    // 3:00 AM run hasn't fired yet). The recurring 24-hour task it would have
    // registered lives on the scheduler and is cleared by destroyScheduler()
    // below.
    stopStatsPruning();

    // Stop scheduler
    destroyScheduler();

    // Stop ADS-B polling
    destroyAdsbPoller();

    // Stop the search-index rebuild service, if one is running
    destroySearchIndexRebuilder();

    // Clear message queue
    destroyMessageQueue();

    logger.info("Background services stopped");
  }

  /**
   * Get current connection status for all decoders
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.listenerManager.getConnectionStatus();
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

        logger.trace("Message formatted", {
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
        const enrichedMessage = enrichMessage(formattedMessage, "ingest");

        logger.trace("Message enriched and saved", {
          type: queuedMessage.type,
          uid: alertMetadata.uid,
          matched: alertMetadata.matched,
          hasIcaoHex: !!enrichedMessage.icao_hex,
          hasToaddrHex: !!enrichedMessage.toaddr_hex,
          hasFromaddrHex: !!enrichedMessage.fromaddr_hex,
        });

        // Update ring buffers BEFORE emitting so a client connecting at this
        // exact moment gets a consistent snapshot.
        if (alertMetadata.matched) {
          pushAlert(enrichedMessage);
        } else {
          pushMessage(enrichedMessage);
        }

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
      } catch (error) {
        logger.error("Failed to process message", {
          type: queuedMessage.type,
          error: error instanceof Error ? error.message : String(error),
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

    // Advance rolling rate window and broadcast per-decoder rates every 5 seconds.
    //
    // WHY 5 SECONDS
    // -------------
    // The rolling window is 12 × 5-second buckets (= 60 seconds total), so
    // advancing every 5 seconds gives the frontend a rate value that updates
    // smoothly without the jarring hard-reset of the legacy lastMinute counter.
    // One tiny packet per 5 seconds is negligible overhead compared with the
    // continuous acars_msg / adsb_aircraft traffic on the same connection.
    scheduler.every(5, "seconds").do(async () => {
      getMessageQueue().advanceRateBucket();
      this.emitMessageRate();
    }, "emit_message_rate");

    // Prune old messages every 30 seconds
    scheduler
      .every(1, "minutes")
      .at(":30")
      .do(async () => {
        try {
          const pruneConfig = getConfig();
          const { prunedAlerts } = await pruneDatabase(
            pruneConfig.dbSaveDays,
            pruneConfig.dbAlertSaveDays,
          );
          logger.debug("Database pruned");

          // If alert_matches rows were pruned, the ring buffer may reference
          // messages that no longer exist in the DB.  Reheat so the buffer
          // stays consistent with the DB state.
          if (prunedAlerts > 0) {
            await reheatMessageBuffers();
            logger.debug("Ring buffers reheated after alert prune", {
              prunedAlerts,
            });
          }
        } catch (error) {
          logger.error("Failed to prune database", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, "prune_database");

    // FTS5 merge every 5 minutes — bounded intraday segment consolidation.
    //
    // merge(500) writes up to 500 leaf pages (~2 MB) per call.  This limits
    // how many small segments accumulate between optimize runs and keeps
    // per-insert automerge overhead low.  It is open-loop (fixed work per
    // call) but that is acceptable here because optimize() is the correctness
    // guarantee — merge is just cheap housekeeping between optimize runs.
    scheduler.every(5, "minutes").do(async () => {
      try {
        await optimizeDbMerge();
        logger.debug("FTS5 merge complete");
      } catch (error) {
        logger.error("Failed to run FTS5 merge", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, "optimize_db_merge");

    // FTS5 optimize every 30 minutes — closed-loop tombstone clearance.
    //
    // WHY optimize AND NOT JUST merge(N)
    // -----------------------------------
    // merge(N) is open-loop: it does a fixed N pages of work per call
    // regardless of how much work actually exists.  There is no N that is
    // correct for all stations — a high-volume HFDL+VDL-M2 install generates
    // far more tombstones per interval than a single-decoder install.
    //
    // 'optimize' is closed-loop: it runs the FTS5 internal merge loop until
    // every level of the b-tree has at most one segment, reconciling all
    // tombstones in the process.  It is idempotent — on an already-clean
    // index it exits in milliseconds; on a fragmented one it does as much
    // work as needed.  No magic number required.
    //
    // WHY 30 MINUTES IS ALWAYS FAST
    // ------------------------------
    // optimize is only expensive when the index is already badly fragmented.
    // With merge running every 5 minutes the index is never badly fragmented,
    // so each optimize call has at most ~1,500 segments to consolidate
    // (≈50 inserts/min × 30 min on a busy HFDL+VDL-M2 install).
    // Consolidating 1,500 small segments takes well under a second.
    // The two jobs reinforce each other: merge limits how much work optimize
    // has to do; optimize provides the correctness guarantee merge cannot.
    scheduler.every(30, "minutes").do(async () => {
      try {
        await optimizeDbFts();
        logger.debug("FTS5 optimize complete");
      } catch (error) {
        logger.error("Failed to run FTS5 optimize", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, "optimize_db_fts");

    // Full database optimization (ANALYZE) every 6 hours.
    // Updates SQLite query-planner statistics — unrelated to FTS5 maintenance.
    scheduler.every(6, "hours").do(async () => {
      try {
        await optimizeDbRegular();
        logger.info("Database optimized (ANALYZE)");
      } catch (error) {
        logger.error("Failed to optimize database (ANALYZE)", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, "optimize_db_full");

    // Force WAL checkpoint every 15 minutes using TRUNCATE mode.
    //
    // SQLite's default auto-checkpoint uses PASSIVE mode, which silently skips
    // frames that are still referenced by an open read transaction.  With the
    // system-status emitter creating short read transactions every 30 seconds
    // there is almost always a recent read mark, so PASSIVE checkpoints can
    // stall indefinitely and the WAL grows without bound.
    //
    // TRUNCATE mode blocks new writers until all current readers finish, then
    // checkpoints every frame and truncates the WAL file to zero bytes.  The
    // 15-minute cadence ensures the WAL never accumulates more than ~15 minutes
    // of writes regardless of reader activity, and the truncation reclaims the
    // disk space immediately (unlike RESTART which resets the write pointer but
    // leaves the file at its high-water-mark size).
    scheduler.every(15, "minutes").do(async () => {
      try {
        const { framesCheckpointed, framesRemaining } = checkpoint("TRUNCATE");
        logger.debug("WAL checkpoint complete", {
          framesCheckpointed,
          framesRemaining,
        });
        if (framesRemaining > 0) {
          logger.warn("WAL checkpoint incomplete — frames remain", {
            framesRemaining,
          });
        }
      } catch (error) {
        logger.error("Failed to run WAL checkpoint", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, "wal_checkpoint");

    // Prune old time-series stats (configurable retention, default 3 years)
    startStatsPruning(scheduler);

    // Check thread health every minute (restart dead listeners)
    scheduler
      .every(1, "minutes")
      .at(":45")
      .do(async () => {
        this.listenerManager.checkThreadHealth();
      }, "check_thread_health");

    logger.debug("Scheduled tasks configured", {
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

      logger.trace("ADS-B data broadcast", {
        aircraftCount: data.aircraft.length,
      });
    });

    adsbPoller.on("error", (error: Error) => {
      logger.error("ADS-B polling error", {
        error: error.message,
      });
    });

    logger.debug("ADS-B polling configured", {
      url: appConfig.adsbUrl,
    });
  }

  /**
   * Emit real-time system status to all connected clients.
   *
   * Delegates payload construction to buildSystemStatus() (system-status.ts)
   * so the per-decoder status shape can be unit tested independently of a
   * live socket.
   */
  private emitSystemStatus(): void {
    const systemStatus = buildSystemStatus(
      this.listenerManager.getConnectionStatus(),
    );
    this.config.socketio.emit("system_status", systemStatus);
  }

  /**
   * Compute and broadcast the current rolling message rate to all clients.
   *
   * Reads the rolling rate from the message queue (sum of the last 12 × 5-second
   * buckets = msgs/min) and emits a message_rate event to the /main namespace.
   * Only enabled decoders contribute non-zero values; disabled ones are always 0.
   */
  private emitMessageRate(): void {
    this.config.socketio.emit("message_rate", buildMessageRate());
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

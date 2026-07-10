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
 * Socket.IO frequency / signal / message-count / status handlers
 * (GOD-01 split from socket/handlers.ts)
 *
 * Covers: request_status, signal_freqs, signal_count, signal_graphs.
 */

import type {
  SignalCountData,
  SignalFreqData,
  SystemStatus,
} from "@acarshub/types";
import { getConfig } from "../../config.js";
import {
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getErrors,
  getPerDecoderMessageCounts,
} from "../../db/index.js";
import { getMessageQueue } from "../../services/message-queue.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket } from "../types.js";

const logger = createLogger("socket:handlers-stats");

/**
 * Get system status data
 *
 * Matches Python format from get_realtime_status()
 * Python uses uppercase decoder names (ACARS, VDLM2, HFDL, IMSL, IRDM)
 * and includes per-decoder entries in global status
 */
function getSystemStatus(): SystemStatus {
  const config = getConfig();
  const decoderCounts = getPerDecoderMessageCounts();
  const queueStats = getMessageQueue().getStats();
  const rollingRates = getMessageQueue().getRollingRates();

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

  // ACARS status
  if (config.enableAcars) {
    decodersStatus.ACARS = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.acars_server = {
      Status: "Ok",
      Messages: decoderCounts.acars,
    };
    globalStatus.ACARS = {
      Status: "Ok",
      Count: decoderCounts.acars,
      LastMinute: rollingRates.acars,
    };
  }

  // VDLM2 status
  if (config.enableVdlm) {
    decodersStatus.VDLM2 = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.vdlm2_server = {
      Status: "Ok",
      Messages: decoderCounts.vdlm2,
    };
    globalStatus.VDLM2 = {
      Status: "Ok",
      Count: decoderCounts.vdlm2,
      LastMinute: rollingRates.vdlm2,
    };
  }

  // HFDL status
  if (config.enableHfdl) {
    decodersStatus.HFDL = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.hfdl_server = {
      Status: "Ok",
      Messages: decoderCounts.hfdl,
    };
    globalStatus.HFDL = {
      Status: "Ok",
      Count: decoderCounts.hfdl,
      LastMinute: rollingRates.hfdl,
    };
  }

  // IMSL status
  if (config.enableImsl) {
    decodersStatus.IMSL = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.imsl_server = {
      Status: "Ok",
      Messages: decoderCounts.imsl,
    };
    globalStatus.IMSL = {
      Status: "Ok",
      Count: decoderCounts.imsl,
      LastMinute: rollingRates.imsl,
    };
  }

  // IRDM status
  if (config.enableIrdm) {
    decodersStatus.IRDM = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.irdm_server = {
      Status: "Ok",
      Messages: decoderCounts.irdm,
    };
    globalStatus.IRDM = {
      Status: "Ok",
      Count: decoderCounts.irdm,
      LastMinute: rollingRates.irdm,
    };
  }

  return {
    status: {
      error_state: false,
      decoders: decodersStatus,
      servers: serversStatus,
      global: globalStatus,
      stats: {}, // Legacy compatibility (empty)
      external_formats: {}, // Legacy compatibility (empty)
      errors: {
        Total: queueStats.error.total,
        LastMinute: queueStats.error.lastMinute,
      },
      threads: {
        database: true,
        scheduler: true, // TypeScript backend doesn't have separate scheduler thread
      },
    },
  };
}

/**
 * Handle system status request
 *
 * Mirrors Python: @socketio.on("request_status", namespace="/main")
 *
 * Emits both system_status and message_rate so the Status page receives the
 * rolling 1-minute message average immediately on demand, rather than waiting
 * up to 5 seconds for the background scheduler to broadcast it.
 */
export function handleRequestStatus(socket: TypedSocket): void {
  try {
    const status = getSystemStatus();
    socket.emit("system_status", status);

    // Also emit the current rolling rate so the Status page can display it
    // immediately without waiting for the next 5-second scheduler tick.
    const rates = getMessageQueue().getRollingRates();
    socket.emit("message_rate", rates);

    logger.debug("System status sent", {
      socketId: socket.id,
    });
  } catch (error) {
    logger.error("Error getting system status", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle frequency counts request
 *
 * Mirrors Python: @socketio.on("signal_freqs", namespace="/main")
 */
export function handleSignalFreqs(socket: TypedSocket): void {
  try {
    const freqData = getAllFreqCounts();
    const formattedData: SignalFreqData = {
      freqs: freqData.map((item) => ({
        freq_type: item.decoder,
        freq: item.freq ?? "",
        count: item.count ?? 0,
      })),
    };

    socket.emit("signal_freqs", formattedData);

    logger.debug("Frequency counts sent", {
      socketId: socket.id,
      count: formattedData.freqs.length,
    });
  } catch (error) {
    logger.error("Error getting frequency counts", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle message count request
 *
 * Mirrors Python: @socketio.on("signal_count", namespace="/main")
 */
export function handleSignalCount(socket: TypedSocket): void {
  try {
    const errorStats = getErrors();
    const formatted: SignalCountData = {
      count: {
        non_empty_total: errorStats.non_empty_total,
        non_empty_errors: errorStats.non_empty_errors,
        empty_total: errorStats.empty_total,
        empty_errors: errorStats.empty_errors,
      },
    };

    socket.emit("signal_count", formatted);

    logger.debug("Message counts sent", {
      socketId: socket.id,
      stats: formatted.count,
    });
  } catch (error) {
    logger.error("Error getting message counts", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle signal_graphs request
 *
 * Python implementation: acarshub.py request_graphs()
 * Sends alert terms and signal levels to requesting client
 */
export function handleSignalGraphs(socket: TypedSocket): void {
  try {
    // Send alert terms
    const alertCounts = getAlertCounts();
    const alertTermData: Record<
      number,
      { count: number; id: number; term: string }
    > = {};
    for (let i = 0; i < alertCounts.length; i++) {
      alertTermData[i] = {
        count: alertCounts[i].count ?? 0,
        id: i,
        term: alertCounts[i].term ?? "",
      };
    }
    socket.emit("alert_terms", { data: alertTermData });

    // Send signal levels
    const signalLevels = getAllSignalLevels();
    socket.emit("signal", { levels: signalLevels });

    logger.debug("Signal graphs data sent", { socketId: socket.id });
  } catch (error) {
    logger.error("Failed to send signal graphs", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

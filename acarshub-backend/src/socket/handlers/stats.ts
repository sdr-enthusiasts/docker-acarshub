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

import type { SignalCountData, SignalFreqData } from "@acarshub/types";
import {
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getErrors,
} from "../../db/index.js";
import { getConnectionStatus } from "../../services/connection-state.js";
import { getMessageQueue } from "../../services/message-queue.js";
import { buildSystemStatus } from "../../services/system-status.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket } from "../types.js";

const logger = createLogger("socket:handlers-stats");

/**
 * Handle system status request
 *
 * Mirrors Python: @socketio.on("request_status", namespace="/main")
 *
 * Uses the same builder and the real connection state as the scheduled
 * BackgroundServices broadcast, so a poll never overwrites the real status
 * with a stale or fabricated one.
 *
 * Emits both system_status and message_rate so the Status page receives the
 * rolling 1-minute message average immediately on demand, rather than waiting
 * up to 5 seconds for the background scheduler to broadcast it.
 */
export function handleRequestStatus(socket: TypedSocket): void {
  try {
    const status = buildSystemStatus(getConnectionStatus());
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

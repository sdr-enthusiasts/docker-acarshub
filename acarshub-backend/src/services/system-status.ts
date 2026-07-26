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
// GOD-04: extracted from services/index.ts.
//
// Pure builder for the real-time SystemStatus payload broadcast to Socket.IO
// clients. Kept side-effect-free (no socketio.emit call here) so the
// per-decoder status-shape logic can be unit tested without a live socket —
// BackgroundServices (background-services.ts) owns the actual emit call.
// ----------------------------------------------------------------------------

import type { MessageRateData, SystemStatus } from "@acarshub/types";
import { getConfig } from "../config.js";
import { getPerDecoderMessageCounts } from "../db/index.js";
import type { ConnectionStatus } from "./listener-manager.js";
import { getMessageQueue } from "./message-queue.js";

/**
 * Build a SystemStatus-conforming payload (matching the shared @acarshub/types
 * interface) so the frontend receives a consistent structure whether the status
 * originates from a scheduled broadcast or a request_status event response.
 *
 * Uses the actual TCP/UDP/ZMQ connection state tracked by ListenerManager
 * rather than hardcoded Connected:true/Alive:true values.
 */
export function buildSystemStatus(
  connectionStatus: ConnectionStatus,
): SystemStatus {
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
    const connected = connectionStatus.ACARS;
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
    const connected = connectionStatus.VDLM2;
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
    const connected = connectionStatus.HFDL;
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
    const connected = connectionStatus.IMSL;
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
    const connected = connectionStatus.IRDM;
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

  return {
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
}

/**
 * Compute the current rolling per-decoder message rate (sum of the last
 * 12 × 5-second buckets = msgs/min). Only enabled decoders contribute
 * non-zero values; disabled ones are always 0.
 */
export function buildMessageRate(): MessageRateData {
  return getMessageQueue().getRollingRates();
}

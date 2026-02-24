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
import { Socket } from "node:net";
import type { ConnectionDescriptor } from "../config.js";
import { createLogger } from "../utils/logger.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
} from "./decoder-listener.js";

const logger = createLogger("tcp-listener");

export type MessageType = "ACARS" | "VDLM2" | "HFDL" | "IMSL" | "IRDM";

export interface TcpListenerConfig {
  type: MessageType;
  host: string;
  port: number;
  reconnectDelay?: number;
}

/**
 * TCP Listener for decoder feeds (acarsdec, vdlm2dec, dumphfdl, etc.)
 *
 * Implements IDecoderListener. Accepts either a legacy TcpListenerConfig
 * (for backwards compatibility) or a ConnectionDescriptor.
 *
 * Handles:
 * - Connection management with auto-reconnect
 * - JSON line parsing with partial message reassembly
 * - Back-to-back JSON object splitting (}{ -> }\n{)
 * - Error handling and connection state tracking
 *
 * Emits events:
 * - 'message': Successfully parsed JSON message
 * - 'connected': Connection established
 * - 'disconnected': Connection lost
 * - 'error': Error occurred
 */
export class TcpListener
  extends EventEmitter<DecoderListenerEvents>
  implements IDecoderListener
{
  private socket: Socket | null = null;
  private readonly messageType: MessageType;
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelay: number;
  private isRunning = false;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private partialMessage: string | null = null;

  constructor(
    type: MessageType,
    descriptor: ConnectionDescriptor,
    reconnectDelay?: number,
  );
  constructor(config: TcpListenerConfig);
  constructor(
    typeOrConfig: MessageType | TcpListenerConfig,
    descriptor?: ConnectionDescriptor,
    reconnectDelay = 1000,
  ) {
    super();

    if (typeof typeOrConfig === "string") {
      // New-style: (type, descriptor, reconnectDelay?)
      // descriptor is always defined when typeOrConfig is a string (enforced by overload)
      const desc = descriptor as ConnectionDescriptor;
      this.messageType = typeOrConfig;
      this.host = desc.host;
      this.port = desc.port;
      this.reconnectDelay = reconnectDelay;
    } else {
      // Legacy-style: (config)
      this.messageType = typeOrConfig.type;
      this.host = typeOrConfig.host;
      this.port = typeOrConfig.port;
      this.reconnectDelay = typeOrConfig.reconnectDelay ?? 1000;
    }
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the TCP listener.
   * Initiates connection and auto-reconnect loop. Idempotent.
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn(`${this.messageType} TCP listener already running`, {
        type: this.messageType,
      });
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ${this.messageType} TCP listener`, {
      type: this.messageType,
      host: this.host,
      port: this.port,
    });

    this.connect();
  }

  /**
   * Stop the TCP listener.
   * Closes connection and cancels reconnect attempts. Idempotent.
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping ${this.messageType} TCP listener`, {
      type: this.messageType,
    });

    this.isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.isConnected = false;
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — state
  // -------------------------------------------------------------------------

  /** True when the TCP connection is established. */
  public get connected(): boolean {
    return this.isConnected;
  }

  /** Snapshot of listener state for status reporting. */
  public getStats(): DecoderListenerStats {
    return {
      type: this.messageType,
      listenType: "tcp",
      connectionPoint: `${this.host}:${this.port}`,
      connected: this.isConnected,
    };
  }

  // -------------------------------------------------------------------------
  // Internal connection management
  // -------------------------------------------------------------------------

  private connect(): void {
    if (!this.isRunning) {
      return;
    }

    // Clean up existing socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }

    this.socket = new Socket();
    this.socket.setTimeout(1000); // 1 second timeout for reads

    this.socket.on("connect", () => {
      this.isConnected = true;
      this.partialMessage = null; // Reset partial message buffer on new connection

      logger.debug(`${this.messageType} TCP connected`, {
        type: this.messageType,
        host: this.host,
        port: this.port,
      });

      this.emit("connected", this.messageType);
    });

    this.socket.on("data", (data: Buffer) => {
      this.handleData(data);
    });

    this.socket.on("timeout", () => {
      // Timeout is expected during normal operation (no data received)
      // Don't log or reconnect, just continue
    });

    this.socket.on("error", (err: Error) => {
      logger.error(`${this.messageType} TCP socket error`, {
        type: this.messageType,
        error: err.message,
      });

      this.emit("error", this.messageType, err);
      this.handleDisconnect();
    });

    this.socket.on("close", () => {
      logger.debug(`${this.messageType} TCP connection closed`, {
        type: this.messageType,
      });

      this.handleDisconnect();
    });

    this.socket.on("end", () => {
      logger.debug(`${this.messageType} TCP connection ended`, {
        type: this.messageType,
      });

      this.handleDisconnect();
    });

    try {
      this.socket.connect(this.port, this.host);
    } catch (err) {
      logger.error(`${this.messageType} TCP connection failed`, {
        type: this.messageType,
        error: err instanceof Error ? err.message : String(err),
      });

      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    if (wasConnected) {
      this.emit("disconnected", this.messageType);
    }

    if (this.isRunning && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectDelay);

      logger.debug(
        `${this.messageType} TCP reconnecting in ${this.reconnectDelay}ms`,
        { type: this.messageType },
      );
    }
  }

  /**
   * Handle incoming data from TCP socket.
   * Processes JSON lines with partial message reassembly.
   */
  private handleData(data: Buffer): void {
    let decoded = data.toString("utf-8");

    if (decoded.length === 0) {
      this.handleDisconnect();
      return;
    }

    // Handle back-to-back JSON objects: }{ becomes }\n{
    decoded = decoded.replace(/\}\{/g, "}\n{");

    const lines = decoded.split("\n");

    // Try to reassemble partial message from previous read
    if (this.partialMessage !== null && lines.length > 0) {
      const combined = this.partialMessage + lines[0];

      try {
        JSON.parse(combined);
        lines[0] = combined;

        logger.debug(`${this.messageType} TCP partial message reassembled`, {
          type: this.messageType,
        });
      } catch {
        logger.warn(
          `${this.messageType} TCP partial message reassembly failed`,
          {
            type: this.messageType,
            partial: this.partialMessage.substring(0, 100),
          },
        );
      }

      this.partialMessage = null;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.length === 0) {
        continue;
      }

      try {
        const message = JSON.parse(line);
        this.emit("message", this.messageType, message);
      } catch (err) {
        if (i === lines.length - 1) {
          this.partialMessage = line;

          logger.debug(`${this.messageType} TCP storing partial message`, {
            type: this.messageType,
            length: line.length,
          });
        } else {
          logger.debug(`${this.messageType} TCP skipping invalid JSON`, {
            type: this.messageType,
            line: line.substring(0, 100),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
}

/**
 * Create and start a TCP listener (legacy helper, kept for test compatibility).
 */
export function createTcpListener(config: TcpListenerConfig): TcpListener {
  const listener = new TcpListener(config);
  listener.start();
  return listener;
}

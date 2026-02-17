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
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tcp-listener");

export type MessageType = "ACARS" | "VDLM2" | "HFDL" | "IMSL" | "IRDM";

export interface TcpListenerConfig {
  type: MessageType;
  host: string;
  port: number;
  reconnectDelay?: number;
}

export interface TcpListenerEvents {
  message: [type: MessageType, data: unknown];
  connected: [type: MessageType];
  disconnected: [type: MessageType];
  error: [type: MessageType, error: Error];
}

/**
 * TCP Listener for decoder feeds (acarsdec, vdlm2dec, dumphfdl, etc.)
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
export class TcpListener extends EventEmitter<TcpListenerEvents> {
  private socket: Socket | null = null;
  private config: Required<TcpListenerConfig>;
  private isRunning = false;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private partialMessage: string | null = null;

  constructor(config: TcpListenerConfig) {
    super();
    this.config = {
      ...config,
      reconnectDelay: config.reconnectDelay ?? 1000,
    };
  }

  /**
   * Start the TCP listener
   * Initiates connection and auto-reconnect loop
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn(`${this.config.type} listener already running`, {
        type: this.config.type,
      });
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ${this.config.type} listener`, {
      type: this.config.type,
      host: this.config.host,
      port: this.config.port,
    });

    this.connect();
  }

  /**
   * Stop the TCP listener
   * Closes connection and cancels reconnect attempts
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping ${this.config.type} listener`, {
      type: this.config.type,
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

  /**
   * Get current connection state
   */
  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Initiate TCP connection
   */
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

      logger.debug(`${this.config.type} connected`, {
        type: this.config.type,
        host: this.config.host,
        port: this.config.port,
      });

      this.emit("connected", this.config.type);
    });

    this.socket.on("data", (data: Buffer) => {
      this.handleData(data);
    });

    this.socket.on("timeout", () => {
      // Timeout is expected during normal operation (no data received)
      // Don't log or reconnect, just continue
    });

    this.socket.on("error", (err: Error) => {
      logger.error(`${this.config.type} socket error`, {
        type: this.config.type,
        error: err.message,
      });

      this.emit("error", this.config.type, err);
      this.handleDisconnect();
    });

    this.socket.on("close", () => {
      logger.debug(`${this.config.type} connection closed`, {
        type: this.config.type,
      });

      this.handleDisconnect();
    });

    this.socket.on("end", () => {
      logger.debug(`${this.config.type} connection ended`, {
        type: this.config.type,
      });

      this.handleDisconnect();
    });

    // Attempt connection
    try {
      this.socket.connect(this.config.port, this.config.host);
    } catch (err) {
      logger.error(`${this.config.type} connection failed`, {
        type: this.config.type,
        error: err instanceof Error ? err.message : String(err),
      });

      this.handleDisconnect();
    }
  }

  /**
   * Handle disconnection and schedule reconnect
   */
  private handleDisconnect(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    if (wasConnected) {
      this.emit("disconnected", this.config.type);
    }

    // Schedule reconnect if still running
    if (this.isRunning && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.config.reconnectDelay);

      logger.debug(
        `${this.config.type} reconnecting in ${this.config.reconnectDelay}ms`,
        {
          type: this.config.type,
        },
      );
    }
  }

  /**
   * Handle incoming data from TCP socket
   * Processes JSON lines with partial message reassembly
   */
  private handleData(data: Buffer): void {
    let decoded = data.toString("utf-8");

    if (decoded.length === 0) {
      this.handleDisconnect();
      return;
    }

    // Handle back-to-back JSON objects: }{ becomes }\n{
    decoded = decoded.replace(/\}\{/g, "}\n{");

    // Split on newlines
    const lines = decoded.split("\n");

    // Try to reassemble partial message from previous read
    if (this.partialMessage !== null && lines.length > 0) {
      const combined = this.partialMessage + lines[0];

      try {
        // Check if combined message is valid JSON
        JSON.parse(combined);

        // Success! Replace first line with reassembled message
        lines[0] = combined;

        logger.debug(`${this.config.type} partial message reassembled`, {
          type: this.config.type,
        });
      } catch {
        // Reassembly failed, log and discard
        logger.warn(`${this.config.type} partial message reassembly failed`, {
          type: this.config.type,
          partial: this.partialMessage.substring(0, 100),
        });
      }

      // Clear partial message buffer
      this.partialMessage = null;
    }

    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.length === 0) {
        continue;
      }

      try {
        const message = JSON.parse(line);
        this.emit("message", this.config.type, message);
      } catch (err) {
        // If this is the last line, it might be a partial message
        if (i === lines.length - 1) {
          this.partialMessage = line;

          logger.debug(`${this.config.type} storing partial message`, {
            type: this.config.type,
            length: line.length,
          });
        } else {
          // Not the last line, so it's genuinely invalid JSON
          logger.debug(`${this.config.type} skipping invalid JSON`, {
            type: this.config.type,
            line: line.substring(0, 100),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /**
   * Get listener statistics
   */
  public getStats(): {
    type: MessageType;
    connected: boolean;
    host: string;
    port: number;
  } {
    return {
      type: this.config.type,
      connected: this.isConnected,
      host: this.config.host,
      port: this.config.port,
    };
  }
}

/**
 * Create and start a TCP listener
 */
export function createTcpListener(config: TcpListenerConfig): TcpListener {
  const listener = new TcpListener(config);
  listener.start();
  return listener;
}

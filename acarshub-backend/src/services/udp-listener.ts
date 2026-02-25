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

import * as dgram from "node:dgram";
import { EventEmitter } from "node:events";
import type { ConnectionDescriptor } from "../config.js";
import { createLogger } from "../utils/logger.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
} from "./decoder-listener.js";
import type { MessageType } from "./tcp-listener.js";

const logger = createLogger("udp-listener");

/**
 * UDP Listener for decoder feeds.
 *
 * Binds a UDP datagram socket and emits parsed JSON messages.  Unlike TCP,
 * UDP has no connection state — "connected" means the socket is successfully
 * bound and ready to receive datagrams.
 *
 * Key behaviours:
 * - Each datagram may contain one or more back-to-back JSON objects.
 *   The same }{→}\n{ split logic used by TcpListener is applied so that
 *   concatenated objects in a single datagram are handled correctly.
 * - No partial-message reassembly: UDP datagrams are atomic, so a partial
 *   JSON object can never arrive across multiple reads.
 * - On bind failure the listener emits `error` and retries after
 *   `reconnectDelay` milliseconds (e.g. when the port is already in use).
 * - `stop()` closes the socket cleanly; no further retries are scheduled.
 */
export class UdpListener
  extends EventEmitter<DecoderListenerEvents>
  implements IDecoderListener
{
  private readonly messageType: MessageType;
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelay: number;

  private socket: dgram.Socket | null = null;
  private isRunning = false;
  private isConnected = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    type: MessageType,
    descriptor: ConnectionDescriptor,
    reconnectDelay = 5000,
  ) {
    super();
    this.messageType = type;
    this.host = descriptor.host;
    this.port = descriptor.port;
    this.reconnectDelay = reconnectDelay;
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — lifecycle
  // -------------------------------------------------------------------------

  /** Bind the UDP socket. Idempotent — calling twice is a no-op. */
  public start(): void {
    if (this.isRunning) {
      logger.warn(`${this.messageType} UDP listener already running`, {
        type: this.messageType,
      });
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ${this.messageType} UDP listener`, {
      type: this.messageType,
      host: this.host,
      port: this.port,
    });

    this.bind();
  }

  /** Close the socket and cancel any pending retry. Idempotent. */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping ${this.messageType} UDP listener`, {
      type: this.messageType,
    });

    this.isRunning = false;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.closeSocket();
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — state
  // -------------------------------------------------------------------------

  /** True once the UDP socket is successfully bound. */
  public get connected(): boolean {
    return this.isConnected;
  }

  /** Snapshot of listener state for status reporting. */
  public getStats(): DecoderListenerStats {
    return {
      type: this.messageType,
      listenType: "udp",
      connectionPoint: `${this.host}:${this.port}`,
      connected: this.isConnected,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — socket lifecycle
  // -------------------------------------------------------------------------

  private bind(): void {
    if (!this.isRunning) {
      return;
    }

    // Clean up any existing socket before creating a new one.
    this.closeSocket();

    const sock = dgram.createSocket("udp4");
    this.socket = sock;

    sock.on("listening", () => {
      this.isConnected = true;

      const addr = sock.address();
      logger.info(`${this.messageType} UDP socket bound`, {
        type: this.messageType,
        address: addr.address,
        port: addr.port,
      });

      this.emit("connected", this.messageType);
    });

    sock.on("message", (msg: Buffer) => {
      this.handleDatagram(msg);
    });

    sock.on("error", (err: Error) => {
      logger.error(`${this.messageType} UDP socket error`, {
        type: this.messageType,
        error: err.message,
      });

      this.emit("error", this.messageType, err);
      this.handleBindFailure();
    });

    sock.on("close", () => {
      const wasConnected = this.isConnected;
      this.isConnected = false;

      if (wasConnected) {
        logger.debug(`${this.messageType} UDP socket closed`, {
          type: this.messageType,
        });
        this.emit("disconnected", this.messageType);
      }
    });

    try {
      sock.bind(this.port, this.host === "*" ? "0.0.0.0" : this.host);
    } catch (err) {
      logger.error(`${this.messageType} UDP bind() threw synchronously`, {
        type: this.messageType,
        error: err instanceof Error ? err.message : String(err),
      });
      this.handleBindFailure();
    }
  }

  private closeSocket(): void {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.close();
      } catch {
        // Ignore errors when closing an already-closed socket.
      }
      this.socket = null;
    }

    this.isConnected = false;
  }

  private handleBindFailure(): void {
    this.closeSocket();

    if (this.isRunning && !this.retryTimer) {
      logger.debug(
        `${this.messageType} UDP retrying bind in ${this.reconnectDelay}ms`,
        { type: this.messageType },
      );

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.bind();
      }, this.reconnectDelay);
    }
  }

  // -------------------------------------------------------------------------
  // Internal — datagram parsing
  // -------------------------------------------------------------------------

  /**
   * Parse an incoming datagram buffer.
   *
   * A datagram is atomic — no partial reassembly is needed.  However a single
   * datagram may carry multiple back-to-back JSON objects (}{ sequences),
   * which are split into individual messages before parsing.
   */
  private handleDatagram(msg: Buffer): void {
    let decoded = msg.toString("utf-8").trim();

    if (decoded.length === 0) {
      return;
    }

    // Split concatenated JSON objects: }{ → }\n{
    decoded = decoded.replace(/\}\{/g, "}\n{");

    for (const line of decoded.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      try {
        const message = JSON.parse(trimmed);
        this.emit("message", this.messageType, message);
      } catch (err) {
        logger.debug(`${this.messageType} UDP skipping invalid JSON`, {
          type: this.messageType,
          line: trimmed.substring(0, 100),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

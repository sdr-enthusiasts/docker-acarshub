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
import type { ConnectionDescriptor } from "../config.js";
import { createLogger } from "../utils/logger.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
} from "./decoder-listener.js";
import type { MessageType } from "./tcp-listener.js";

const logger = createLogger("zmq-listener");

/**
 * ZMQ Subscriber listener for decoder feeds.
 *
 * Opens a ZMQ SUB socket and connects to the remote PUB endpoint exposed by
 * a decoder (e.g. dumpvdl2 with ZMQ_MODE=server) or an acars_router instance.
 *
 * Key behaviours:
 * - Uses a Subscriber (SUB) socket — Node.js is the consumer, not the server.
 * - Subscribes to all topics ("") so every published frame is received.
 * - libzmq handles reconnection transparently when the remote PUB restarts.
 * - Connection state is tracked via the socket.events monitor loop (Option C
 *   from the architecture doc) which surfaces real TCP-layer connect/disconnect
 *   events independent of message rate.
 * - Each received frame is treated as one potential JSON message. The same
 *   }{→}\n{ split logic used by TcpListener / UdpListener is applied
 *   defensively.
 * - stop() terminates both async loops by closing the socket.
 *
 * The `zeromq` npm package v6 ships prebuilt binaries for the supported
 * platforms and statically links libzmq, so no system package is required.
 */
export class ZmqListener
  extends EventEmitter<DecoderListenerEvents>
  implements IDecoderListener
{
  private readonly messageType: MessageType;
  private readonly host: string;
  private readonly port: number;

  private isRunning = false;
  private isConnected = false;

  // The socket is created on start() and set to null on stop().
  // Typed as unknown to avoid a hard import of the zeromq types at the module
  // level — zeromq is loaded dynamically so tests can mock it without needing
  // the native add-on compiled.
  private socket: unknown = null;

  constructor(type: MessageType, descriptor: ConnectionDescriptor) {
    super();
    this.messageType = type;
    this.host = descriptor.host;
    this.port = descriptor.port;
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — lifecycle
  // -------------------------------------------------------------------------

  /** Connect the ZMQ SUB socket and start receive / monitor loops. Idempotent. */
  public start(): void {
    if (this.isRunning) {
      logger.warn(`${this.messageType} ZMQ listener already running`, {
        type: this.messageType,
      });
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ${this.messageType} ZMQ listener`, {
      type: this.messageType,
      host: this.host,
      port: this.port,
    });

    // Kick off async loops without blocking the synchronous start() call.
    this.connectAndReceive().catch((err: unknown) => {
      if (this.isRunning) {
        logger.error(`${this.messageType} ZMQ receive loop exited with error`, {
          type: this.messageType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  /** Close the ZMQ socket and stop both async loops. Idempotent. */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping ${this.messageType} ZMQ listener`, {
      type: this.messageType,
    });

    this.isRunning = false;
    this.closeSocket();
  }

  // -------------------------------------------------------------------------
  // IDecoderListener — state
  // -------------------------------------------------------------------------

  /** True when a TCP connection to the remote PUB endpoint is established. */
  public get connected(): boolean {
    return this.isConnected;
  }

  /** Snapshot of listener state for status reporting. */
  public getStats(): DecoderListenerStats {
    return {
      type: this.messageType,
      listenType: "zmq",
      connectionPoint: `${this.host}:${this.port}`,
      connected: this.isConnected,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — socket lifecycle and async loops
  // -------------------------------------------------------------------------

  private closeSocket(): void {
    if (this.socket !== null) {
      try {
        // zeromq Subscriber exposes .close() synchronously.
        (this.socket as { close(): void }).close();
      } catch {
        // Ignore errors closing an already-closed socket.
      }
      this.socket = null;
    }

    if (this.isConnected) {
      this.isConnected = false;
      this.emit("disconnected", this.messageType);
    }
  }

  /**
   * Main entry point for the ZMQ async work.
   *
   * Creates the socket, subscribes, then runs the receive loop and monitor
   * loop concurrently via Promise.all().  Both loops exit when the socket is
   * closed by stop().
   */
  private async connectAndReceive(): Promise<void> {
    interface ZmqSubscriberLike {
      connect(endpoint: string): void;
      subscribe(topic: string): void | Promise<void>;
      close(): void;
      events: AsyncIterable<{ type: string }>;
      [Symbol.asyncIterator](): AsyncIterator<[Buffer]>;
    }

    interface ZmqModuleLike {
      Subscriber: new () => ZmqSubscriberLike;
    }

    let zmq: ZmqModuleLike;

    try {
      // Dynamic import so tests can mock the module without the native add-on.
      zmq = (await import("zeromq")) as unknown as ZmqModuleLike;
    } catch (err) {
      logger.error(`${this.messageType} ZMQ: failed to load zeromq module`, {
        type: this.messageType,
        error: err instanceof Error ? err.message : String(err),
      });
      this.isRunning = false;
      return;
    }

    if (!this.isRunning) {
      return;
    }

    const sock: ZmqSubscriberLike = new zmq.Subscriber();
    this.socket = sock;

    const endpoint = `tcp://${this.host}:${this.port}`;

    try {
      sock.connect(endpoint);
      await Promise.resolve(sock.subscribe(""));
    } catch (err) {
      logger.error(`${this.messageType} ZMQ connect/subscribe failed`, {
        type: this.messageType,
        endpoint,
        error: err instanceof Error ? err.message : String(err),
      });
      this.emit(
        "error",
        this.messageType,
        err instanceof Error ? err : new Error(String(err)),
      );
      this.closeSocket();
      this.isRunning = false;
      return;
    }

    logger.debug(`${this.messageType} ZMQ connected to PUB endpoint`, {
      type: this.messageType,
      endpoint,
    });

    // Run both loops concurrently. They both terminate when the socket closes.
    await Promise.all([this.runReceiveLoop(sock), this.runMonitorLoop(sock)]);
  }

  /**
   * Receive loop — iterates over incoming frames and emits `message` events.
   *
   * libzmq delivers one frame per await.  The }{→}\n{ split is applied
   * defensively in case a publisher concatenates multiple JSON objects into
   * one frame.
   */
  private async runReceiveLoop(sock: AsyncIterable<[Buffer]>): Promise<void> {
    /* eslint-disable-next-line @typescript-eslint/no-unused-expressions */
    try {
      for await (const [frame] of sock) {
        if (!this.isRunning) {
          break;
        }
        this.handleFrame(frame);
      }
    } catch (err) {
      // ETERM / ENOTSUP are thrown when the socket is closed — that is the
      // normal stop() path and should not be logged as an error.
      if (this.isRunning) {
        logger.error(`${this.messageType} ZMQ receive loop error`, {
          type: this.messageType,
          error: err instanceof Error ? err.message : String(err),
        });
        this.emit(
          "error",
          this.messageType,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  /**
   * Monitor loop — iterates over socket events to track TCP connection state.
   *
   * libzmq reconnects transparently, so there are no application-level
   * connect/disconnect events from the receive loop alone.  The monitor
   * socket surfaces the real TCP-layer events regardless of message rate,
   * so a quiet site is still reported as "Connected" correctly.
   */
  private async runMonitorLoop(sock: {
    events: AsyncIterable<{ type: string }>;
  }): Promise<void> {
    try {
      for await (const event of sock.events) {
        if (!this.isRunning) {
          break;
        }

        logger.trace(`${this.messageType} ZMQ socket event`, {
          type: this.messageType,
          event: event.type,
        });

        if (event.type === "connect") {
          this.isConnected = true;
          this.emit("connected", this.messageType);
        } else if (event.type === "disconnect") {
          this.isConnected = false;
          this.emit("disconnected", this.messageType);
        }
      }
    } catch {
      // Monitor loop exits when the socket is closed — normal stop() path.
    }
  }

  /**
   * Parse a single ZMQ frame buffer.
   *
   * Applies the }{→}\n{ split so concatenated objects in one frame are
   * each emitted as separate `message` events.
   */
  private handleFrame(frame: Buffer): void {
    let decoded = frame.toString("utf-8").trim();

    if (decoded.length === 0) {
      return;
    }

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
        logger.debug(`${this.messageType} ZMQ skipping invalid JSON frame`, {
          type: this.messageType,
          line: trimmed.substring(0, 100),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

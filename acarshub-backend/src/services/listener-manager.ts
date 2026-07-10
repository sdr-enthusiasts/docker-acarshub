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
// Owns the fan-in wiring for every TCP/UDP/ZMQ decoder listener: creation,
// connect/disconnect status tracking (any-of-N semantics), message routing,
// and lifecycle (start/stop). BackgroundServices (background-services.ts)
// composes one ListenerManager instance and reacts to its callbacks to drive
// status broadcasts and message-queue ingestion.
// ----------------------------------------------------------------------------

import type { ConnectionDescriptor } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  createDecoderListener,
  type IDecoderListener,
} from "./decoder-listener.js";
import type { MessageType } from "./tcp-listener.js";

const logger = createLogger("services:listener-manager");

export interface ConnectionStatus {
  ACARS: boolean;
  VDLM2: boolean;
  HFDL: boolean;
  IMSL: boolean;
  IRDM: boolean;
}

export interface ListenerManagerCallbacks {
  /** Invoked for every inbound decoder message, regardless of which
   * fan-in listener produced it. */
  onMessage: (type: MessageType, data: unknown) => void;
  /** Invoked after connectionStatus changes (connect or all-disconnected). */
  onStatusChange: () => void;
}

/**
 * Manages the set of decoder listeners (one or more per MessageType, per the
 * fan-in *_CONNECTIONS descriptors) and the derived per-type connection
 * status.
 */
export class ListenerManager {
  /**
   * All active decoder listeners keyed by "<TYPE>-<index>", e.g. "ACARS-0",
   * "ACARS-1".  Multiple listeners per type are created when the corresponding
   * *_CONNECTIONS variable contains more than one descriptor.
   */
  private decoderListeners: Map<string, IDecoderListener> = new Map();
  private connectionStatus: ConnectionStatus = {
    ACARS: false,
    VDLM2: false,
    HFDL: false,
    IMSL: false,
    IRDM: false,
  };

  constructor(private callbacks: ListenerManagerCallbacks) {}

  /**
   * Wire up one IDecoderListener per ConnectionDescriptor for `type`.
   *
   * All listeners for the same type share the same `message` handler and push
   * into the same MessageQueue.  Connection status for a type is `true` when
   * ANY of its listeners reports connected.
   */
  public setupDecoderConnections(
    type: MessageType,
    descriptors: ConnectionDescriptor[],
  ): void {
    if (descriptors.length === 0) {
      logger.error(
        `No connection descriptors for ${type}; decoder will not receive data`,
        { type },
      );
      return;
    }

    for (let i = 0; i < descriptors.length; i++) {
      const descriptor = descriptors[i];
      const key = `${type}-${i}`;

      const listener = createDecoderListener(type, descriptor);

      listener.on("connected", (listenerType: MessageType) => {
        this.connectionStatus[listenerType] = true;
        this.callbacks.onStatusChange();

        logger.info(`${listenerType} listener connected`, {
          ...listener.getStats(),
        });
      });

      listener.on("disconnected", (listenerType: MessageType) => {
        // Only flip to false when ALL listeners for this type are disconnected.
        const anyConnected = this.isAnyListenerConnected(listenerType);
        this.connectionStatus[listenerType] = anyConnected;
        this.callbacks.onStatusChange();

        logger.warn(`${listenerType} listener disconnected`, {
          ...listener.getStats(),
        });
      });

      listener.on("error", (listenerType: MessageType, error: Error) => {
        logger.error(`${listenerType} listener error`, {
          ...listener.getStats(),
          error: error.message,
        });
      });

      listener.on("message", (listenerType: MessageType, data: unknown) => {
        this.callbacks.onMessage(listenerType, data);
      });

      this.decoderListeners.set(key, listener);

      logger.debug(`Registered ${type} listener`, {
        key,
        listenType: descriptor.listenType,
        host: descriptor.host,
        port: descriptor.port,
      });
    }
  }

  /**
   * Returns true if at least one listener for the given MessageType is
   * currently connected.  Used to compute the per-type connection status when
   * one of several fan-in listeners disconnects.
   */
  private isAnyListenerConnected(type: MessageType): boolean {
    const prefix = `${type}-`;
    for (const [key, listener] of this.decoderListeners.entries()) {
      if (key.startsWith(prefix) && listener.connected) {
        return true;
      }
    }
    return false;
  }

  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  public startAll(): void {
    for (const listener of this.decoderListeners.values()) {
      listener.start();
    }
  }

  public stopAll(): void {
    for (const listener of this.decoderListeners.values()) {
      listener.stop();
    }
  }

  /**
   * Check health of all listeners and log any that are not connected.
   * TCP and UDP listeners reconnect automatically; this is informational only.
   */
  public checkThreadHealth(): void {
    for (const [key, listener] of this.decoderListeners.entries()) {
      if (!listener.connected) {
        logger.warn(`Listener not connected`, {
          key,
          ...listener.getStats(),
        });
      }
    }
  }
}

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

import type { EventEmitter } from "node:events";
import type { ConnectionDescriptor, ListenType } from "../config.js";
import type { MessageType } from "./tcp-listener.js";
import { TcpListener } from "./tcp-listener.js";
import { UdpListener } from "./udp-listener.js";
import { ZmqListener } from "./zmq-listener.js";

// ============================================================================
// Shared event / stats types
// ============================================================================

export interface DecoderListenerEvents {
  message: [type: MessageType, data: unknown];
  connected: [type: MessageType];
  disconnected: [type: MessageType];
  error: [type: MessageType, error: Error];
}

export interface DecoderListenerStats {
  type: MessageType;
  listenType: ListenType;
  /** Human-readable "host:port" or "bind:port" connection point */
  connectionPoint: string;
  connected: boolean;
}

// ============================================================================
// IDecoderListener — contract every listener implementation must satisfy
// ============================================================================

/**
 * Common interface for all decoder transport listeners (UDP, TCP, ZMQ).
 *
 * Every implementation extends `EventEmitter` and emits the four events
 * defined in `DecoderListenerEvents`.  The `start()` / `stop()` lifecycle
 * methods allow `BackgroundServices` to manage all listeners uniformly
 * regardless of the underlying transport.
 */
export interface IDecoderListener extends EventEmitter<DecoderListenerEvents> {
  /** Begin listening / connecting. Idempotent — calling twice is a no-op. */
  start(): void;
  /** Stop listening and clean up resources. Idempotent. */
  stop(): void;
  /** True when the socket is bound (UDP) or connected (TCP/ZMQ). */
  readonly connected: boolean;
  /** Return a snapshot of listener state for status reporting. */
  getStats(): DecoderListenerStats;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Construct the correct `IDecoderListener` implementation for the given
 * `ConnectionDescriptor`.
 *
 * Callers do NOT need to call `start()` — `BackgroundServices.start()` calls
 * it after all listeners are constructed so that the scheduler and queue are
 * already wired up before data begins flowing.
 */
export function createDecoderListener(
  type: MessageType,
  descriptor: ConnectionDescriptor,
): IDecoderListener {
  switch (descriptor.listenType) {
    case "udp":
      return new UdpListener(type, descriptor);
    case "tcp":
      return new TcpListener(type, descriptor);
    case "zmq":
      return new ZmqListener(type, descriptor);
  }
}

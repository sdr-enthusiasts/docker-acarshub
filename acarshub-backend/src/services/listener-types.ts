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

// ============================================================================
// Shared decoder-listener types
//
// These types live in their own module to break the import cycle that would
// otherwise exist between `decoder-listener.ts` (which defines the abstract
// contract + factory) and the concrete listener implementations
// (`tcp-listener.ts`, `udp-listener.ts`, `zmq-listener.ts`).  The factory
// must import the concrete classes to construct them; the concrete classes
// must implement the abstract contract.  Hoisting the shared types here
// makes the dependency graph one-way:
//
//     listener-types.ts
//       ^         ^
//       |         |
//   concrete    decoder-listener.ts ---> concrete listeners
//   listeners
//
// `madge --circular` is wired into `just ci` to keep it that way.
// ============================================================================

import type { EventEmitter } from "node:events";
import type { ListenType } from "../config.js";

/**
 * Type of ACARS-family message a listener produces.  Drives queue/scheduler
 * routing and status-page labelling.
 */
export type MessageType = "ACARS" | "VDLM2" | "HFDL" | "IMSL" | "IRDM";

/**
 * Event signatures emitted by every `IDecoderListener` implementation.
 */
export interface DecoderListenerEvents {
  message: [type: MessageType, data: unknown];
  connected: [type: MessageType];
  disconnected: [type: MessageType];
  error: [type: MessageType, error: Error];
}

/**
 * Snapshot of a listener's state for status reporting.
 */
export interface DecoderListenerStats {
  type: MessageType;
  listenType: ListenType;
  /** Human-readable "host:port" or "bind:port" connection point */
  connectionPoint: string;
  connected: boolean;
}

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

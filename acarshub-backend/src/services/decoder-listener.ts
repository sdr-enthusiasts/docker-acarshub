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

import type { ConnectionDescriptor } from "../config.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
  MessageType,
} from "./listener-types.js";
import { TcpListener } from "./tcp-listener.js";
import { UdpListener } from "./udp-listener.js";
import { ZmqListener } from "./zmq-listener.js";

// ============================================================================
// Re-exports
//
// Shared types live in `./listener-types.js` to avoid a circular dependency
// between this factory and the concrete listener implementations.  They are
// re-exported here so that existing callers can continue importing them
// from `./decoder-listener.js` unchanged.
// ============================================================================

export type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
  MessageType,
};

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

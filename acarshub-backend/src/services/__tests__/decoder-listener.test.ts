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
// decoder-listener.ts — covers the factory `createDecoderListener` and the
// `IDecoderListener` contract that every transport implementation must satisfy.
//
// The three concrete listeners (`UdpListener`, `TcpListener`, `ZmqListener`)
// have their own behavioural test suites in this same `__tests__/` folder.
// This file is intentionally narrow: it locks in the *seam* between
// `BackgroundServices` and the transport implementations, which is the only
// thing `decoder-listener.ts` itself ships.
// ----------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type { ConnectionDescriptor, ListenType } from "../../config.js";
import { createDecoderListener } from "../decoder-listener.js";
import type { MessageType } from "../tcp-listener.js";
import { TcpListener } from "../tcp-listener.js";
import { UdpListener } from "../udp-listener.js";
import { ZmqListener } from "../zmq-listener.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal descriptor with the given transport. */
function descriptor(listenType: ListenType): ConnectionDescriptor {
  return { listenType, host: "127.0.0.1", port: 5550 };
}

// ---------------------------------------------------------------------------
// Factory dispatch
// ---------------------------------------------------------------------------

describe("createDecoderListener", () => {
  it.each<[ListenType, new (...args: unknown[]) => unknown]>([
    ["udp", UdpListener],
    ["tcp", TcpListener],
    ["zmq", ZmqListener],
  ])("dispatches listenType=%s to %s", (listenType, ctor) => {
    const listener = createDecoderListener("ACARS", descriptor(listenType));
    expect(listener).toBeInstanceOf(ctor);
  });

  it("passes the message type through to the listener", () => {
    const listener = createDecoderListener("VDLM", descriptor("udp"));
    expect(listener.getStats().type).toBe<MessageType>("VDLM");
  });

  it("passes the listen type through to getStats()", () => {
    for (const transport of ["udp", "tcp", "zmq"] as const) {
      const listener = createDecoderListener("ACARS", descriptor(transport));
      expect(listener.getStats().listenType).toBe(transport);
    }
  });

  it("propagates host:port into the connectionPoint string", () => {
    const listener = createDecoderListener("HFDL", {
      listenType: "tcp",
      host: "decoder.example",
      port: 15555,
    });
    expect(listener.getStats().connectionPoint).toBe("decoder.example:15555");
  });

  it("does not start the listener (caller is responsible for start())", () => {
    // Regression: BackgroundServices.start() relies on factory output being
    // inert so that all listeners can be constructed before any data flows.
    // If the factory ever calls start() itself, this test fails.
    const listener = createDecoderListener("ACARS", descriptor("udp"));
    expect(listener.connected).toBe(false);
    expect(listener.getStats().connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IDecoderListener contract — every implementation must surface the same
// surface area so BackgroundServices can manage them uniformly.
// ---------------------------------------------------------------------------

describe("IDecoderListener contract", () => {
  it.each<ListenType>(["udp", "tcp", "zmq"])(
    "%s listener exposes start/stop/connected/getStats",
    (transport) => {
      const listener = createDecoderListener("ACARS", descriptor(transport));
      expect(typeof listener.start).toBe("function");
      expect(typeof listener.stop).toBe("function");
      expect(typeof listener.connected).toBe("boolean");
      expect(typeof listener.getStats).toBe("function");
    },
  );

  it.each<ListenType>(["udp", "tcp", "zmq"])(
    "%s listener is an EventEmitter (on/off/emit)",
    (transport) => {
      const listener = createDecoderListener("ACARS", descriptor(transport));
      expect(typeof listener.on).toBe("function");
      expect(typeof listener.off).toBe("function");
      expect(typeof listener.emit).toBe("function");
    },
  );

  it.each<ListenType>(["udp", "tcp", "zmq"])(
    "%s listener.getStats() returns the documented shape",
    (transport) => {
      const listener = createDecoderListener("ACARS", descriptor(transport));
      const stats = listener.getStats();
      expect(stats).toMatchObject({
        type: "ACARS",
        listenType: transport,
        connectionPoint: expect.any(String),
        connected: false,
      });
    },
  );
});

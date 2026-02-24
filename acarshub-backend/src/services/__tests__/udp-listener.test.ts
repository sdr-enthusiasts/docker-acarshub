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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConnectionDescriptor } from "../../config.js";
import { UdpListener } from "../udp-listener.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Allocate an ephemeral UDP port by binding then immediately closing. */
async function getFreeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    sock.bind(0, "127.0.0.1", () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
    sock.on("error", reject);
  });
}

/** Wait for a named event on an EventEmitter, with a timeout. */
function waitForEvent<T>(
  emitter: {
    once(event: string, listener: (...args: unknown[]) => void): void;
  },
  event: string,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event '${event}'`)),
      timeoutMs,
    );
    emitter.once(event, (...args: unknown[]) => {
      clearTimeout(timer);
      resolve(args as T);
    });
  });
}

/** Send a UDP datagram to host:port and wait for it to be delivered. */
function sendDatagram(
  payload: string,
  port: number,
  host = "127.0.0.1",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sender = dgram.createSocket("udp4");
    const buf = Buffer.from(payload, "utf-8");
    sender.send(buf, port, host, (err) => {
      sender.close();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UdpListener", () => {
  let listener: UdpListener | null = null;
  let port: number;

  beforeEach(async () => {
    port = await getFreeUdpPort();
  });

  afterEach(() => {
    if (listener) {
      listener.stop();
      listener = null;
    }
  });

  // -------------------------------------------------------------------------
  // Bind / connected state
  // -------------------------------------------------------------------------

  describe("Bind and connection state", () => {
    it("binds on the configured address and port", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      expect(listener.connected).toBe(true);
    });

    it("emits 'connected' when bind succeeds", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const l = listener;
      const [type] = await new Promise<[string]>((resolve) => {
        l.once("connected", (...args) => resolve(args as [string]));
        l.start();
      });

      expect(type).toBe("ACARS");
    });

    it("reports connected: false before start() is called", () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);
      expect(listener.connected).toBe(false);
    });

    it("reports connected: false after stop() is called", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      listener.stop();
      expect(listener.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Message parsing
  // -------------------------------------------------------------------------

  describe("Message parsing", () => {
    it("parses a single-object datagram and emits 'message'", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("VDLM2", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      const messagePromise = waitForEvent<[string, unknown]>(
        listener,
        "message",
      );

      const payload = JSON.stringify({ timestamp: 1234567890, text: "hello" });
      await sendDatagram(payload, port);

      const [type, data] = await messagePromise;
      expect(type).toBe("VDLM2");
      expect(data).toEqual({ timestamp: 1234567890, text: "hello" });
    });

    it("handles }{ concatenated objects in a single datagram and emits two messages", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      const messages: unknown[] = [];
      const l = listener;
      const allReceived = new Promise<void>((resolve) => {
        l.on("message", (_type, data) => {
          messages.push(data);
          if (messages.length === 2) {
            resolve();
          }
        });
      });

      // Two JSON objects back-to-back with no separator
      const payload = JSON.stringify({ id: 1 }) + JSON.stringify({ id: 2 });
      await sendDatagram(payload, port);

      await allReceived;

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ id: 1 });
      expect(messages[1]).toEqual({ id: 2 });
    });

    it("ignores empty datagrams silently", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      let messageCount = 0;
      listener.on("message", () => {
        messageCount++;
      });

      await sendDatagram("", port);
      // Give a short window for any spurious message event
      await new Promise((r) => setTimeout(r, 100));

      expect(messageCount).toBe(0);
    });

    it("skips invalid JSON lines without crashing, continues parsing valid lines", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      const messagePromise = waitForEvent<[string, unknown]>(
        listener,
        "message",
      );

      // Send invalid JSON followed by valid JSON in two separate datagrams
      await sendDatagram("NOT JSON AT ALL", port);
      await sendDatagram(JSON.stringify({ valid: true }), port);

      const [, data] = await messagePromise;
      expect(data).toEqual({ valid: true });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling and retry
  // -------------------------------------------------------------------------

  describe("Error handling and retry", () => {
    it("emits 'error' and retries bind when port is already in use", async () => {
      // Occupy the port first
      const occupier = dgram.createSocket("udp4");
      await new Promise<void>((resolve, reject) => {
        occupier.bind(port, "127.0.0.1", () => resolve());
        occupier.on("error", reject);
      });

      try {
        const descriptor: ConnectionDescriptor = {
          listenType: "udp",
          host: "127.0.0.1",
          port,
          // Fast retry for the test
        };
        // Use a very short reconnect delay for the test
        listener = new UdpListener("ACARS", descriptor, 100);

        const errorPromise = waitForEvent<[string, Error]>(listener, "error");

        listener.start();
        const [type, error] = await errorPromise;

        expect(type).toBe("ACARS");
        expect(error).toBeInstanceOf(Error);
        // After the error the listener should schedule a retry (still running)
        expect(listener.connected).toBe(false);
      } finally {
        occupier.close();
      }
    });

    it("does not start twice when start() is called a second time", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      // Second call should be a no-op — no error, still connected
      listener.start();
      expect(listener.connected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("Lifecycle", () => {
    it("stop() closes the socket cleanly without throwing", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      expect(() => listener.stop()).not.toThrow();
      expect(listener.connected).toBe(false);
    });

    it("stop() before start() is a no-op", () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("ACARS", descriptor);
      expect(() => listener.stop()).not.toThrow();
    });

    it("getStats() returns correct metadata", async () => {
      const descriptor: ConnectionDescriptor = {
        listenType: "udp",
        host: "127.0.0.1",
        port,
      };
      listener = new UdpListener("HFDL", descriptor);

      const connectedPromise = waitForEvent(listener, "connected");
      listener.start();
      await connectedPromise;

      const stats = listener.getStats();
      expect(stats.type).toBe("HFDL");
      expect(stats.listenType).toBe("udp");
      expect(stats.connectionPoint).toBe(`127.0.0.1:${port}`);
      expect(stats.connected).toBe(true);
    });
  });
});

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

import {
  createServer,
  type Server as NetServer,
  type Socket as NetSocket,
} from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TcpListener } from "../tcp-listener.js";

describe("TcpListener", () => {
  let testServer: NetServer | null = null;
  let testPort: number;

  beforeEach(() => {
    // Find available port
    testPort = 15550 + Math.floor(Math.random() * 1000);
  });

  afterEach(async () => {
    if (testServer) {
      await closeTestServer(testServer);
      testServer = null;
    }
  });

  /**
   * Close a test server and destroy all connected client sockets.
   *
   * `server.close()` only stops accepting new connections — existing sockets
   * remain open until the client disconnects. The TcpListener therefore never
   * sees a disconnect event when we call close() alone. Destroying all tracked
   * client sockets forces the OS-level close so the TcpListener receives the
   * expected 'close' / 'end' event immediately.
   */
  function closeTestServer(server: NetServer): Promise<void> {
    return new Promise<void>((resolve) => {
      // Destroy every live client socket first so the server can actually close
      const sockets: Set<NetSocket> =
        (server as NetServer & { __clientSockets?: Set<NetSocket> })
          .__clientSockets ?? new Set();
      for (const s of sockets) {
        s.destroy();
      }
      server.close(() => resolve());
    });
  }

  /**
   * Wait for a named event on an EventEmitter, with an optional timeout.
   * Rejects if the timeout expires before the event fires.
   */
  function waitForEvent<T>(
    emitter: {
      once(event: string, listener: (...args: unknown[]) => void): void;
    },
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timed out waiting for event "${event}" after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      emitter.once(event, (...args: unknown[]) => {
        clearTimeout(timer);
        resolve(args[0] as T);
      });
    });
  }

  /**
   * Create a test TCP server that sends JSON messages.
   * Tracks all connected client sockets so closeTestServer() can force-close them.
   */
  function createTestServer(port: number): Promise<NetServer> {
    return new Promise((resolve, reject) => {
      const clientSockets = new Set<NetSocket>();

      const server = createServer((socket) => {
        clientSockets.add(socket);
        socket.once("close", () => clientSockets.delete(socket));
        // Store socket for sending test data
        server.emit("client-connected", socket);
      });

      // Attach the socket set so closeTestServer() can reach it
      (
        server as NetServer & { __clientSockets: Set<NetSocket> }
      ).__clientSockets = clientSockets;

      server.on("error", reject);

      server.listen(port, "127.0.0.1", () => {
        resolve(server);
      });
    });
  }

  describe("Connection Management", () => {
    it("should connect to TCP server and emit connected event", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
        reconnectDelay: 100,
      });

      const connectedPromise = new Promise<string>((resolve) => {
        listener.on("connected", (type) => resolve(type));
      });

      listener.start();

      const type = await connectedPromise;
      expect(type).toBe("ACARS");
      expect(listener.connected).toBe(true);

      listener.stop();
    });

    it("should handle connection failure gracefully", async () => {
      const listener = new TcpListener({
        type: "VDLM2",
        host: "127.0.0.1",
        port: testPort, // No server running
        reconnectDelay: 100,
      });

      const errorPromise = new Promise<Error>((resolve) => {
        listener.on("error", (_type, error) => resolve(error));
      });

      listener.start();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(listener.connected).toBe(false);

      listener.stop();
    });

    it("should auto-reconnect after disconnection", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "HFDL",
        host: "127.0.0.1",
        port: testPort,
        reconnectDelay: 100,
      });

      let connectCount = 0;
      listener.on("connected", () => {
        connectCount++;
      });

      listener.start();
      await waitForEvent(listener, "connected");

      // Force-close the server (destroys client sockets so the TcpListener
      // immediately receives a TCP close/end event and emits 'disconnected').
      const disconnectPromise = waitForEvent(listener, "disconnected");
      await closeTestServer(testServer);
      testServer = null;
      await disconnectPromise;

      expect(listener.connected).toBe(false);

      // Restart server on the same port for reconnection
      testServer = await createTestServer(testPort);

      // Wait for reconnect — listener retries every 100 ms
      await waitForEvent(listener, "connected", 5000);
      expect(connectCount).toBeGreaterThan(1);

      listener.stop();
    }, 15000);

    it("should not start twice", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      listener.start();
      listener.start(); // Should be ignored

      await new Promise((resolve) => setTimeout(resolve, 100));

      listener.stop();
    });

    it("should stop gracefully", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      listener.start();
      await new Promise<void>((resolve) => {
        listener.once("connected", () => resolve());
      });

      listener.stop();
      expect(listener.connected).toBe(false);
    });
  });

  describe("Message Parsing", () => {
    it("should parse single JSON line message", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      const messagePromise = new Promise<unknown>((resolve) => {
        listener.on("message", (_type, data) => resolve(data));
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          // Send test message
          socket.write('{"timestamp": 1234567890, "text": "TEST"}\n');
          resolve();
        });
      });

      const message = await messagePromise;
      expect(message).toEqual({ timestamp: 1234567890, text: "TEST" });

      listener.stop();
    });

    it("should handle back-to-back JSON objects", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "VDLM2",
        host: "127.0.0.1",
        port: testPort,
      });

      const messages: unknown[] = [];
      listener.on("message", (_type, data) => {
        messages.push(data);
      });

      listener.start();

      // Wait for connection and send back-to-back messages
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          // Send back-to-back JSON (no newline between)
          socket.write('{"id": 1}{"id": 2}\n');
          setTimeout(resolve, 100);
        });
      });

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ id: 1 });
      expect(messages[1]).toEqual({ id: 2 });

      listener.stop();
    });

    it("should handle partial messages across multiple reads", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "HFDL",
        host: "127.0.0.1",
        port: testPort,
      });

      const messagePromise = new Promise<unknown>((resolve) => {
        listener.on("message", (_type, data) => resolve(data));
      });

      listener.start();

      // Wait for connection and send partial message
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          // Send partial message
          socket.write('{"timestamp": 12345');
          setTimeout(() => {
            // Send rest of message
            socket.write('67890, "complete": true}\n');
            resolve();
          }, 50);
        });
      });

      const message = await messagePromise;
      expect(message).toEqual({ timestamp: 1234567890, complete: true });

      listener.stop();
    });

    it("should skip invalid JSON messages", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      const validMessages: unknown[] = [];
      listener.on("message", (_type, data) => {
        validMessages.push(data);
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          // Send invalid JSON followed by valid JSON
          socket.write("invalid json\n");
          socket.write('{"valid": true}\n');
          setTimeout(resolve, 100);
        });
      });

      // Only valid message should be parsed
      expect(validMessages).toHaveLength(1);
      expect(validMessages[0]).toEqual({ valid: true });

      listener.stop();
    });

    it("should handle empty lines", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "VDLM2",
        host: "127.0.0.1",
        port: testPort,
      });

      const messages: unknown[] = [];
      listener.on("message", (_type, data) => {
        messages.push(data);
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          socket.write('{"test": 1}\n\n\n{"test": 2}\n');
          setTimeout(resolve, 100);
        });
      });

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ test: 1 });
      expect(messages[1]).toEqual({ test: 2 });

      listener.stop();
    });
  });

  describe("Statistics", () => {
    it("should return connection statistics", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      listener.start();
      await new Promise<void>((resolve) => {
        listener.once("connected", () => resolve());
      });

      const stats = listener.getStats();
      expect(stats).toEqual({
        type: "ACARS",
        connected: true,
        host: "127.0.0.1",
        port: testPort,
      });

      listener.stop();
    });
  });

  describe("Event Emission", () => {
    it("should emit all message type events correctly", async () => {
      testServer = await createTestServer(testPort);

      const messageTypes: Array<"ACARS" | "VDLM2" | "HFDL" | "IMSL" | "IRDM"> =
        ["ACARS", "VDLM2", "HFDL", "IMSL", "IRDM"];

      for (const type of messageTypes) {
        const listener = new TcpListener({
          type,
          host: "127.0.0.1",
          port: testPort,
        });

        const messagePromise = new Promise<string>((resolve) => {
          listener.on("message", (msgType) => resolve(msgType));
        });

        listener.start();

        // Wait for connection
        await new Promise<void>((resolve) => {
          testServer?.once("client-connected", (socket) => {
            socket.write('{"test": true}\n');
            resolve();
          });
        });

        const receivedType = await messagePromise;
        expect(receivedType).toBe(type);

        listener.stop();

        // Close and recreate server for next iteration
        await new Promise<void>((resolve) => {
          testServer?.close(() => resolve());
        });
        testServer = await createTestServer(testPort);
      }
    });

    it("should emit disconnected event on connection loss", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      listener.start();
      await waitForEvent(listener, "connected");

      // Force-close the server so existing client sockets are destroyed and
      // the TcpListener receives the TCP close event immediately.
      const disconnectPromise = waitForEvent<string>(listener, "disconnected");
      await closeTestServer(testServer);
      testServer = null;

      const type = await disconnectPromise;
      expect(type).toBe("ACARS");

      listener.stop();
    }, 10000);
  });

  describe("Edge Cases", () => {
    it("should handle empty data gracefully", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
      });

      const disconnectedPromise = new Promise<void>((resolve) => {
        listener.on("disconnected", () => resolve());
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        testServer?.once("client-connected", (socket) => {
          // Send empty data (triggers disconnect in Python implementation)
          socket.write("");
          socket.end();
          resolve();
        });
      });

      await disconnectedPromise;
      expect(listener.connected).toBe(false);

      listener.stop();
    });

    it("should handle socket timeout gracefully", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "VDLM2",
        host: "127.0.0.1",
        port: testPort,
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        listener.once("connected", () => resolve());
      });

      // Wait for potential timeout (should not disconnect)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(listener.connected).toBe(true);

      listener.stop();
    });

    it("should not reconnect after stop is called", async () => {
      testServer = await createTestServer(testPort);

      const listener = new TcpListener({
        type: "ACARS",
        host: "127.0.0.1",
        port: testPort,
        reconnectDelay: 100,
      });

      let connectCount = 0;
      listener.on("connected", () => {
        connectCount++;
      });

      listener.start();

      // Wait for connection
      await new Promise<void>((resolve) => {
        listener.once("connected", () => resolve());
      });

      // Stop before disconnect
      listener.stop();

      // Close server
      await new Promise<void>((resolve) => {
        testServer?.close(() => resolve());
      });

      // Wait for potential reconnect attempt
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only have connected once
      expect(connectCount).toBe(1);
    });
  });
});

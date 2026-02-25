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

/**
 * ZmqListener unit tests
 *
 * The zeromq native add-on requires a compiled binary that may not be present
 * in all CI environments.  Rather than requiring the add-on, we mock the
 * "zeromq" module so that:
 *   1. Tests run anywhere (no native dependency at test time).
 *   2. We can control exactly what the Subscriber socket yields, including
 *      connect/disconnect events and message frames.
 *
 * The mock is injected via vi.mock() which is hoisted before any imports by
 * Vitest's transform pipeline, so ZmqListener's dynamic `import("zeromq")`
 * call resolves to our fake instead of the real add-on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionDescriptor } from "../../config.js";
import { ZmqListener } from "../zmq-listener.js";

// ---------------------------------------------------------------------------
// Mock zeromq module
// ---------------------------------------------------------------------------

/**
 * A controllable async iterable that can have values pushed into it or be
 * closed externally — used to simulate the ZMQ receive loop and event loop.
 */
class ControllableAsyncIterable<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({ value, done: false });
    } else {
      this.queue.push(value);
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters) {
      waiter({ value: undefined as unknown as T, done: true });
    }
    this.waiters = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          const item = this.queue.shift() as T;
          return Promise.resolve({ value: item, done: false });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

/** Return the current mock subscriber state, throwing if it is null. */
function getState(): MockSubscriberState {
  if (mockSubscriberState === null) {
    throw new Error(
      "mockSubscriberState is null — Subscriber constructor has not run yet",
    );
  }
  return mockSubscriberState;
}

/** State held by a single mock Subscriber instance. */
interface MockSubscriberState {
  connected: boolean;
  subscribed: boolean;
  closedCalled: boolean;
  endpoint: string;
  frames: ControllableAsyncIterable<[Buffer]>;
  events: ControllableAsyncIterable<{ type: string }>;
}

let mockSubscriberState: MockSubscriberState | null = null;

// Mock the zeromq module before any imports resolve it.
vi.mock("zeromq", () => {
  class MockSubscriber {
    private state: MockSubscriberState;

    constructor() {
      this.state = {
        connected: false,
        subscribed: false,
        closedCalled: false,
        endpoint: "",
        frames: new ControllableAsyncIterable<[Buffer]>(),
        events: new ControllableAsyncIterable<{ type: string }>(),
      };
      mockSubscriberState = this.state;
    }

    connect(endpoint: string): void {
      this.state.endpoint = endpoint;
      this.state.connected = true;
    }

    async subscribe(_topic: string): Promise<void> {
      this.state.subscribed = true;
    }

    close(): void {
      this.state.closedCalled = true;
      this.state.frames.close();
      this.state.events.close();
    }

    get events(): AsyncIterable<{ type: string }> {
      return this.state.events;
    }

    [Symbol.asyncIterator](): AsyncIterator<[Buffer]> {
      return this.state.frames[Symbol.asyncIterator]();
    }
  }

  return { Subscriber: MockSubscriber };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDescriptor(port = 45555): ConnectionDescriptor {
  return { listenType: "zmq", host: "localhost", port };
}

/** Wait for a named event on a ZmqListener, with a timeout. */
function waitForEvent<T extends unknown[]>(
  emitter: ZmqListener,
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

/** Let the event loop drain so async loops inside ZmqListener can progress. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Poll until mockSubscriberState is non-null (i.e. the Subscriber constructor
 * has run inside connectAndReceive()).  A single setImmediate is not always
 * enough because the dynamic `import("zeromq")` inside connectAndReceive()
 * schedules its own Promise resolution ticks before the constructor fires.
 */
async function waitForSubscriberState(timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (mockSubscriberState === null) {
    if (Date.now() >= deadline) {
      throw new Error("Timeout: ZMQ Subscriber was never constructed");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ZmqListener", () => {
  let listener: ZmqListener | null = null;

  beforeEach(() => {
    mockSubscriberState = null;
  });

  afterEach(() => {
    if (listener) {
      listener.stop();
      listener = null;
    }
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe("Initial state", () => {
    it("reports connected: false before start() is called", () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      expect(listener.connected).toBe(false);
    });

    it("getStats() returns correct metadata before start()", () => {
      listener = new ZmqListener("VDLM2", makeDescriptor(45555));
      const stats = listener.getStats();
      expect(stats.type).toBe("VDLM2");
      expect(stats.listenType).toBe("zmq");
      expect(stats.connectionPoint).toBe("localhost:45555");
      expect(stats.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Start / connect
  // -------------------------------------------------------------------------

  describe("start() and connect", () => {
    it("connects to the correct ZMQ endpoint", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor(35550));
      listener.start();
      await waitForSubscriberState();

      expect(mockSubscriberState).not.toBeNull();
      expect(getState().endpoint).toBe("tcp://localhost:35550");
    });

    it("subscribes to all topics (empty string)", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      expect(getState().subscribed).toBe(true);
    });

    it("emits 'connected' when the monitor loop sees a connect event", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());

      const connectedPromise = waitForEvent<[string]>(listener, "connected");
      listener.start();
      await waitForSubscriberState();

      // Simulate libzmq's TCP connect event via the monitor socket
      getState().events.push({ type: "connect" });
      await flushMicrotasks();

      const [type] = await connectedPromise;
      expect(type).toBe("ACARS");
      expect(listener.connected).toBe(true);
    });

    it("emits 'disconnected' when the monitor loop sees a disconnect event", async () => {
      listener = new ZmqListener("HFDL", makeDescriptor());

      listener.start();
      await waitForSubscriberState();

      // First connect so we have a connected state to transition away from
      getState().events.push({ type: "connect" });
      await flushMicrotasks();

      const disconnectedPromise = waitForEvent<[string]>(
        listener,
        "disconnected",
      );
      getState().events.push({ type: "disconnect" });
      await flushMicrotasks();

      const [type] = await disconnectedPromise;
      expect(type).toBe("HFDL");
      expect(listener.connected).toBe(false);
    });

    it("does not start twice when start() is called a second time", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      const stateBefore = getState();
      listener.start(); // second call — should be a no-op
      await flushMicrotasks();

      // Mock state should not have been replaced by a new Subscriber
      expect(mockSubscriberState).toBe(stateBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Message parsing
  // -------------------------------------------------------------------------

  describe("Message parsing", () => {
    it("parses a valid JSON frame and emits 'message'", async () => {
      listener = new ZmqListener("VDLM2", makeDescriptor());

      const messagePromise = waitForEvent<[string, unknown]>(
        listener,
        "message",
      );
      listener.start();
      await waitForSubscriberState();

      const frame = Buffer.from(
        JSON.stringify({ timestamp: 1000, text: "test" }),
      );
      getState().frames.push([frame]);
      await flushMicrotasks();

      const [type, data] = await messagePromise;
      expect(type).toBe("VDLM2");
      expect(data).toEqual({ timestamp: 1000, text: "test" });
    });

    it("handles }{ concatenated content in a frame and emits two messages", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());

      const messages: unknown[] = [];
      const l = listener;
      const allReceived = new Promise<void>((resolve) => {
        l.on("message", (_type, data) => {
          messages.push(data);
          if (messages.length === 2) resolve();
        });
      });

      listener.start();
      await waitForSubscriberState();

      const combined = JSON.stringify({ id: 1 }) + JSON.stringify({ id: 2 });
      getState().frames.push([Buffer.from(combined)]);
      await flushMicrotasks();

      await allReceived;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ id: 1 });
      expect(messages[1]).toEqual({ id: 2 });
    });

    it("skips an invalid JSON frame without crashing", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());

      const messagePromise = waitForEvent<[string, unknown]>(
        listener,
        "message",
      );

      listener.start();
      await waitForSubscriberState();

      // First: bad frame — should be silently dropped
      getState().frames.push([Buffer.from("NOT VALID JSON")]);
      await flushMicrotasks();

      // Second: valid frame — should still arrive
      getState().frames.push([Buffer.from(JSON.stringify({ valid: true }))]);
      await flushMicrotasks();

      const [, data] = await messagePromise;
      expect(data).toEqual({ valid: true });
    });

    it("ignores empty frames silently", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());

      let messageCount = 0;
      listener.on("message", () => {
        messageCount++;
      });

      listener.start();
      await waitForSubscriberState();

      getState().frames.push([Buffer.from("")]);
      await flushMicrotasks();
      await new Promise((r) => setTimeout(r, 50));

      expect(messageCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle — stop()
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("closes the socket without throwing", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      expect(() => listener.stop()).not.toThrow();
    });

    it("sets connected to false after stop()", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      // Simulate connected state
      getState().events.push({ type: "connect" });
      await flushMicrotasks();

      listener.stop();
      expect(listener.connected).toBe(false);
    });

    it("emits 'disconnected' on stop() when previously connected", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      getState().events.push({ type: "connect" });
      await flushMicrotasks();

      const disconnectedPromise = waitForEvent<[string]>(
        listener,
        "disconnected",
      );
      listener.stop();
      await flushMicrotasks();

      const [type] = await disconnectedPromise;
      expect(type).toBe("ACARS");
    });

    it("stop() before start() is a no-op", () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      expect(() => listener.stop()).not.toThrow();
    });

    it("calls close() on the underlying Subscriber socket", async () => {
      listener = new ZmqListener("ACARS", makeDescriptor());
      listener.start();
      await waitForSubscriberState();

      listener.stop();

      expect(getState().closedCalled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Regression
  // -------------------------------------------------------------------------

  describe("Regression", () => {
    it("regression: messages from ZMQ listener are not double-counted", async () => {
      // Two listeners for the same type must each emit their own message events
      // independently — the caller (BackgroundServices) is responsible for routing
      // them to one queue. This test verifies ZmqListener itself emits exactly once
      // per frame received.
      listener = new ZmqListener("ACARS", makeDescriptor());

      let emitCount = 0;
      listener.on("message", () => {
        emitCount++;
      });

      listener.start();
      await waitForSubscriberState();

      getState().frames.push([Buffer.from(JSON.stringify({ id: 99 }))]);
      await flushMicrotasks();
      await new Promise((r) => setTimeout(r, 50));

      expect(emitCount).toBe(1);
    });
  });
});

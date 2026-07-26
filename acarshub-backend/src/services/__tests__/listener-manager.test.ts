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
 * Direct unit tests for ListenerManager (extracted from services/index.ts in
 * GOD-04). Complements the higher-level fan-in behaviour already pinned via
 * BackgroundServices in background-services.test.ts by testing the class in
 * isolation — no scheduler, database, or Socket.IO mocking required.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionDescriptor } from "../../config.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
} from "../decoder-listener.js";
import type { MessageType } from "../tcp-listener.js";

class FakeListener
  extends EventEmitter<DecoderListenerEvents>
  implements IDecoderListener
{
  public readonly type: MessageType;
  public readonly descriptor: ConnectionDescriptor;
  private _connected = false;
  public startCalled = false;
  public stopCalled = false;

  constructor(type: MessageType, descriptor: ConnectionDescriptor) {
    super();
    this.type = type;
    this.descriptor = descriptor;
  }

  start(): void {
    this.startCalled = true;
  }

  stop(): void {
    this.stopCalled = true;
  }

  get connected(): boolean {
    return this._connected;
  }

  getStats(): DecoderListenerStats {
    return {
      type: this.type,
      listenType: this.descriptor.listenType,
      connectionPoint: `${this.descriptor.host}:${this.descriptor.port}`,
      connected: this._connected,
    };
  }

  simulateConnect(): void {
    this._connected = true;
    this.emit("connected", this.type);
  }

  simulateDisconnect(): void {
    this._connected = false;
    this.emit("disconnected", this.type);
  }

  simulateError(error: Error): void {
    this.emit("error", this.type, error);
  }

  simulateMessage(data: unknown): void {
    this.emit("message", this.type, data);
  }
}

const createdListeners: FakeListener[] = [];

vi.mock("../decoder-listener.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../decoder-listener.js")>();
  return {
    ...original,
    createDecoderListener: (
      type: MessageType,
      descriptor: ConnectionDescriptor,
    ): IDecoderListener => {
      const fake = new FakeListener(type, descriptor);
      createdListeners.push(fake);
      return fake;
    },
  };
});

function makeDescriptor(
  port: number,
  listenType: ConnectionDescriptor["listenType"] = "udp",
): ConnectionDescriptor {
  return { listenType, host: "127.0.0.1", port };
}

describe("ListenerManager", () => {
  beforeEach(() => {
    createdListeners.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs an error and creates no listeners when given an empty descriptor list", async () => {
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
    });

    manager.setupDecoderConnections("ACARS", []);

    expect(createdListeners).toHaveLength(0);
    expect(manager.getConnectionStatus().ACARS).toBe(false);
  });

  it("connection status starts false for every decoder type", async () => {
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
    });

    expect(manager.getConnectionStatus()).toEqual({
      ACARS: false,
      VDLM2: false,
      HFDL: false,
      IMSL: false,
      IRDM: false,
    });
  });

  it("invokes onStatusChange and flips status true when a listener connects", async () => {
    const onStatusChange = vi.fn();
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange,
    });

    manager.setupDecoderConnections("ACARS", [makeDescriptor(5550)]);
    createdListeners[0].simulateConnect();

    expect(manager.getConnectionStatus().ACARS).toBe(true);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it("status stays true when one of two listeners disconnects but the other is still connected", async () => {
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
    });

    manager.setupDecoderConnections("ACARS", [
      makeDescriptor(5550, "udp"),
      makeDescriptor(15550, "tcp"),
    ]);

    createdListeners[0].simulateConnect();
    createdListeners[1].simulateConnect();
    createdListeners[0].simulateDisconnect();

    expect(manager.getConnectionStatus().ACARS).toBe(true);
  });

  it("status flips to false only once ALL listeners for the type disconnect", async () => {
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
    });

    manager.setupDecoderConnections("ACARS", [
      makeDescriptor(5550, "udp"),
      makeDescriptor(15550, "tcp"),
    ]);

    createdListeners[0].simulateConnect();
    createdListeners[1].simulateConnect();
    createdListeners[0].simulateDisconnect();
    createdListeners[1].simulateDisconnect();

    expect(manager.getConnectionStatus().ACARS).toBe(false);
  });

  it("routes every listener's message event through onMessage", async () => {
    const onMessage = vi.fn();
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({ onMessage, onStatusChange: vi.fn() });

    manager.setupDecoderConnections("ACARS", [
      makeDescriptor(5550, "udp"),
      makeDescriptor(15550, "tcp"),
    ]);

    createdListeners[0].simulateMessage({ id: 1 });
    createdListeners[1].simulateMessage({ id: 2 });

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, "ACARS", { id: 1 });
    expect(onMessage).toHaveBeenNthCalledWith(2, "ACARS", { id: 2 });
  });

  it("does not throw and does not change status when a listener reports an error", async () => {
    const onStatusChange = vi.fn();
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange,
    });

    manager.setupDecoderConnections("ACARS", [makeDescriptor(5550)]);

    expect(() =>
      createdListeners[0].simulateError(new Error("boom")),
    ).not.toThrow();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  describe("startAll / stopAll", () => {
    it("calls start() on every registered listener", async () => {
      const { ListenerManager } = await import("../listener-manager.js");
      const manager = new ListenerManager({
        onMessage: vi.fn(),
        onStatusChange: vi.fn(),
      });

      manager.setupDecoderConnections("ACARS", [
        makeDescriptor(5550),
        makeDescriptor(15550, "tcp"),
      ]);
      manager.startAll();

      for (const listener of createdListeners) {
        expect(listener.startCalled).toBe(true);
      }
    });

    it("calls stop() on every registered listener", async () => {
      const { ListenerManager } = await import("../listener-manager.js");
      const manager = new ListenerManager({
        onMessage: vi.fn(),
        onStatusChange: vi.fn(),
      });

      manager.setupDecoderConnections("ACARS", [
        makeDescriptor(5550),
        makeDescriptor(15550, "tcp"),
      ]);
      manager.stopAll();

      for (const listener of createdListeners) {
        expect(listener.stopCalled).toBe(true);
      }
    });
  });

  describe("checkThreadHealth", () => {
    it("does not throw when all listeners are connected", async () => {
      const { ListenerManager } = await import("../listener-manager.js");
      const manager = new ListenerManager({
        onMessage: vi.fn(),
        onStatusChange: vi.fn(),
      });

      manager.setupDecoderConnections("ACARS", [makeDescriptor(5550)]);
      createdListeners[0].simulateConnect();

      expect(() => manager.checkThreadHealth()).not.toThrow();
    });

    it("does not throw when a listener is disconnected (logs a warning internally)", async () => {
      const { ListenerManager } = await import("../listener-manager.js");
      const manager = new ListenerManager({
        onMessage: vi.fn(),
        onStatusChange: vi.fn(),
      });

      manager.setupDecoderConnections("ACARS", [makeDescriptor(5550)]);

      expect(() => manager.checkThreadHealth()).not.toThrow();
    });
  });

  it("supports independent connection tracking across multiple decoder types", async () => {
    const { ListenerManager } = await import("../listener-manager.js");
    const manager = new ListenerManager({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
    });

    manager.setupDecoderConnections("ACARS", [makeDescriptor(5550)]);
    manager.setupDecoderConnections("VDLM2", [makeDescriptor(5555)]);

    const acarsListener = createdListeners.find((l) => l.type === "ACARS");
    acarsListener?.simulateConnect();

    const status = manager.getConnectionStatus();
    expect(status.ACARS).toBe(true);
    expect(status.VDLM2).toBe(false);
  });
});

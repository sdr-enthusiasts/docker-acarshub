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
 * BackgroundServices fan-in integration tests
 *
 * These tests verify that BackgroundServices — composing a ListenerManager
 * instance (services/listener-manager.ts, GOD-04) — correctly:
 * - Creates one listener per ConnectionDescriptor when multiple are configured.
 * - Reports connected: true when ANY listener for a type is connected.
 * - Reports connected: false only when ALL listeners for a type are disconnected.
 * - Routes messages from both listeners to the same MessageQueue.
 *
 * We do NOT exercise the full BackgroundServices lifecycle (database, socket.io,
 * scheduler) here — those are covered by their own test files.  Instead we
 * directly test the wiring logic by inspecting the public getConnectionStatus()
 * and by interacting with the MessageQueue. ListenerManager's own unit tests
 * live in listener-manager.test.ts; this file is the integration seam that
 * exercises it through BackgroundServices' public surface.
 *
 * The decoder-listener factory and all three listener classes are mocked so
 * that the tests are deterministic and fast without network sockets.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionDescriptor, DecoderConnections } from "../../config.js";
import type {
  DecoderListenerEvents,
  DecoderListenerStats,
  IDecoderListener,
} from "../decoder-listener.js";
import type { ListenerType } from "../listener-types.js";

// ---------------------------------------------------------------------------
// Minimal mock IDecoderListener
// ---------------------------------------------------------------------------

/**
 * A controllable fake listener that implements IDecoderListener.
 * Tests can call simulateConnect() / simulateDisconnect() / simulateMessage()
 * to drive the listener into different states.
 */
class FakeListener
  extends EventEmitter<DecoderListenerEvents>
  implements IDecoderListener
{
  public readonly type: ListenerType;
  public readonly descriptor: ConnectionDescriptor;
  private _connected = false;
  public startCalled = false;
  public stopCalled = false;

  constructor(type: ListenerType, descriptor: ConnectionDescriptor) {
    super();
    this.type = type;
    this.descriptor = descriptor;
  }

  start(): void {
    this.startCalled = true;
  }

  stop(): void {
    this.stopCalled = true;
    if (this._connected) {
      this._connected = false;
      this.emit("disconnected", this.type);
    }
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

  // --- Test helpers ---

  simulateConnect(): void {
    this._connected = true;
    this.emit("connected", this.type);
  }

  simulateDisconnect(): void {
    this._connected = false;
    this.emit("disconnected", this.type);
  }

  simulateMessage(data: unknown): void {
    this.emit("message", this.type, data);
  }
}

// ---------------------------------------------------------------------------
// Track every FakeListener instance created by the factory mock
// ---------------------------------------------------------------------------

const createdListeners: FakeListener[] = [];

// Mock the decoder-listener factory so BackgroundServices gets FakeListeners.
vi.mock("../decoder-listener.js", async (importOriginal) => {
  // Keep the interface types but replace createDecoderListener.
  const original =
    await importOriginal<typeof import("../decoder-listener.js")>();
  return {
    ...original,
    createDecoderListener: (
      type: ListenerType,
      descriptor: ConnectionDescriptor,
    ): IDecoderListener => {
      const fake = new FakeListener(type, descriptor);
      createdListeners.push(fake);
      return fake;
    },
  };
});

// Mock config module so we control exactly which connections are configured.
// Defaults to empty; individual tests override via vi.doMock or by setting
// the module-level variables exposed below.
let mockAcarsConnections: DecoderConnections = { descriptors: [] };
let mockVdlmConnections: DecoderConnections = { descriptors: [] };
let mockHfdlConnections: DecoderConnections = { descriptors: [] };
let mockImslConnections: DecoderConnections = { descriptors: [] };
let mockIrdmConnections: DecoderConnections = { descriptors: [] };
let mockXngConnections: DecoderConnections = { descriptors: [] };

vi.mock("../../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config.js")>();
  return {
    ...original,
    get ACARS_CONNECTIONS(): DecoderConnections {
      return mockAcarsConnections;
    },
    get VDLM_CONNECTIONS(): DecoderConnections {
      return mockVdlmConnections;
    },
    get HFDL_CONNECTIONS(): DecoderConnections {
      return mockHfdlConnections;
    },
    get IMSL_CONNECTIONS(): DecoderConnections {
      return mockImslConnections;
    },
    get IRDM_CONNECTIONS(): DecoderConnections {
      return mockIrdmConnections;
    },
    get XNG_CONNECTIONS(): DecoderConnections {
      return mockXngConnections;
    },
    getConfig: () => ({
      ...original.getConfig(),
      enableAcars: true,
      enableVdlm: false,
      enableHfdl: false,
      enableImsl: false,
      enableIrdm: false,
      enableXng: true,
      enableAdsb: false,
    }),
  };
});

// Mock database and socket dependencies to avoid real I/O.
vi.mock("../../db/index.js", () => ({
  getPerDecoderMessageCounts: () => ({
    acars: 0,
    vdlm2: 0,
    hfdl: 0,
    imsl: 0,
    irdm: 0,
  }),
  addMessageFromJson: vi.fn().mockResolvedValue(undefined),
  checkpoint: vi
    .fn()
    .mockReturnValue({ framesCheckpointed: 0, framesRemaining: 0 }),
  checkpointBackup: vi.fn().mockReturnValue(null),
  optimizeDbFts: vi.fn().mockResolvedValue(undefined),
  optimizeDbMerge: vi.fn().mockResolvedValue(undefined),
  optimizeDbRegular: vi.fn().mockResolvedValue(undefined),
  pruneDatabase: vi.fn().mockResolvedValue(undefined),
}));

// Scheduler mock — captures callbacks registered via .do() so tests can invoke them.
const schedulerCallbacks = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("../scheduler.js", () => ({
  getScheduler: () => ({
    every: () => ({
      do: (fn: (...args: unknown[]) => unknown, name?: string) => {
        if (name) schedulerCallbacks.set(name, fn);
      },
      at: () => ({
        do: (fn: (...args: unknown[]) => unknown, name?: string) => {
          if (name) schedulerCallbacks.set(name, fn);
        },
      }),
    }),
    start: vi.fn(),
    stop: vi.fn(),
    getTasks: () => [],
  }),
  destroyScheduler: vi.fn(),
}));

vi.mock("../adsb-poller.js", () => ({
  getAdsbPoller: vi.fn(() => ({ on: vi.fn(), start: vi.fn(), stop: vi.fn() })),
  destroyAdsbPoller: vi.fn(),
}));

vi.mock("../message-ring-buffer.js", () => ({
  pushMessage: vi.fn(),
  pushAlert: vi.fn(),
  reheatMessageBuffers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../stats-pruning.js", () => ({
  startStatsPruning: vi.fn(),
  stopStatsPruning: vi.fn(),
}));
vi.mock("../stats-writer.js", () => ({
  startStatsWriter: vi.fn(),
  stopStatsWriter: vi.fn(),
}));
vi.mock("../station-ids.js", () => ({
  checkAndAddStationId: vi.fn(),
  getStationIds: vi.fn(() => []),
}));
vi.mock("../../formatters/index.js", () => ({
  formatAcarsMessage: vi.fn(() => null),
}));
vi.mock("../../formatters/enrichment.js", () => ({
  enrichMessage: vi.fn((m: unknown) => m),
}));

// ---------------------------------------------------------------------------
// Imports for scheduler callback tests (after mocks)
// ---------------------------------------------------------------------------

import { pruneDatabase } from "../../db/index.js";
import { resetDecoderActivity } from "../decoder-activity.js";
import { reheatMessageBuffers } from "../message-ring-buffer.js";

const mockPruneDatabase = vi.mocked(pruneDatabase);
const mockReheatMessageBuffers = vi.mocked(reheatMessageBuffers);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeXngEnvelope(mode: string): Record<string, unknown> {
  return {
    mode,
    timestamp: "2026-01-01T00:00:00Z",
    frequency_hz: 136_975_000,
    signal: {},
    decode: { crc_ok: true },
    body: { type: "test" },
    source: {
      station: { id: "s1", ident: "TEST" },
      app: { name: "xng", version: "0.0.0" },
    },
  };
}

function makeDescriptor(
  port: number,
  listenType: ConnectionDescriptor["listenType"] = "udp",
): ConnectionDescriptor {
  return { listenType, host: "127.0.0.1", port };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BackgroundServices — fan-in architecture", () => {
  beforeEach(() => {
    // Reset created-listener tracking and connection configs before each test.
    createdListeners.length = 0;
    schedulerCallbacks.clear();
    mockAcarsConnections = { descriptors: [] };
    mockVdlmConnections = { descriptors: [] };
    mockHfdlConnections = { descriptors: [] };
    mockImslConnections = { descriptors: [] };
    mockIrdmConnections = { descriptors: [] };
    mockXngConnections = { descriptors: [] };
    resetDecoderActivity();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Listener creation
  // -------------------------------------------------------------------------

  describe("Listener creation", () => {
    it("creates one listener when a single descriptor is configured", async () => {
      mockAcarsConnections = { descriptors: [makeDescriptor(5550)] };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const acarsListeners = createdListeners.filter((l) => l.type === "ACARS");
      expect(acarsListeners).toHaveLength(1);
      expect(acarsListeners[0].descriptor.port).toBe(5550);
    });

    it("creates two listeners when two descriptors are configured (fan-in)", async () => {
      mockAcarsConnections = {
        descriptors: [
          makeDescriptor(5550, "udp"),
          makeDescriptor(15550, "tcp"),
        ],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const acarsListeners = createdListeners.filter((l) => l.type === "ACARS");
      expect(acarsListeners).toHaveLength(2);
      expect(acarsListeners[0].descriptor.listenType).toBe("udp");
      expect(acarsListeners[1].descriptor.listenType).toBe("tcp");
    });

    it("calls start() on all listeners when start() is called on BackgroundServices", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();
      svc.start();

      for (const listener of createdListeners) {
        expect(listener.startCalled).toBe(true);
      }
    });

    it("does not create listeners for a type that is not enabled", async () => {
      // Only ACARS is enabled (see getConfig mock above); VDLM is disabled.
      mockVdlmConnections = { descriptors: [makeDescriptor(5555)] };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const vdlmListeners = createdListeners.filter((l) => l.type === "VDLM2");
      expect(vdlmListeners).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Connection status — fan-in semantics
  // -------------------------------------------------------------------------

  describe("Connection status (fan-in)", () => {
    it("connected is true when any single listener connects", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const [listenerA] = createdListeners.filter((l) => l.type === "ACARS");

      listenerA.simulateConnect();

      expect(svc.getConnectionStatus().ACARS).toBe(true);
    });

    it("connected stays true when one of two listeners disconnects but the other remains connected", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const [listenerA, listenerB] = createdListeners.filter(
        (l) => l.type === "ACARS",
      );

      // Both connect
      listenerA.simulateConnect();
      listenerB.simulateConnect();
      expect(svc.getConnectionStatus().ACARS).toBe(true);

      // One disconnects — the other is still connected
      listenerA.simulateDisconnect();
      expect(svc.getConnectionStatus().ACARS).toBe(true);
    });

    it("connected is false only when ALL listeners for the type disconnect", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const [listenerA, listenerB] = createdListeners.filter(
        (l) => l.type === "ACARS",
      );

      listenerA.simulateConnect();
      listenerB.simulateConnect();

      listenerA.simulateDisconnect();
      listenerB.simulateDisconnect();

      expect(svc.getConnectionStatus().ACARS).toBe(false);
    });

    it("connected is false initially before any listener connects", async () => {
      mockAcarsConnections = { descriptors: [makeDescriptor(5550)] };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      expect(svc.getConnectionStatus().ACARS).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Message routing
  // -------------------------------------------------------------------------

  describe("Message routing to MessageQueue", () => {
    it("messages from both listeners for the same type arrive in the message queue", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const { getMessageQueue, destroyMessageQueue } =
        await import("../message-queue.js");

      // Start with a fresh queue.
      destroyMessageQueue();
      const queue = getMessageQueue(100);

      const receivedMessages: unknown[] = [];
      queue.on("message", (msg) => {
        receivedMessages.push(msg.data);
      });

      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const [listenerA, listenerB] = createdListeners.filter(
        (l) => l.type === "ACARS",
      );

      listenerA.simulateMessage({ source: "listenerA", id: 1 });
      listenerB.simulateMessage({ source: "listenerB", id: 2 });

      // Give event loop a tick to process
      await new Promise((r) => setImmediate(r));

      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages).toContainEqual({ source: "listenerA", id: 1 });
      expect(receivedMessages).toContainEqual({ source: "listenerB", id: 2 });

      destroyMessageQueue();
    });

    it("regression: two listeners for same type increment message queue stats once per message", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const { getMessageQueue, destroyMessageQueue } =
        await import("../message-queue.js");

      destroyMessageQueue();
      const queue = getMessageQueue(100);

      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();

      const [listenerA] = createdListeners.filter((l) => l.type === "ACARS");

      // Only one listener emits one message — stats should show exactly 1.
      listenerA.simulateMessage({ test: true });

      await new Promise((r) => setImmediate(r));

      const stats = queue.getStats();
      expect(stats.acars.total).toBe(1);

      destroyMessageQueue();
    });
  });

  // -------------------------------------------------------------------------
  // XNG runtime decoder activation
  // -------------------------------------------------------------------------

  describe("XNG runtime decoder activation", () => {
    async function setupXng(): Promise<{
      emit: ReturnType<typeof vi.fn>;
      xng: FakeListener;
      destroy: () => void;
    }> {
      mockXngConnections = { descriptors: [makeDescriptor(5560)] };

      const { BackgroundServices } = await import("../index.js");
      const { destroyMessageQueue, getMessageQueue } =
        await import("../message-queue.js");
      destroyMessageQueue();
      getMessageQueue(100);

      const emit = vi.fn();
      const svc = new BackgroundServices({ socketio: { emit } });
      await svc.initialize();

      const [xng] = createdListeners.filter((l) => l.type === "XNG");
      return { emit, xng, destroy: destroyMessageQueue };
    }

    function emitsOf(emit: ReturnType<typeof vi.fn>, event: string): unknown[] {
      return emit.mock.calls
        .filter(([name]) => name === event)
        .map(([, data]) => data);
    }

    it("activates a config-disabled carrier once and refreshes clients once", async () => {
      const { emit, xng, destroy } = await setupXng();
      const { isDecoderEnabled } = await import("../decoder-activity.js");

      expect(isDecoderEnabled("VDLM2")).toBe(false);

      xng.simulateMessage(makeXngEnvelope("vdl2"));
      xng.simulateMessage(makeXngEnvelope("vdl2"));
      xng.simulateMessage(makeXngEnvelope("vdl2"));

      expect(isDecoderEnabled("VDLM2")).toBe(true);

      const features = emitsOf(emit, "features_enabled");
      expect(features).toHaveLength(1);
      expect(features[0]).toMatchObject({ vdlm: true, acars: true });
      expect(emitsOf(emit, "system_status")).toHaveLength(1);

      destroy();
    });

    it("does not refresh clients for a carrier whose config flag is already on", async () => {
      const { emit, xng, destroy } = await setupXng();

      // ACARS is config-enabled in the getConfig mock.
      xng.simulateMessage(makeXngEnvelope("acars_poa"));

      expect(emitsOf(emit, "features_enabled")).toHaveLength(0);
      expect(emitsOf(emit, "system_status")).toHaveLength(0);

      destroy();
    });

    it("counts every routed xng envelope", async () => {
      const { xng, destroy } = await setupXng();
      const { getXngMessageCount } = await import("../decoder-activity.js");

      xng.simulateMessage(makeXngEnvelope("vdl2"));
      xng.simulateMessage(makeXngEnvelope("acars_poa"));
      xng.simulateMessage(makeXngEnvelope("vdl2"));

      expect(getXngMessageCount()).toBe(3);

      destroy();
    });

    it("does not count messages from non-XNG listeners", async () => {
      mockAcarsConnections = { descriptors: [makeDescriptor(5550)] };
      const { destroy } = await setupXng();
      const { getXngMessageCount, isFedByXng } =
        await import("../decoder-activity.js");

      const [acars] = createdListeners.filter((l) => l.type === "ACARS");
      acars.simulateMessage({ text: "hello" });

      expect(getXngMessageCount()).toBe(0);
      expect(isFedByXng("ACARS")).toBe(false);

      destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("calls stop() on all listeners when BackgroundServices.stop() is called", async () => {
      mockAcarsConnections = {
        descriptors: [makeDescriptor(5550), makeDescriptor(15550, "tcp")],
      };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();
      svc.start();
      svc.stop();

      for (const listener of createdListeners) {
        expect(listener.stopCalled).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scheduler: prune_database → conditional reheat
  // -------------------------------------------------------------------------

  describe("prune_database scheduler callback", () => {
    it("reheats ring buffers when pruneDatabase reports prunedAlerts > 0", async () => {
      mockAcarsConnections = { descriptors: [makeDescriptor(5550)] };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();
      svc.start();

      const pruneCallback = schedulerCallbacks.get("prune_database");
      expect(pruneCallback).toBeDefined();

      // Simulate prune that removed alert_matches rows
      mockPruneDatabase.mockReturnValue({
        prunedMessages: 5,
        prunedAlerts: 3,
      });

      await pruneCallback?.();

      expect(mockPruneDatabase).toHaveBeenCalled();
      expect(mockReheatMessageBuffers).toHaveBeenCalledTimes(1);
    });

    it("does NOT reheat ring buffers when pruneDatabase reports prunedAlerts === 0", async () => {
      mockAcarsConnections = { descriptors: [makeDescriptor(5550)] };

      const { BackgroundServices } = await import("../index.js");
      const svc = new BackgroundServices({ socketio: { emit: vi.fn() } });
      await svc.initialize();
      svc.start();

      const pruneCallback = schedulerCallbacks.get("prune_database");
      expect(pruneCallback).toBeDefined();

      // Simulate prune that removed only messages, no alert matches
      mockPruneDatabase.mockReturnValue({
        prunedMessages: 10,
        prunedAlerts: 0,
      });

      await pruneCallback?.();

      expect(mockPruneDatabase).toHaveBeenCalled();
      expect(mockReheatMessageBuffers).not.toHaveBeenCalled();
    });
  });
});

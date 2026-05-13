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
// socket.ts — exercises the SocketService singleton that wraps socket.io-client.
//
// Mocks `socket.io-client` so no actual network I/O occurs.  Tests cover:
//   1. connect() init: /main namespace, correct path computation, idempotence
//      (React StrictMode double-invocation), reconnection options.
//   2. Emit-wrapper namespace regression (TEST-MISSING-FE): every wrapper
//      must call socket.emit(event, payload) with NO 3rd-argument namespace.
//      Carrying over the Flask-SocketIO "/main" arg silently consumed a
//      future second handler parameter — TYPE-01/02 removed it; this test
//      locks that decision in.
//   3. State queries (getSocket / isInitialized / isConnected) including the
//      indeterminate-state warning path.
//   4. disconnect() tears down completely.
//   5. fireLocalEvent() reads from the @socket.io/component-emitter
//      `_callbacks["$<event>"]` map, which the E2E mock mirrors.
//   6. Connection-handler wiring (setupConnectionHandlers) registers the
//      documented set of events.
//
// The module is a singleton with private mutable state.  We use
// `vi.resetModules()` between tests so each test starts with a fresh
// `socketService` instance.
// ----------------------------------------------------------------------------

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mock socket.io-client
//
// `io()` is a factory; we return a FakeSocket every call.  Tests inspect the
// most recently created instance via `lastSocket`.
// ---------------------------------------------------------------------------

interface FakeSocketEvents {
  // biome-ignore lint/suspicious/noExplicitAny: Mirrors socket.io callback shape
  [event: string]: Array<(...args: any[]) => void>;
}

class FakeSocket {
  connected = false;
  disconnected = true;
  id: string | undefined = undefined;
  // biome-ignore lint/suspicious/noExplicitAny: mirrors @socket.io/component-emitter internals
  _callbacks: Record<string, Array<(...args: any[]) => void>> = {};

  // Track emitted events so we can assert (event, payload) shape without a
  // namespace argument leaking back in.
  // biome-ignore lint/suspicious/noExplicitAny: payloads vary by event
  emittedEvents: Array<{ event: string; args: any[] }> = [];

  // Capture every handler registered on the socket and the manager.
  socketHandlers: FakeSocketEvents = {};
  managerHandlers: FakeSocketEvents = {};

  io = {
    on: (event: string, handler: (...args: unknown[]) => void): void => {
      const list = this.managerHandlers[event] ?? [];
      list.push(handler);
      this.managerHandlers[event] = list;
    },
    uri: "fake://mock-uri",
    engine: { transport: { name: "fake-ws" } },
  };

  // biome-ignore lint/suspicious/noExplicitAny: matches socket.io callback shape
  on(event: string, handler: (...args: any[]) => void): this {
    const socketList = this.socketHandlers[event] ?? [];
    socketList.push(handler);
    this.socketHandlers[event] = socketList;
    // Also stash in the _callbacks map so fireLocalEvent() can find them.
    const callbackKey = `$${event}`;
    const callbackList = this._callbacks[callbackKey] ?? [];
    callbackList.push(handler);
    this._callbacks[callbackKey] = callbackList;
    return this;
  }

  off(): this {
    return this;
  }

  // biome-ignore lint/suspicious/noExplicitAny: emit must accept arbitrary payloads
  emit(event: string, ...args: any[]): this {
    this.emittedEvents.push({ event, args });
    return this;
  }

  disconnect(): this {
    this.connected = false;
    this.disconnected = true;
    return this;
  }

  // ---- Test helpers (not part of the real Socket type) ----

  /** Simulate the underlying socket transitioning to "connected". */
  becomeConnected(id = "fake-socket-id"): void {
    this.connected = true;
    this.disconnected = false;
    this.id = id;
    for (const handler of this.socketHandlers.connect ?? []) handler();
  }

  /** Fire a registered socket event handler (no network involved). */
  fireSocketEvent(event: string, ...args: unknown[]): void {
    for (const handler of this.socketHandlers[event] ?? []) {
      handler(...args);
    }
  }
}

const ioMock = vi.fn();
let lastSocket: FakeSocket;

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => {
    lastSocket = new FakeSocket();
    ioMock(...args);
    return lastSocket;
  },
}));

// ---------------------------------------------------------------------------
// Mock the socket logger so noisy info/warn/error calls don't pollute output
// AND so we can assert on them where relevant.
// ---------------------------------------------------------------------------

vi.mock("../../utils/logger", () => ({
  socketLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Dynamic import so vi.resetModules() between tests gives us a fresh
// SocketService singleton per test.
// ---------------------------------------------------------------------------

type SocketModule = typeof import("../socket");

async function loadFreshModule(): Promise<SocketModule> {
  vi.resetModules();
  ioMock.mockClear();
  return await import("../socket");
}

// jsdom guards `window.location` against reassignment, but `history.pushState`
// is honoured and updates `document.location.pathname` (which is what
// SocketService.connect() actually reads).  Origin is fixed to whatever jsdom
// provides (typically http://localhost:3000) and not asserted on directly.
function setPathname(pathname: string): void {
  window.history.pushState({}, "", pathname);
}

beforeEach(() => {
  setPathname("/");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// connect() — initialization & namespace
// ---------------------------------------------------------------------------

describe("SocketService.connect", () => {
  it("connects to the /main namespace under the page origin", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const [url] = ioMock.mock.calls[0] ?? [];
    // Origin comes from jsdom (not asserted exactly); the /main suffix is the
    // contract that binds the namespace at construction time.
    expect(url).toMatch(/^https?:\/\/[^/]+\/main$/);
    expect(url).toBe(`${window.location.origin}/main`);
  });

  it("computes socket path '//socket.io' for root deployment", async () => {
    // NOTE: When pathname is "/", the route-stripping regex doesn't match,
    // so `index_acars_path` remains "/" and the final path is "//socket.io".
    // Socket.IO server normalises this to "/socket.io" so it works, but the
    // double-slash is a latent quirk worth flagging.  This test locks the
    // current behaviour; if the path computation is fixed to emit "/socket.io"
    // for root, update this expectation in the same commit.
    setPathname("/");
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const [, opts] = ioMock.mock.calls[0] ?? [];
    expect(opts.path).toBe("//socket.io");
  });

  it("computes socket path '/socket.io' for a known route on root deployment", async () => {
    setPathname("/live-messages");
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const [, opts] = ioMock.mock.calls[0] ?? [];
    expect(opts.path).toBe("/socket.io");
  });

  it("computes socket path under a subpath deployment", async () => {
    // Simulates serving the app at /acars/ behind a reverse proxy.
    setPathname("/acars/search");
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const [, opts] = ioMock.mock.calls[0] ?? [];
    expect(opts.path).toBe("/acars/socket.io");
  });

  it("strips known React Router segments before computing path", async () => {
    for (const segment of [
      "live-messages",
      "search",
      "alerts",
      "status",
      "adsb",
      "about",
    ]) {
      setPathname(`/${segment}/some/deep/route`);
      const { socketService } = await loadFreshModule();
      socketService.connect();
      const [, opts] = ioMock.mock.calls[0] ?? [];
      expect(opts.path).toBe("/socket.io");
    }
  });

  it("requests polling + websocket transports and retries up to 10 times", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const [, opts] = ioMock.mock.calls[0] ?? [];
    expect(opts.transports).toEqual(["polling", "websocket"]);
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(10);
    expect(opts.autoConnect).toBe(true);
    expect(opts.upgrade).toBe(true);
  });

  it("is idempotent when called twice during StrictMode double-invocation", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    socketService.connect();
    // Second call returns the in-flight socket without re-initialising.
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it("returns the same instance once connected", async () => {
    const { socketService } = await loadFreshModule();
    const first = socketService.connect();
    lastSocket.becomeConnected();
    const second = socketService.connect();
    expect(first).toBe(second);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Emit wrappers — namespace regression (TEST-MISSING-FE)
//
// Every typed wrapper that calls socket.emit() must do so with exactly
// `(event, payload)` — no trailing `/main` argument.  The bug TYPE-01
// remediated was that a Python-Flask-SocketIO quirk had a 3rd "/main" arg
// that v4 of socket.io-client silently accepted as a handler-positioned
// parameter.  No handler reads it today, so nothing breaks, but a future
// handler with a second parameter would silently consume the string.  The
// /main namespace binding happens at construction (`io(.../main)`); per-emit
// namespace arguments are forbidden.
// ---------------------------------------------------------------------------

describe("Emit wrappers — no namespace argument (TEST-MISSING-FE regression)", () => {
  async function withConnectedSocket(): Promise<{
    socketService: SocketModule["socketService"];
  }> {
    const mod = await loadFreshModule();
    mod.socketService.connect();
    lastSocket.becomeConnected();
    return { socketService: mod.socketService };
  }

  it("searchDatabase emits (query_search, query) with no namespace arg", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.searchDatabase({ search_term: { foo: "bar" } });
    expect(lastSocket.emittedEvents).toEqual([
      { event: "query_search", args: [{ search_term: { foo: "bar" } }] },
    ]);
  });

  it("updateAlerts emits (update_alerts, { terms, ignore })", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.updateAlerts(["TEST"], ["IGNORE"]);
    expect(lastSocket.emittedEvents).toEqual([
      {
        event: "update_alerts",
        args: [{ terms: ["TEST"], ignore: ["IGNORE"] }],
      },
    ]);
  });

  it("queryAlertsByTerm emits (query_alerts_by_term, { term, page })", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.queryAlertsByTerm("EMERG", 3);
    expect(lastSocket.emittedEvents).toEqual([
      { event: "query_alerts_by_term", args: [{ term: "EMERG", page: 3 }] },
    ]);
  });

  it("queryAlertsByTerm defaults page to 0", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.queryAlertsByTerm("EMERG");
    expect(lastSocket.emittedEvents).toEqual([
      { event: "query_alerts_by_term", args: [{ term: "EMERG", page: 0 }] },
    ]);
  });

  it("requestSignalFreqs emits (signal_freqs, { freqs: true })", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.requestSignalFreqs();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "signal_freqs", args: [{ freqs: true }] },
    ]);
  });

  it("requestSignalCount emits (signal_count, { count: true })", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.requestSignalCount();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "signal_count", args: [{ count: true }] },
    ]);
  });

  it("requestSignalGraphs emits (signal_graphs, {})", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.requestSignalGraphs();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "signal_graphs", args: [{}] },
    ]);
  });

  it("requestStatus emits (request_status, {})", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.requestStatus();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "request_status", args: [{}] },
    ]);
  });

  it("requestRecentAlerts emits (request_recent_alerts, {}) when connected", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.requestRecentAlerts();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "request_recent_alerts", args: [{}] },
    ]);
  });

  it("regenerateAlertMatches emits (regenerate_alert_matches, {}) when connected", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.regenerateAlertMatches();
    expect(lastSocket.emittedEvents).toEqual([
      { event: "regenerate_alert_matches", args: [{}] },
    ]);
  });

  it("notifyPageChange emits (page_change, { page })", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.notifyPageChange("alerts");
    expect(lastSocket.emittedEvents).toEqual([
      { event: "page_change", args: [{ page: "alerts" }] },
    ]);
  });

  it("regression: every emitted event has exactly one payload argument (no namespace string trailing it)", async () => {
    const { socketService } = await withConnectedSocket();
    socketService.searchDatabase({ search_term: {} });
    socketService.updateAlerts([], []);
    socketService.queryAlertsByTerm("X");
    socketService.requestSignalFreqs();
    socketService.requestSignalCount();
    socketService.requestSignalGraphs();
    socketService.requestStatus();
    socketService.requestRecentAlerts();
    socketService.regenerateAlertMatches();
    socketService.notifyPageChange("home");

    for (const call of lastSocket.emittedEvents) {
      expect(
        call.args.length,
        `event ${call.event} emitted with ${call.args.length} args (should be 1)`,
      ).toBe(1);
      // None of the args should be the literal string "/main".
      expect(call.args[0]).not.toBe("/main");
    }
  });
});

// ---------------------------------------------------------------------------
// Connection-gated emits — must short-circuit and log when disconnected
// ---------------------------------------------------------------------------

describe("Connection-gated emits", () => {
  it("requestRecentAlerts is a no-op when socket is not connected", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    // Don't transition to connected.
    socketService.requestRecentAlerts();
    expect(lastSocket.emittedEvents).toHaveLength(0);
  });

  it("regenerateAlertMatches is a no-op when socket is not connected", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    socketService.regenerateAlertMatches();
    expect(lastSocket.emittedEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

describe("SocketService state queries", () => {
  it("isInitialized() is false before connect(), true after", async () => {
    const { socketService } = await loadFreshModule();
    expect(socketService.isInitialized()).toBe(false);
    socketService.connect();
    expect(socketService.isInitialized()).toBe(true);
  });

  it("isConnected() reflects underlying socket.connected", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    expect(socketService.isConnected()).toBe(false);
    lastSocket.becomeConnected();
    expect(socketService.isConnected()).toBe(true);
  });

  it("getSocket() throws before connect()", async () => {
    const { socketService } = await loadFreshModule();
    expect(() => socketService.getSocket()).toThrow(/not initialized/i);
  });

  it("getSocket() returns the socket after connect()", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    expect(socketService.getSocket()).toBe(lastSocket);
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

describe("SocketService.disconnect", () => {
  it("calls socket.disconnect() and clears the instance", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const captured = lastSocket;
    const spy = vi.spyOn(captured, "disconnect");
    socketService.disconnect();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(socketService.isInitialized()).toBe(false);
  });

  it("disconnect() is a no-op when never connected", async () => {
    const { socketService } = await loadFreshModule();
    expect(() => {
      socketService.disconnect();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fireLocalEvent — E2E injection hook
// ---------------------------------------------------------------------------

describe("SocketService.fireLocalEvent", () => {
  it("invokes all handlers registered via socket.on(event, ...)", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const handler = vi.fn();
    lastSocket.on("acars_msg", handler as Mock);
    socketService.fireLocalEvent("acars_msg", { uid: "test" });
    expect(handler).toHaveBeenCalledWith({ uid: "test" });
  });

  it("snapshots handlers so handler removal during dispatch doesn't drop later ones", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    const order: string[] = [];
    const a = (): void => {
      order.push("a");
      // Mutate the array to simulate removal during dispatch.
      lastSocket._callbacks.$acars_msg = [];
    };
    const b = (): void => {
      order.push("b");
    };
    lastSocket.on("acars_msg", a);
    lastSocket.on("acars_msg", b);
    socketService.fireLocalEvent("acars_msg", null);
    expect(order).toEqual(["a", "b"]);
  });

  it("is a safe no-op when socket has not been initialised", async () => {
    const { socketService } = await loadFreshModule();
    expect(() => {
      socketService.fireLocalEvent("acars_msg", null);
    }).not.toThrow();
  });

  it("is a safe no-op for events with no registered handlers", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    expect(() => {
      socketService.fireLocalEvent("nonexistent_event", null);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setupConnectionHandlers wiring
// ---------------------------------------------------------------------------

describe("Connection handlers wiring", () => {
  it("registers the documented set of socket-level handlers", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    for (const event of [
      "connect",
      "disconnect",
      "reconnect",
      "connect_error",
      "error",
    ]) {
      expect(
        lastSocket.socketHandlers[event]?.length ?? 0,
        `expected handler for socket event '${event}'`,
      ).toBeGreaterThan(0);
    }
  });

  it("registers reconnect_attempt and reconnect_failed on the manager", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    expect(lastSocket.managerHandlers.reconnect_attempt?.length ?? 0).toBe(1);
    expect(lastSocket.managerHandlers.reconnect_failed?.length ?? 0).toBe(1);
  });

  it("clears isInitializing on successful connect", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    // Fire the connect handler — this should flip isInitializing back to false.
    lastSocket.becomeConnected();
    // A subsequent connect() now sees socket.connected === true and returns
    // the existing instance without re-initialising.
    socketService.connect();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it("clears isInitializing on connect_error so reconnection isn't blocked", async () => {
    const { socketService } = await loadFreshModule();
    socketService.connect();
    lastSocket.fireSocketEvent("connect_error", new Error("boom"));
    // Calling connect again after an error and a disconnect should produce a
    // fresh socket (simulates StrictMode cleanup + remount).
    socketService.disconnect();
    socketService.connect();
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});

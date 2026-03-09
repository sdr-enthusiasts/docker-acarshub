// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Unit tests for startup-state.ts
 *
 * Tests:
 *   setMigrationRunning / isMigrationRunning
 *     - defaults to false
 *     - true after setMigrationRunning(true)
 *     - false after setMigrationRunning(false)
 *
 *   registerPendingSocket
 *     - socket is returned by drainPendingSockets when still connected
 *     - socket is removed from queue when it disconnects before drain
 *     - multiple sockets are all queued
 *
 *   drainPendingSockets
 *     - returns only connected sockets
 *     - clears the queue so a second drain returns empty
 *     - connected sockets survive the drain; disconnected are dropped
 *
 *   resetStartupState
 *     - resets migration flag and empties the pending queue
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mock for the logger so we don't pollute test output
// ---------------------------------------------------------------------------

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  drainPendingSockets,
  isMigrationRunning,
  registerPendingSocket,
  resetStartupState,
  setMigrationRunning,
} from "../../startup-state.js";

// ---------------------------------------------------------------------------
// Minimal TypedSocket stub
// We only need the subset used by startup-state: id, connected, and once().
// ---------------------------------------------------------------------------

interface StubSocket {
  id: string;
  connected: boolean;
  /** Captured "once" handlers keyed by event name */
  onceHandlers: Record<string, () => void>;
  once: ReturnType<typeof vi.fn>;
}

function makeStubSocket(id: string, connected = true): StubSocket {
  const stub: StubSocket = {
    id,
    connected,
    onceHandlers: {},
    once: vi.fn(),
  };

  // Capture the disconnect handler registered by registerPendingSocket so
  // tests can trigger it manually to simulate an early disconnect.
  stub.once.mockImplementation((event: string, handler: () => void) => {
    stub.onceHandlers[event] = handler;
  });

  return stub;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate the socket disconnecting before drain. */
function simulateDisconnect(stub: StubSocket): void {
  stub.connected = false;
  stub.onceHandlers.disconnect?.();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startup-state", () => {
  beforeEach(() => {
    resetStartupState();
  });

  afterEach(() => {
    resetStartupState();
  });

  // -------------------------------------------------------------------------
  // isMigrationRunning / setMigrationRunning
  // -------------------------------------------------------------------------

  describe("isMigrationRunning", () => {
    it("defaults to false", () => {
      expect(isMigrationRunning()).toBe(false);
    });

    it("returns true after setMigrationRunning(true)", () => {
      setMigrationRunning(true);
      expect(isMigrationRunning()).toBe(true);
    });

    it("returns false after setMigrationRunning(false)", () => {
      setMigrationRunning(true);
      setMigrationRunning(false);
      expect(isMigrationRunning()).toBe(false);
    });

    it("can be toggled multiple times", () => {
      setMigrationRunning(true);
      setMigrationRunning(false);
      setMigrationRunning(true);
      expect(isMigrationRunning()).toBe(true);
      setMigrationRunning(false);
      expect(isMigrationRunning()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // registerPendingSocket
  // -------------------------------------------------------------------------

  describe("registerPendingSocket", () => {
    it("registers a disconnect listener on the socket", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      expect(socket.once).toHaveBeenCalledWith(
        "disconnect",
        expect.any(Function),
      );
    });

    it("socket is returned by drainPendingSockets when connected", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      const drained = drainPendingSockets();
      expect(drained).toHaveLength(1);
      expect(drained[0]).toBe(socket);
    });

    it("socket is removed from queue when it disconnects before drain", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      simulateDisconnect(socket);
      const drained = drainPendingSockets();
      expect(drained).toHaveLength(0);
    });

    it("multiple sockets are all queued", () => {
      const s1 = makeStubSocket("s1");
      const s2 = makeStubSocket("s2");
      const s3 = makeStubSocket("s3");
      registerPendingSocket(s1 as never);
      registerPendingSocket(s2 as never);
      registerPendingSocket(s3 as never);
      const drained = drainPendingSockets();
      expect(drained).toHaveLength(3);
    });

    it("only the disconnected socket is removed when one of many disconnects", () => {
      const s1 = makeStubSocket("s1");
      const s2 = makeStubSocket("s2");
      const s3 = makeStubSocket("s3");
      registerPendingSocket(s1 as never);
      registerPendingSocket(s2 as never);
      registerPendingSocket(s3 as never);
      simulateDisconnect(s2);
      const drained = drainPendingSockets();
      expect(drained).toHaveLength(2);
      expect(drained).toContain(s1);
      expect(drained).not.toContain(s2);
      expect(drained).toContain(s3);
    });
  });

  // -------------------------------------------------------------------------
  // drainPendingSockets
  // -------------------------------------------------------------------------

  describe("drainPendingSockets", () => {
    it("returns an empty array when no sockets were registered", () => {
      expect(drainPendingSockets()).toEqual([]);
    });

    it("clears the queue so a second drain returns empty", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      drainPendingSockets();
      expect(drainPendingSockets()).toHaveLength(0);
    });

    it("returns only connected sockets and drops disconnected ones", () => {
      const connected = makeStubSocket("c1", true);
      const disconnected = makeStubSocket("d1", false);
      // Register disconnected socket WITHOUT simulating disconnect event
      // (tests the connected filter rather than the auto-prune path)
      registerPendingSocket(connected as never);
      registerPendingSocket(disconnected as never);
      const drained = drainPendingSockets();
      expect(drained).toHaveLength(1);
      expect(drained[0]).toBe(connected);
    });

    it("regression: does not return the same socket twice on repeated drains", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      const first = drainPendingSockets();
      const second = drainPendingSockets();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // resetStartupState
  // -------------------------------------------------------------------------

  describe("resetStartupState", () => {
    it("resets the migration flag to false", () => {
      setMigrationRunning(true);
      resetStartupState();
      expect(isMigrationRunning()).toBe(false);
    });

    it("empties the pending socket queue", () => {
      const socket = makeStubSocket("s1");
      registerPendingSocket(socket as never);
      resetStartupState();
      expect(drainPendingSockets()).toHaveLength(0);
    });

    it("resets both flag and queue together", () => {
      setMigrationRunning(true);
      const s1 = makeStubSocket("s1");
      const s2 = makeStubSocket("s2");
      registerPendingSocket(s1 as never);
      registerPendingSocket(s2 as never);
      resetStartupState();
      expect(isMigrationRunning()).toBe(false);
      expect(drainPendingSockets()).toHaveLength(0);
    });
  });
});

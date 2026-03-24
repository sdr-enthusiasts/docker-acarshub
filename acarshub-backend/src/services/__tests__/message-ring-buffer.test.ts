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
 * Unit tests for services/message-ring-buffer.ts
 *
 * Strategy:
 *  - DB layer (grabMostRecent, searchAlerts) and enrichment pipeline
 *    (enrichMessage) are fully mocked so no SQLite process is required.
 *  - resetMessageBuffersForTesting() is called in afterEach to restore module
 *    state between tests.
 *
 * Coverage:
 *   RingBuffer            — push, snapshot, snapshotNewestFirst, size, clear,
 *                           overwrite-when-full, capacity guard
 *   initMessageBuffers    — idempotency, custom capacities
 *   pushMessage           — drops when uninitialised
 *   pushAlert             — drops when uninitialised, deduplication by UID
 *   getRecentMessages     — returns empty when uninitialised, newest-first order
 *   getRecentAlerts       — returns empty when uninitialised, newest-first order
 *   warmMessageBuffers    — seeds from DB, alert metadata restoration,
 *                           skips alert rows from message warm-up,
 *                           gracefully handles enrich errors
 *   regression tests      — no DB query on getRecentMessages/getRecentAlerts
 */

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
// Module-level mocks — declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  grabMostRecent: vi.fn(),
  searchAlerts: vi.fn(),
}));

vi.mock("../../formatters/enrichment.js", () => ({
  enrichMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import type { AcarsMsg } from "@acarshub/types";
import { grabMostRecent, searchAlerts } from "../../db/index.js";
import { enrichMessage } from "../../formatters/enrichment.js";
import {
  DEFAULT_ALERT_CAPACITY,
  DEFAULT_MESSAGE_CAPACITY,
  getRecentAlerts,
  getRecentMessages,
  initMessageBuffers,
  pushAlert,
  pushMessage,
  RingBuffer,
  reheatMessageBuffers,
  resetMessageBuffersForTesting,
  warmMessageBuffers,
} from "../message-ring-buffer.js";

// ---------------------------------------------------------------------------
// Typed aliases
// ---------------------------------------------------------------------------

const mockGrabMostRecent = grabMostRecent as Mock;
const mockSearchAlerts = searchAlerts as Mock;
const mockEnrichMessage = enrichMessage as Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal AcarsMsg-compatible object for testing. */
function makeMsg(uid: string, overrides: Partial<AcarsMsg> = {}): AcarsMsg {
  return {
    uid,
    timestamp: 1_700_000_000_000,
    messageType: "ACARS",
    matched: false,
    text: `Message ${uid}`,
    ...overrides,
  } as unknown as AcarsMsg;
}

/** Build a minimal alert row matching the AlertMatchWithMessage shape. */
function makeAlertRow(uid: string, term: string, matchType: string) {
  return {
    id: 1,
    messageUid: uid,
    term,
    matchType,
    matchedAt: 1_700_000_000,
    message: {
      uid,
      text: "Alert message",
      messageType: "ACARS",
      time: 1_700_000_000,
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: empty DB results so warmMessageBuffers() is side-effect-free
  // unless a test explicitly sets return values.
  mockGrabMostRecent.mockReturnValue([]);
  mockSearchAlerts.mockReturnValue([]);
  mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
    ...msg,
    uid: (msg.uid as string) ?? "enriched",
    timestamp: 1_700_000_000_000,
    messageType: "ACARS",
    matched: false,
  }));
});

afterEach(() => {
  resetMessageBuffersForTesting();
});

// ---------------------------------------------------------------------------
// RingBuffer — class-level tests (exported for white-box testing)
// ---------------------------------------------------------------------------

describe("RingBuffer — basic operations", () => {
  it("starts empty with size 0", () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.size).toBe(0);
  });

  it("snapshot of an empty buffer returns []", () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.snapshot()).toEqual([]);
  });

  it("snapshotNewestFirst of an empty buffer returns []", () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.snapshotNewestFirst()).toEqual([]);
  });

  it("size increases with each push up to capacity", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    expect(buf.size).toBe(1);
    buf.push(2);
    expect(buf.size).toBe(2);
    buf.push(3);
    expect(buf.size).toBe(3);
  });

  it("size does not exceed capacity", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overflows
    expect(buf.size).toBe(3);
  });

  it("snapshot preserves insertion order (oldest first) when not yet full", () => {
    const buf = new RingBuffer<number>(5);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    expect(buf.snapshot()).toEqual([10, 20, 30]);
  });

  it("snapshot preserves insertion order (oldest first) when full and overflowing", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overwrites 1
    buf.push(5); // overwrites 2
    // After overflow: oldest surviving entry is 3, then 4, then 5
    expect(buf.snapshot()).toEqual([3, 4, 5]);
  });

  it("snapshotNewestFirst returns items newest first", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.snapshotNewestFirst()).toEqual([3, 2, 1]);
  });

  it("snapshotNewestFirst after overflow returns newest items first", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overwrites 1
    // Remaining in insertion order: [2, 3, 4]; newest-first: [4, 3, 2]
    expect(buf.snapshotNewestFirst()).toEqual([4, 3, 2]);
  });

  it("snapshot always returns a NEW array (caller cannot mutate internal state)", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    const snap1 = buf.snapshot();
    const snap2 = buf.snapshot();
    expect(snap1).not.toBe(snap2);
    snap1.push(999);
    expect(buf.size).toBe(1); // internal state unchanged
  });

  it("clear resets size to 0", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.snapshot()).toEqual([]);
  });

  it("clear allows new items to be pushed after clearing", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    buf.push(10);
    buf.push(20);
    expect(buf.snapshot()).toEqual([10, 20]);
  });

  it("push with capacity 1 always keeps the last item", () => {
    const buf = new RingBuffer<number>(1);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(1);
    expect(buf.snapshot()).toEqual([3]);
  });

  it("throws RangeError when constructed with capacity < 1", () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(-5)).toThrow(RangeError);
  });

  it("handles objects as items", () => {
    const buf = new RingBuffer<{ id: number }>(3);
    buf.push({ id: 1 });
    buf.push({ id: 2 });
    expect(buf.snapshot()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("exact capacity boundary: full buffer snapshot after N pushes", () => {
    const capacity = 5;
    const buf = new RingBuffer<number>(capacity);
    for (let i = 1; i <= capacity; i++) buf.push(i);
    expect(buf.snapshot()).toEqual([1, 2, 3, 4, 5]);
    expect(buf.size).toBe(capacity);
  });

  it("one overflow: oldest item is replaced correctly", () => {
    const buf = new RingBuffer<string>(4);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    buf.push("d");
    buf.push("e"); // overwrites "a"
    expect(buf.snapshot()).toEqual(["b", "c", "d", "e"]);
  });

  it("many overflows: only the most recent N items are retained", () => {
    const capacity = 4;
    const buf = new RingBuffer<number>(capacity);
    for (let i = 1; i <= 20; i++) buf.push(i);
    // After 20 pushes, only 17-20 survive
    expect(buf.snapshot()).toEqual([17, 18, 19, 20]);
  });

  it("maxCapacity returns the configured capacity", () => {
    const buf = new RingBuffer<number>(42);
    expect(buf.maxCapacity).toBe(42);
  });

  it("maxCapacity is unaffected by pushes or clears", () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.maxCapacity).toBe(5);
    buf.clear();
    expect(buf.maxCapacity).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// initMessageBuffers
// ---------------------------------------------------------------------------

describe("initMessageBuffers", () => {
  it("allows pushMessage and getRecentMessages after init", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1");
    pushMessage(msg);
    expect(getRecentMessages()).toHaveLength(1);
  });

  it("allows pushAlert and getRecentAlerts after init", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1", { matched: true });
    pushAlert(msg);
    expect(getRecentAlerts()).toHaveLength(1);
  });

  it("is idempotent — subsequent calls are no-ops", () => {
    initMessageBuffers(10, 5);
    // Push a message so we can verify the buffer wasn't replaced
    const msg = makeMsg("uid-1");
    pushMessage(msg);

    // Second call should not reset the existing buffers
    initMessageBuffers(10, 5);
    expect(getRecentMessages()).toHaveLength(1);
  });

  it("accepts custom capacities", () => {
    initMessageBuffers(3, 2);
    for (let i = 0; i < 5; i++) pushMessage(makeMsg(`uid-${i}`));
    // Only 3 message slots available
    expect(getRecentMessages()).toHaveLength(3);
  });

  it("DEFAULT_MESSAGE_CAPACITY is 250", () => {
    expect(DEFAULT_MESSAGE_CAPACITY).toBe(250);
  });

  it("DEFAULT_ALERT_CAPACITY is 100", () => {
    expect(DEFAULT_ALERT_CAPACITY).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// pushMessage / getRecentMessages
// ---------------------------------------------------------------------------

describe("pushMessage and getRecentMessages", () => {
  it("returns [] before buffers are initialised", () => {
    // No initMessageBuffers() call
    expect(getRecentMessages()).toEqual([]);
  });

  it("returns [] when no messages have been pushed", () => {
    initMessageBuffers();
    expect(getRecentMessages()).toEqual([]);
  });

  it("returns pushed messages newest-first", () => {
    initMessageBuffers();
    const msg1 = makeMsg("uid-1");
    const msg2 = makeMsg("uid-2");
    const msg3 = makeMsg("uid-3");
    pushMessage(msg1);
    pushMessage(msg2);
    pushMessage(msg3);

    const result = getRecentMessages();
    expect(result[0].uid).toBe("uid-3");
    expect(result[1].uid).toBe("uid-2");
    expect(result[2].uid).toBe("uid-1");
  });

  it("returns a snapshot — mutations do not affect buffer state", () => {
    initMessageBuffers();
    pushMessage(makeMsg("uid-1"));

    const snap = getRecentMessages();
    snap.push(makeMsg("injected"));

    // Buffer internal state is unchanged
    expect(getRecentMessages()).toHaveLength(1);
  });

  it("drops the call silently when called before initMessageBuffers", () => {
    // Should not throw
    expect(() => pushMessage(makeMsg("uid-1"))).not.toThrow();
    // No buffer exists — getRecentMessages still returns []
    expect(getRecentMessages()).toEqual([]);
  });

  it("oldest message is overwritten when buffer is full", () => {
    initMessageBuffers(3, 1); // message capacity = 3
    pushMessage(makeMsg("uid-1"));
    pushMessage(makeMsg("uid-2"));
    pushMessage(makeMsg("uid-3"));
    pushMessage(makeMsg("uid-4")); // overwrites uid-1

    const result = getRecentMessages();
    const uids = result.map((m) => m.uid);
    expect(uids).not.toContain("uid-1");
    expect(uids).toContain("uid-2");
    expect(uids).toContain("uid-3");
    expect(uids).toContain("uid-4");
  });
});

// ---------------------------------------------------------------------------
// pushAlert / getRecentAlerts — including deduplication
// ---------------------------------------------------------------------------

describe("pushAlert and getRecentAlerts", () => {
  it("returns [] before buffers are initialised", () => {
    expect(getRecentAlerts()).toEqual([]);
  });

  it("returns [] when no alerts have been pushed", () => {
    initMessageBuffers();
    expect(getRecentAlerts()).toEqual([]);
  });

  it("returns pushed alerts newest-first", () => {
    initMessageBuffers();
    const a1 = makeMsg("uid-1", { matched: true });
    const a2 = makeMsg("uid-2", { matched: true });
    pushAlert(a1);
    pushAlert(a2);

    const result = getRecentAlerts();
    expect(result[0].uid).toBe("uid-2");
    expect(result[1].uid).toBe("uid-1");
  });

  it("drops the call silently when called before initMessageBuffers", () => {
    expect(() => pushAlert(makeMsg("uid-1", { matched: true }))).not.toThrow();
    expect(getRecentAlerts()).toEqual([]);
  });

  it("deduplicates by UID — second push with same UID replaces the first", () => {
    initMessageBuffers();
    const original = makeMsg("uid-dup", {
      matched: true,
      matched_text: ["term-A"],
    });
    const updated = makeMsg("uid-dup", {
      matched: true,
      matched_text: ["term-A", "term-B"],
    });

    pushAlert(original);
    pushAlert(updated);

    const result = getRecentAlerts();
    // Only one entry for uid-dup
    const forDup = result.filter((m) => m.uid === "uid-dup");
    expect(forDup).toHaveLength(1);
    // The updated entry should be present
    expect(forDup[0].matched_text).toEqual(["term-A", "term-B"]);
  });

  it("deduplication preserves other items in the buffer", () => {
    initMessageBuffers();
    const a1 = makeMsg("uid-1", { matched: true });
    const a2 = makeMsg("uid-2", { matched: true });
    const a1Updated = makeMsg("uid-1", {
      matched: true,
      text: "updated text",
    });

    pushAlert(a1);
    pushAlert(a2);
    pushAlert(a1Updated); // dedup: replaces uid-1

    const result = getRecentAlerts();
    expect(result).toHaveLength(2);
    const uid2 = result.find((m) => m.uid === "uid-2");
    expect(uid2).toBeDefined();
    const uid1 = result.find((m) => m.uid === "uid-1");
    expect(uid1?.text).toBe("updated text");
  });

  it("returns a snapshot — mutations do not affect buffer state", () => {
    initMessageBuffers();
    pushAlert(makeMsg("uid-1", { matched: true }));

    const snap = getRecentAlerts();
    snap.push(makeMsg("injected", { matched: true }));

    expect(getRecentAlerts()).toHaveLength(1);
  });

  it("alert buffer is separate from message buffer", () => {
    initMessageBuffers();
    pushMessage(makeMsg("msg-1"));
    pushAlert(makeMsg("alert-1", { matched: true }));

    expect(getRecentMessages()).toHaveLength(1);
    expect(getRecentMessages()[0].uid).toBe("msg-1");
    expect(getRecentAlerts()).toHaveLength(1);
    expect(getRecentAlerts()[0].uid).toBe("alert-1");
  });
});

// ---------------------------------------------------------------------------
// warmMessageBuffers
// ---------------------------------------------------------------------------

describe("warmMessageBuffers", () => {
  it("does not throw when buffers have not been initialised", async () => {
    // No initMessageBuffers() call
    await expect(warmMessageBuffers()).resolves.not.toThrow();
  });

  it("seeds message buffer from grabMostRecent (non-alert rows only)", async () => {
    initMessageBuffers();

    const rawMessages = [
      { uid: "m1", text: "msg1" },
      { uid: "m2", text: "msg2" },
      { uid: "m3", text: "msg3" },
    ];
    mockGrabMostRecent.mockReturnValue(rawMessages);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    const messages = getRecentMessages();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const uids = messages.map((m) => m.uid);
    expect(uids).toContain("m1");
    expect(uids).toContain("m2");
    expect(uids).toContain("m3");
  });

  it("skips alert-matched messages when warming the non-alert buffer", async () => {
    initMessageBuffers();

    const rawMessages = [
      { uid: "msg-1", text: "normal" },
      { uid: "alert-1", text: "alert msg" },
    ];
    mockGrabMostRecent.mockReturnValue(rawMessages);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: msg.uid === "alert-1",
    }));
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    const messages = getRecentMessages();
    const uids = messages.map((m) => m.uid);
    expect(uids).toContain("msg-1");
    expect(uids).not.toContain("alert-1");
  });

  it("seeds alert buffer from searchAlerts", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    const alertRow = makeAlertRow("a1", "UAL", "text");
    mockSearchAlerts.mockReturnValue([alertRow]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false, // enrichMessage itself doesn't set matched
    }));

    await warmMessageBuffers();

    const alerts = getRecentAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].uid).toBe("a1");
    expect(alerts[0].matched).toBe(true); // restored by warmMessageBuffers
  });

  it("restores matched_text when matchType is 'text'", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([makeAlertRow("a1", "UAL", "text")]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await warmMessageBuffers();

    const alerts = getRecentAlerts();
    expect(alerts[0].matched_text).toEqual(["UAL"]);
    expect(alerts[0].matched_icao).toBeUndefined();
    expect(alerts[0].matched_flight).toBeUndefined();
    expect(alerts[0].matched_tail).toBeUndefined();
  });

  it("restores matched_icao when matchType is 'icao'", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([makeAlertRow("a1", "AA1234", "icao")]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await warmMessageBuffers();

    const alerts = getRecentAlerts();
    expect(alerts[0].matched_icao).toEqual(["AA1234"]);
    expect(alerts[0].matched_text).toBeUndefined();
  });

  it("restores matched_flight when matchType is 'flight'", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([makeAlertRow("a1", "WN4899", "flight")]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await warmMessageBuffers();

    const alerts = getRecentAlerts();
    expect(alerts[0].matched_flight).toEqual(["WN4899"]);
    expect(alerts[0].matched_text).toBeUndefined();
  });

  it("restores matched_tail when matchType is 'tail'", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([makeAlertRow("a1", "N8560Z", "tail")]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await warmMessageBuffers();

    const alerts = getRecentAlerts();
    expect(alerts[0].matched_tail).toEqual(["N8560Z"]);
    expect(alerts[0].matched_text).toBeUndefined();
  });

  it("pushes raw messages in oldest-first order so newest ends up at head", async () => {
    initMessageBuffers(5, 5);

    // grabMostRecent returns newest-first; warmMessageBuffers should reverse
    // before pushing so the ring buffer ends up with newest at head.
    const rawMessages = [
      { uid: "newest", text: "newest" },
      { uid: "middle", text: "middle" },
      { uid: "oldest", text: "oldest" },
    ];
    mockGrabMostRecent.mockReturnValue(rawMessages);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    const messages = getRecentMessages();
    // Newest-first snapshot should start with the most-recently inserted item
    expect(messages[0].uid).toBe("newest");
  });

  it("skips individual messages that fail enrichment and continues", async () => {
    initMessageBuffers();

    const rawMessages = [
      { uid: "good-1", text: "ok" },
      { uid: "bad", text: "will-fail" },
      { uid: "good-2", text: "ok" },
    ];
    mockGrabMostRecent.mockReturnValue(rawMessages);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.uid === "bad") throw new Error("enrichment failed");
      return { ...msg, matched: false };
    });
    mockSearchAlerts.mockReturnValue([]);

    // Should not throw even when one message fails enrichment
    await expect(warmMessageBuffers()).resolves.not.toThrow();

    const messages = getRecentMessages();
    const uids = messages.map((m) => m.uid);
    expect(uids).toContain("good-1");
    expect(uids).toContain("good-2");
    expect(uids).not.toContain("bad");
  });

  it("skips individual alert rows that fail enrichment and continues", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([
      makeAlertRow("good-alert", "UAL", "text"),
      makeAlertRow("bad-alert", "UAL", "text"),
    ]);

    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.uid === "bad-alert") throw new Error("enrichment failed");
      return { ...msg, matched: false };
    });

    await expect(warmMessageBuffers()).resolves.not.toThrow();

    const alerts = getRecentAlerts();
    const uids = alerts.map((m) => m.uid);
    expect(uids).toContain("good-alert");
    expect(uids).not.toContain("bad-alert");
  });

  it("handles a top-level DB error gracefully — buffers remain empty", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    // Should not throw
    await expect(warmMessageBuffers()).resolves.not.toThrow();

    // Buffers remain empty — not fatal
    expect(getRecentMessages()).toHaveLength(0);
  });

  it("queries grabMostRecent with 2× DEFAULT_MESSAGE_CAPACITY", async () => {
    initMessageBuffers();
    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    expect(mockGrabMostRecent).toHaveBeenCalledWith(
      DEFAULT_MESSAGE_CAPACITY * 2,
    );
  });

  it("queries searchAlerts with 2× DEFAULT_ALERT_CAPACITY at offset 0", async () => {
    initMessageBuffers();
    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    expect(mockSearchAlerts).toHaveBeenCalledWith(
      DEFAULT_ALERT_CAPACITY * 2,
      0,
    );
  });

  it("uses configured capacity (not defaults) when custom capacities are provided", async () => {
    const customMsgCap = 50;
    const customAlertCap = 25;
    initMessageBuffers(customMsgCap, customAlertCap);
    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([]);

    await warmMessageBuffers();

    expect(mockGrabMostRecent).toHaveBeenCalledWith(customMsgCap * 2);
    expect(mockSearchAlerts).toHaveBeenCalledWith(customAlertCap * 2, 0);
  });
});

// ---------------------------------------------------------------------------
// resetMessageBuffersForTesting
// ---------------------------------------------------------------------------

describe("resetMessageBuffersForTesting", () => {
  it("nullifies the buffers so getRecentMessages returns [] after reset", () => {
    initMessageBuffers();
    pushMessage(makeMsg("uid-1"));
    expect(getRecentMessages()).toHaveLength(1);

    resetMessageBuffersForTesting();
    expect(getRecentMessages()).toHaveLength(0);
  });

  it("nullifies the buffers so getRecentAlerts returns [] after reset", () => {
    initMessageBuffers();
    pushAlert(makeMsg("uid-1", { matched: true }));
    expect(getRecentAlerts()).toHaveLength(1);

    resetMessageBuffersForTesting();
    expect(getRecentAlerts()).toHaveLength(0);
  });

  it("allows re-initialisation after reset", () => {
    initMessageBuffers(5, 5);
    pushMessage(makeMsg("uid-1"));
    resetMessageBuffersForTesting();

    initMessageBuffers(10, 10);
    pushMessage(makeMsg("uid-2"));
    expect(getRecentMessages()).toHaveLength(1);
    expect(getRecentMessages()[0].uid).toBe("uid-2");
  });

  it("is safe to call when buffers were never initialised", () => {
    expect(() => resetMessageBuffersForTesting()).not.toThrow();
  });

  it("is safe to call multiple times", () => {
    initMessageBuffers();
    expect(() => {
      resetMessageBuffersForTesting();
      resetMessageBuffersForTesting();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// reheatMessageBuffers
// ---------------------------------------------------------------------------

describe("reheatMessageBuffers", () => {
  it("clears both buffers and repopulates from DB", async () => {
    initMessageBuffers(10, 10);

    // Seed buffers with initial data via direct pushes
    pushMessage(makeMsg("old-msg-1"));
    pushMessage(makeMsg("old-msg-2"));
    pushAlert(makeMsg("old-alert-1", { matched: true }));
    expect(getRecentMessages()).toHaveLength(2);
    expect(getRecentAlerts()).toHaveLength(1);

    // Configure mocks to return DIFFERENT data on reheat
    mockGrabMostRecent.mockReturnValue([
      { uid: "new-msg-A", text: "fresh message A" },
      { uid: "new-msg-B", text: "fresh message B" },
      { uid: "new-msg-C", text: "fresh message C" },
    ]);
    mockSearchAlerts.mockReturnValue([
      makeAlertRow("new-alert-X", "DAL", "text"),
      makeAlertRow("new-alert-Y", "N12345", "tail"),
    ]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await reheatMessageBuffers();

    // Old data should be gone
    const messages = getRecentMessages();
    const msgUids = messages.map((m) => m.uid);
    expect(msgUids).not.toContain("old-msg-1");
    expect(msgUids).not.toContain("old-msg-2");

    const alerts = getRecentAlerts();
    const alertUids = alerts.map((m) => m.uid);
    expect(alertUids).not.toContain("old-alert-1");

    // New data should be present
    expect(msgUids).toContain("new-msg-A");
    expect(msgUids).toContain("new-msg-B");
    expect(msgUids).toContain("new-msg-C");
    expect(alertUids).toContain("new-alert-X");
    expect(alertUids).toContain("new-alert-Y");
  });

  it("skips when buffers have not been initialised", async () => {
    // No initMessageBuffers() call — should not throw
    await expect(reheatMessageBuffers()).resolves.not.toThrow();
  });

  it("results in empty buffers when DB returns empty results", async () => {
    initMessageBuffers(10, 10);

    // Seed with some data first
    pushMessage(makeMsg("msg-1"));
    pushAlert(makeMsg("alert-1", { matched: true }));

    // DB returns nothing on reheat
    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([]);

    await reheatMessageBuffers();

    expect(getRecentMessages()).toHaveLength(0);
    expect(getRecentAlerts()).toHaveLength(0);
  });

  it("restores alert metadata correctly after reheat", async () => {
    initMessageBuffers(10, 10);

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([
      makeAlertRow("a1", "UAL", "text"),
      makeAlertRow("a2", "ABC123", "icao"),
    ]);
    mockEnrichMessage.mockImplementation((msg: Record<string, unknown>) => ({
      ...msg,
      matched: false,
    }));

    await reheatMessageBuffers();

    const alerts = getRecentAlerts();
    const textAlert = alerts.find((m) => m.uid === "a1");
    const icaoAlert = alerts.find((m) => m.uid === "a2");

    expect(textAlert?.matched).toBe(true);
    expect(textAlert?.matched_text).toEqual(["UAL"]);
    expect(icaoAlert?.matched).toBe(true);
    expect(icaoAlert?.matched_icao).toEqual(["ABC123"]);
  });

  it("calls grabMostRecent and searchAlerts during reheat", async () => {
    initMessageBuffers();

    mockGrabMostRecent.mockReturnValue([]);
    mockSearchAlerts.mockReturnValue([]);

    // Clear call counts from any prior warmup
    mockGrabMostRecent.mockClear();
    mockSearchAlerts.mockClear();

    await reheatMessageBuffers();

    expect(mockGrabMostRecent).toHaveBeenCalledTimes(1);
    expect(mockSearchAlerts).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

describe("regression", () => {
  it("getRecentMessages does NOT call grabMostRecent", () => {
    initMessageBuffers();
    pushMessage(makeMsg("uid-1"));

    mockGrabMostRecent.mockClear();
    getRecentMessages();

    expect(mockGrabMostRecent).not.toHaveBeenCalled();
  });

  it("getRecentAlerts does NOT call searchAlerts", () => {
    initMessageBuffers();
    pushAlert(makeMsg("uid-1", { matched: true }));

    mockSearchAlerts.mockClear();
    getRecentAlerts();

    expect(mockSearchAlerts).not.toHaveBeenCalled();
  });

  it("getRecentMessages does NOT call enrichMessage", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1");
    pushMessage(msg);

    mockEnrichMessage.mockClear();
    getRecentMessages();

    expect(mockEnrichMessage).not.toHaveBeenCalled();
  });

  it("getRecentAlerts does NOT call enrichMessage", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1", { matched: true });
    pushAlert(msg);

    mockEnrichMessage.mockClear();
    getRecentAlerts();

    expect(mockEnrichMessage).not.toHaveBeenCalled();
  });

  it("pushMessage with undefined uid does not crash", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1");
    delete (msg as unknown as Record<string, unknown>).uid;
    expect(() => pushMessage(msg)).not.toThrow();
  });

  it("pushAlert dedup handles messages with undefined uid without crashing", () => {
    initMessageBuffers();
    const msg = makeMsg("uid-1", { matched: true });
    delete (msg as unknown as Record<string, unknown>).uid;
    expect(() => pushAlert(msg)).not.toThrow();
  });

  it("regression: initMessageBuffers second call does not wipe messages pushed by first init", () => {
    initMessageBuffers();
    pushMessage(makeMsg("uid-should-survive"));

    // Calling init again should be a no-op (not wipe existing buffer)
    initMessageBuffers();

    const result = getRecentMessages();
    expect(result.map((m) => m.uid)).toContain("uid-should-survive");
  });
});

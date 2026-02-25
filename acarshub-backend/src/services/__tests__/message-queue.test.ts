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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageQueue } from "../message-queue.js";

describe("MessageQueue", () => {
  let queue: MessageQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new MessageQueue(15);
  });

  afterEach(() => {
    queue.destroy();
    vi.useRealTimers();
  });

  describe("Basic Operations", () => {
    it("should add messages to queue", () => {
      queue.push("ACARS", { test: "data" });
      expect(queue.length).toBe(1);
      expect(queue.isEmpty).toBe(false);
    });

    it("should pop messages in FIFO order", () => {
      queue.push("ACARS", { id: 1 });
      queue.push("VDLM2", { id: 2 });
      queue.push("HFDL", { id: 3 });

      const msg1 = queue.pop();
      const msg2 = queue.pop();
      const msg3 = queue.pop();

      expect(msg1?.type).toBe("ACARS");
      expect(msg1?.data).toEqual({ id: 1 });
      expect(msg2?.type).toBe("VDLM2");
      expect(msg2?.data).toEqual({ id: 2 });
      expect(msg3?.type).toBe("HFDL");
      expect(msg3?.data).toEqual({ id: 3 });
    });

    it("should return null when popping from empty queue", () => {
      const result = queue.pop();
      expect(result).toBeNull();
    });

    it("should check if queue is empty", () => {
      expect(queue.isEmpty).toBe(true);
      queue.push("ACARS", { test: true });
      expect(queue.isEmpty).toBe(false);
    });

    it("should get current queue length", () => {
      expect(queue.length).toBe(0);
      queue.push("ACARS", { test: 1 });
      expect(queue.length).toBe(1);
      queue.push("VDLM2", { test: 2 });
      expect(queue.length).toBe(2);
    });

    it("should pop all messages at once", () => {
      queue.push("ACARS", { id: 1 });
      queue.push("VDLM2", { id: 2 });
      queue.push("HFDL", { id: 3 });

      const messages = queue.popAll();
      expect(messages).toHaveLength(3);
      expect(queue.isEmpty).toBe(true);
      expect(messages[0].type).toBe("ACARS");
      expect(messages[1].type).toBe("VDLM2");
      expect(messages[2].type).toBe("HFDL");
    });
  });

  describe("Queue Capacity", () => {
    it("should respect max size", () => {
      const smallQueue = new MessageQueue(3);

      smallQueue.push("ACARS", { id: 1 });
      smallQueue.push("VDLM2", { id: 2 });
      smallQueue.push("HFDL", { id: 3 });
      smallQueue.push("IMSL", { id: 4 }); // Should drop oldest

      expect(smallQueue.length).toBe(3);

      const messages = smallQueue.popAll();
      expect(messages[0].data).toEqual({ id: 2 }); // First message dropped
      expect(messages[1].data).toEqual({ id: 3 });
      expect(messages[2].data).toEqual({ id: 4 });

      smallQueue.destroy();
    });

    it("should emit overflow event when queue is full", () => {
      const smallQueue = new MessageQueue(2);

      let overflowCount = 0;
      smallQueue.on("overflow", (count) => {
        overflowCount = count;
      });

      smallQueue.push("ACARS", { id: 1 });
      smallQueue.push("VDLM2", { id: 2 });
      smallQueue.push("HFDL", { id: 3 }); // Triggers overflow

      expect(overflowCount).toBe(1);

      smallQueue.destroy();
    });
  });

  describe("Event Emission", () => {
    it("should emit message event when pushing", () => {
      const messages: Array<{ type: string; data: unknown }> = [];

      queue.on("message", (msg) => {
        messages.push({ type: msg.type, data: msg.data });
      });

      queue.push("ACARS", { test: "data" });
      queue.push("VDLM2", { test: "data2" });

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe("ACARS");
      expect(messages[1].type).toBe("VDLM2");
    });

    it("should include timestamp in queued messages", () => {
      let capturedMessage:
        | { type: string; data: unknown; timestamp: number }
        | undefined;

      queue.on("message", (msg) => {
        capturedMessage = msg;
      });

      const beforePush = Date.now();
      queue.push("ACARS", { test: true });
      const afterPush = Date.now();

      expect(capturedMessage).toBeDefined();
      expect(capturedMessage?.timestamp).toBeGreaterThanOrEqual(beforePush);
      expect(capturedMessage?.timestamp).toBeLessThanOrEqual(afterPush);
    });
  });

  describe("Statistics Tracking", () => {
    it("should track ACARS message counts", () => {
      queue.push("ACARS", { test: 1 });
      queue.push("ACARS", { test: 2 });

      const stats = queue.getStats();
      expect(stats.acars.lastMinute).toBe(2);
      expect(stats.acars.total).toBe(2);
    });

    it("should track VDLM2 message counts", () => {
      queue.push("VDLM2", { test: 1 });
      queue.push("VDLM2", { test: 2 });
      queue.push("VDLM2", { test: 3 });

      const stats = queue.getStats();
      expect(stats.vdlm2.lastMinute).toBe(3);
      expect(stats.vdlm2.total).toBe(3);
    });

    it("should track HFDL message counts", () => {
      queue.push("HFDL", { test: 1 });

      const stats = queue.getStats();
      expect(stats.hfdl.lastMinute).toBe(1);
      expect(stats.hfdl.total).toBe(1);
    });

    it("should track IMSL message counts", () => {
      queue.push("IMSL", { test: 1 });
      queue.push("IMSL", { test: 2 });

      const stats = queue.getStats();
      expect(stats.imsl.lastMinute).toBe(2);
      expect(stats.imsl.total).toBe(2);
    });

    it("should track IRDM message counts", () => {
      queue.push("IRDM", { test: 1 });

      const stats = queue.getStats();
      expect(stats.irdm.lastMinute).toBe(1);
      expect(stats.irdm.total).toBe(1);
    });

    it("should track error counts from message data", () => {
      queue.push("ACARS", { error: 2 });
      queue.push("VDLM2", { error: 1 });

      const stats = queue.getStats();
      expect(stats.error.lastMinute).toBe(3);
      expect(stats.error.total).toBe(3);
    });

    it("should track mixed message types", () => {
      queue.push("ACARS", { id: 1 });
      queue.push("VDLM2", { id: 2 });
      queue.push("HFDL", { id: 3 });
      queue.push("ACARS", { id: 4 });

      const stats = queue.getStats();
      expect(stats.acars.total).toBe(2);
      expect(stats.vdlm2.total).toBe(1);
      expect(stats.hfdl.total).toBe(1);
      expect(stats.imsl.total).toBe(0);
      expect(stats.irdm.total).toBe(0);
    });

    it("should not track errors if error field is zero", () => {
      queue.push("ACARS", { error: 0 });

      const stats = queue.getStats();
      expect(stats.error.lastMinute).toBe(0);
      expect(stats.error.total).toBe(0);
    });

    it("should not track errors if error field is missing", () => {
      queue.push("ACARS", { data: "test" });

      const stats = queue.getStats();
      expect(stats.error.lastMinute).toBe(0);
      expect(stats.error.total).toBe(0);
    });
  });

  describe("Statistics Reset", () => {
    it("should reset per-minute stats", () => {
      queue.push("ACARS", { test: 1 });
      queue.push("VDLM2", { test: 2 });

      const statsBefore = queue.getStats();
      expect(statsBefore.acars.lastMinute).toBe(1);
      expect(statsBefore.vdlm2.lastMinute).toBe(1);

      queue.resetMinuteStats();

      const statsAfter = queue.getStats();
      expect(statsAfter.acars.lastMinute).toBe(0);
      expect(statsAfter.vdlm2.lastMinute).toBe(0);

      // Total stats should not be reset
      expect(statsAfter.acars.total).toBe(1);
      expect(statsAfter.vdlm2.total).toBe(1);
    });

    it("should reset per-minute stats when resetMinuteStats is called by stats-writer", () => {
      // The auto-reset timer has been removed from MessageQueue.
      // Per-minute counters are now reset by stats-writer.ts immediately
      // after each timeseries write, eliminating the race condition where
      // the queue reset could fire before the write and produce zeros.
      queue.push("ACARS", { test: 1 });

      const statsBefore = queue.getStats();
      expect(statsBefore.acars.lastMinute).toBe(1);
      expect(statsBefore.acars.total).toBe(1);

      // Advancing time does NOT reset counters — stats-writer owns the reset
      vi.advanceTimersByTime(60000);

      const statsAfterTime = queue.getStats();
      expect(statsAfterTime.acars.lastMinute).toBe(1); // still 1, no auto-reset

      // Explicit call (as stats-writer does after each write) resets lastMinute
      queue.resetMinuteStats();

      const statsAfterReset = queue.getStats();
      expect(statsAfterReset.acars.lastMinute).toBe(0);
      expect(statsAfterReset.acars.total).toBe(1); // total is never reset by resetMinuteStats
    });

    it("should clear all statistics", () => {
      queue.push("ACARS", { test: 1 });
      queue.push("VDLM2", { test: 2 });
      queue.push("HFDL", { test: 3 });

      queue.clearStats();

      const stats = queue.getStats();
      expect(stats.acars.total).toBe(0);
      expect(stats.vdlm2.total).toBe(0);
      expect(stats.hfdl.total).toBe(0);
      expect(stats.acars.lastMinute).toBe(0);
      expect(stats.vdlm2.lastMinute).toBe(0);
      expect(stats.hfdl.lastMinute).toBe(0);
    });
  });

  describe("Statistics Immutability", () => {
    it("should return a copy of statistics", () => {
      queue.push("ACARS", { test: 1 });

      const stats1 = queue.getStats();
      const stats2 = queue.getStats();

      // Should be different objects
      expect(stats1).not.toBe(stats2);

      // But with same values
      expect(stats1.acars.total).toBe(stats2.acars.total);

      // Modifying returned stats should not affect internal state
      stats1.acars.total = 999;

      const stats3 = queue.getStats();
      expect(stats3.acars.total).toBe(1); // Still original value
    });
  });

  describe("Cleanup", () => {
    it("should destroy queue and clear resources", () => {
      queue.push("ACARS", { test: 1 });
      queue.push("VDLM2", { test: 2 });

      expect(queue.length).toBe(2);

      queue.destroy();

      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });

    it("should stop statistics reset timer on destroy", () => {
      queue.push("ACARS", { test: 1 });

      const statsBefore = queue.getStats();
      expect(statsBefore.acars.total).toBe(1);

      queue.destroy();

      // After destroy, queue is cleared but stats remain
      const stats = queue.getStats();
      expect(stats.acars.total).toBe(1); // Stats are not cleared by destroy()
      expect(queue.length).toBe(0); // But queue is cleared
    });

    it("should remove all event listeners on destroy", () => {
      let messageCount = 0;
      queue.on("message", () => {
        messageCount++;
      });

      queue.push("ACARS", { test: 1 });
      expect(messageCount).toBe(1);

      queue.destroy();

      // Create new queue and push (old listeners should not fire)
      queue = new MessageQueue(15);
      queue.push("ACARS", { test: 2 });

      expect(messageCount).toBe(1); // Still 1, not 2
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-object message data", () => {
      queue.push("ACARS", "string data");
      queue.push("VDLM2", 12345);
      queue.push("HFDL", null);

      expect(queue.length).toBe(3);

      const msg1 = queue.pop();
      expect(msg1?.data).toBe("string data");
    });

    it("should handle message data with non-number error field", () => {
      queue.push("ACARS", { error: "not a number" });

      const stats = queue.getStats();
      expect(stats.error.total).toBe(0);
    });

    it("should handle very large error counts", () => {
      queue.push("ACARS", { error: 1000000 });

      const stats = queue.getStats();
      expect(stats.error.total).toBe(1000000);
    });

    it("should handle negative error counts", () => {
      queue.push("ACARS", { error: -5 });

      const stats = queue.getStats();
      // Negative errors are filtered out (only positive errors counted)
      expect(stats.error.total).toBe(0);
    });
  });

  describe("Performance", () => {
    it("should handle high message volume", () => {
      const largeQueue = new MessageQueue(10000);

      // Push 10,000 messages
      for (let i = 0; i < 10000; i++) {
        largeQueue.push("ACARS", { id: i });
      }

      expect(largeQueue.length).toBe(10000);

      const stats = largeQueue.getStats();
      expect(stats.acars.total).toBe(10000);

      largeQueue.destroy();
    });

    it("should efficiently pop all messages", () => {
      for (let i = 0; i < 1000; i++) {
        queue.push("ACARS", { id: i });
      }

      const messages = queue.popAll();
      expect(messages).toHaveLength(15); // Queue max size is 15
      expect(queue.isEmpty).toBe(true);
    });
  });
});

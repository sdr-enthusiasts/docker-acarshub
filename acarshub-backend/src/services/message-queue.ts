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

import { EventEmitter } from "node:events";
import { createLogger } from "../utils/logger.js";
import type { MessageType } from "./tcp-listener.js";

const logger = createLogger("message-queue");

export interface QueuedMessage {
  type: MessageType;
  data: unknown;
  timestamp: number;
}

export interface MessageStatistics {
  acars: {
    lastMinute: number;
    total: number;
  };
  vdlm2: {
    lastMinute: number;
    total: number;
  };
  hfdl: {
    lastMinute: number;
    total: number;
  };
  imsl: {
    lastMinute: number;
    total: number;
  };
  irdm: {
    lastMinute: number;
    total: number;
  };
  error: {
    lastMinute: number;
    total: number;
  };
}

export interface MessageQueueEvents {
  message: [message: QueuedMessage];
  overflow: [droppedCount: number];
}

/**
 * Thread-safe message queue with statistics tracking
 *
 * Features:
 * - Fixed-size FIFO queue (oldest dropped when full)
 * - Per-message-type statistics (last minute + total)
 * - Error message counting
 * - Event emission for downstream processing
 *
 * Statistics are reset every minute for "lastMinute" counters
 */
export class MessageQueue extends EventEmitter<MessageQueueEvents> {
  private queue: QueuedMessage[] = [];
  private maxSize: number;
  private stats: MessageStatistics = {
    acars: { lastMinute: 0, total: 0 },
    vdlm2: { lastMinute: 0, total: 0 },
    hfdl: { lastMinute: 0, total: 0 },
    imsl: { lastMinute: 0, total: 0 },
    irdm: { lastMinute: 0, total: 0 },
    error: { lastMinute: 0, total: 0 },
  };
  private resetInterval: NodeJS.Timeout | null = null;

  constructor(maxSize = 15) {
    super();
    this.maxSize = maxSize;

    // Reset per-minute counters every 60 seconds
    this.startStatsReset();
  }

  /**
   * Add a message to the queue
   * Updates statistics and emits 'message' event
   */
  public push(type: MessageType, data: unknown): void {
    const message: QueuedMessage = {
      type,
      data,
      timestamp: Date.now(),
    };

    // Update statistics
    this.incrementStats(type, data);

    // Add to queue (remove oldest if at capacity)
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        logger.debug("Queue full, dropped oldest message", {
          droppedType: dropped.type,
          queueSize: this.queue.length,
        });
        this.emit("overflow", 1);
      }
    }

    this.queue.push(message);

    // Emit for downstream processing
    this.emit("message", message);
  }

  /**
   * Get next message from queue (FIFO)
   * Returns null if queue is empty
   */
  public pop(): QueuedMessage | null {
    return this.queue.shift() ?? null;
  }

  /**
   * Get all messages and clear queue
   */
  public popAll(): QueuedMessage[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }

  /**
   * Get current queue length
   */
  public get length(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  public get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get current statistics
   */
  public getStats(): MessageStatistics {
    return {
      acars: { ...this.stats.acars },
      vdlm2: { ...this.stats.vdlm2 },
      hfdl: { ...this.stats.hfdl },
      imsl: { ...this.stats.imsl },
      irdm: { ...this.stats.irdm },
      error: { ...this.stats.error },
    };
  }

  /**
   * Reset per-minute statistics
   */
  public resetMinuteStats(): void {
    this.stats.acars.lastMinute = 0;
    this.stats.vdlm2.lastMinute = 0;
    this.stats.hfdl.lastMinute = 0;
    this.stats.imsl.lastMinute = 0;
    this.stats.irdm.lastMinute = 0;
    this.stats.error.lastMinute = 0;

    logger.debug("Per-minute statistics reset");
  }

  /**
   * Clear all statistics
   */
  public clearStats(): void {
    this.stats = {
      acars: { lastMinute: 0, total: 0 },
      vdlm2: { lastMinute: 0, total: 0 },
      hfdl: { lastMinute: 0, total: 0 },
      imsl: { lastMinute: 0, total: 0 },
      irdm: { lastMinute: 0, total: 0 },
      error: { lastMinute: 0, total: 0 },
    };

    logger.info("All statistics cleared");
  }

  /**
   * Stop statistics reset timer
   */
  public destroy(): void {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }

    this.queue = [];
    this.removeAllListeners();

    logger.debug("Message queue destroyed");
  }

  /**
   * Increment statistics for a message type
   */
  private incrementStats(type: MessageType, data: unknown): void {
    const typeKey = type.toLowerCase() as keyof Omit<
      MessageStatistics,
      "error"
    >;

    // Increment message type counters
    if (typeKey in this.stats) {
      this.stats[typeKey].lastMinute++;
      this.stats[typeKey].total++;
    }

    // Check for error field in message data
    if (this.isMessageWithError(data)) {
      const errorCount = data.error;
      if (errorCount > 0) {
        this.stats.error.lastMinute += errorCount;
        this.stats.error.total += errorCount;
      }
    }
  }

  /**
   * Type guard to check if data has an error field
   */
  private isMessageWithError(data: unknown): data is { error: number } {
    return (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "number"
    );
  }

  /**
   * Start automatic statistics reset every minute
   */
  private startStatsReset(): void {
    // Reset at the top of each minute (aligned to :00 seconds)
    const now = Date.now();
    const nextMinute = Math.ceil(now / 60000) * 60000;
    const delayToNextMinute = nextMinute - now;

    // Schedule first reset at next minute boundary
    setTimeout(() => {
      this.resetMinuteStats();

      // Then reset every 60 seconds
      this.resetInterval = setInterval(() => {
        this.resetMinuteStats();
      }, 60000);
    }, delayToNextMinute);

    logger.debug("Statistics reset timer started", {
      nextResetIn: delayToNextMinute,
    });
  }
}

/**
 * Singleton message queue instance
 */
let messageQueueInstance: MessageQueue | null = null;

/**
 * Get or create the singleton message queue
 */
export function getMessageQueue(maxSize = 15): MessageQueue {
  if (!messageQueueInstance) {
    messageQueueInstance = new MessageQueue(maxSize);
  }
  return messageQueueInstance;
}

/**
 * Destroy the singleton message queue
 */
export function destroyMessageQueue(): void {
  if (messageQueueInstance) {
    messageQueueInstance.destroy();
    messageQueueInstance = null;
  }
}

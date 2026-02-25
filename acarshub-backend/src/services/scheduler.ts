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

const logger = createLogger("scheduler");

export type ScheduleUnit = "seconds" | "minutes" | "hours";

export interface ScheduledTask {
  id: string;
  name: string;
  handler: () => void | Promise<void>;
  interval: number;
  unit: ScheduleUnit;
  lastRun: number | null;
  nextRun: number;
  enabled: boolean;
}

export interface SchedulerEvents {
  taskStart: [taskId: string, taskName: string];
  taskComplete: [taskId: string, taskName: string, duration: number];
  taskError: [taskId: string, taskName: string, error: Error];
}

/**
 * Task scheduler for periodic background jobs
 *
 * Features:
 * - Cron-like scheduling with seconds/minutes/hours intervals
 * - At-time scheduling (e.g., every minute at :00, :30 seconds)
 * - Safe error handling (errors don't crash scheduler)
 * - Task enable/disable
 * - Event emission for monitoring
 *
 * Unlike Python's schedule library, this uses setInterval for simplicity.
 * For production cron-like behavior, consider using node-cron.
 */
export class Scheduler extends EventEmitter<SchedulerEvents> {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private taskCounter = 0;

  /**
   * Schedule a task to run at regular intervals
   *
   * @example
   * scheduler.every(30, "seconds").do(emitStatus);
   * scheduler.every(1, "minutes").do(updateStats);
   * scheduler.every(6, "hours").do(optimizeDb);
   */
  public every(
    interval: number,
    unit: ScheduleUnit,
  ): {
    do: (handler: () => void | Promise<void>, name?: string) => string;
    at: (time: string) => {
      do: (handler: () => void | Promise<void>, name?: string) => string;
    };
  } {
    return {
      do: (handler: () => void | Promise<void>, name?: string): string => {
        return this.scheduleTask(interval, unit, handler, name);
      },
      at: (
        time: string,
      ): {
        do: (handler: () => void | Promise<void>, name?: string) => string;
      } => {
        return {
          do: (handler: () => void | Promise<void>, name?: string): string => {
            return this.scheduleTaskAt(interval, unit, time, handler, name);
          },
        };
      },
    };
  }

  /**
   * Start the scheduler
   * Begins executing all scheduled tasks
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("Scheduler already running");
      return;
    }

    this.isRunning = true;
    logger.info("Scheduler started", {
      taskCount: this.tasks.size,
    });

    // Start all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.startTask(task);
      }
    }
  }

  /**
   * Stop the scheduler
   * Cancels all running tasks
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping scheduler", {
      taskCount: this.tasks.size,
    });

    this.isRunning = false;

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    logger.info("Scheduler stopped");
  }

  /**
   * Enable a task by ID
   */
  public enableTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn("Task not found", { taskId });
      return;
    }

    if (task.enabled) {
      logger.debug("Task already enabled", { taskId, taskName: task.name });
      return;
    }

    task.enabled = true;

    if (this.isRunning) {
      this.startTask(task);
    }

    logger.info("Task enabled", { taskId, taskName: task.name });
  }

  /**
   * Disable a task by ID
   */
  public disableTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn("Task not found", { taskId });
      return;
    }

    if (!task.enabled) {
      logger.debug("Task already disabled", { taskId, taskName: task.name });
      return;
    }

    task.enabled = false;

    // Stop the timer
    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }

    logger.info("Task disabled", { taskId, taskName: task.name });
  }

  /**
   * Remove a task by ID
   */
  public removeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn("Task not found", { taskId });
      return;
    }

    // Stop the timer
    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }

    this.tasks.delete(taskId);

    logger.info("Task removed", { taskId, taskName: task.name });
  }

  /**
   * Get all scheduled tasks
   */
  public getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get a task by ID
   */
  public getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Manually trigger a task execution
   */
  public async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    await this.executeTask(task);
  }

  /**
   * Schedule a task at regular intervals
   */
  private scheduleTask(
    interval: number,
    unit: ScheduleUnit,
    handler: () => void | Promise<void>,
    name?: string,
  ): string {
    const taskId = `task_${++this.taskCounter}`;
    const taskName = name ?? taskId;

    const task: ScheduledTask = {
      id: taskId,
      name: taskName,
      handler,
      interval,
      unit,
      lastRun: null,
      nextRun: Date.now() + this.getIntervalMs(interval, unit),
      enabled: true,
    };

    this.tasks.set(taskId, task);

    if (this.isRunning) {
      this.startTask(task);
    }

    logger.info("Task scheduled", {
      taskId,
      taskName,
      interval,
      unit,
    });

    return taskId;
  }

  /**
   * Schedule a task at a specific time within the interval
   *
   * @example
   * scheduler.every(1, "minutes").at(":00").do(task); // Every minute at :00 seconds
   * scheduler.every(1, "minutes").at(":30").do(task); // Every minute at :30 seconds
   */
  private scheduleTaskAt(
    interval: number,
    unit: ScheduleUnit,
    time: string,
    handler: () => void | Promise<void>,
    name?: string,
  ): string {
    const taskId = `task_${++this.taskCounter}`;
    const taskName = name ?? taskId;

    // Parse time string (e.g., ":00", ":30", ":45")
    const seconds = this.parseAtTime(time);

    // Calculate next run time aligned to the specified seconds
    const now = Date.now();
    const nextRun = this.getNextAlignedTime(now, seconds);

    const task: ScheduledTask = {
      id: taskId,
      name: taskName,
      handler,
      interval,
      unit,
      lastRun: null,
      nextRun,
      enabled: true,
    };

    this.tasks.set(taskId, task);

    if (this.isRunning) {
      this.startTaskAt(task);
    }

    logger.info("Task scheduled with at-time", {
      taskId,
      taskName,
      interval,
      unit,
      atTime: time,
      nextRun: new Date(nextRun).toISOString(),
    });

    return taskId;
  }

  /**
   * Start a task timer
   */
  private startTask(task: ScheduledTask): void {
    const intervalMs = this.getIntervalMs(task.interval, task.unit);

    const timer = setInterval(async () => {
      await this.executeTask(task);
    }, intervalMs);

    this.timers.set(task.id, timer);

    logger.debug("Task timer started", {
      taskId: task.id,
      taskName: task.name,
      intervalMs,
    });
  }

  /**
   * Start a task timer with at-time alignment
   */
  private startTaskAt(task: ScheduledTask): void {
    const intervalMs = this.getIntervalMs(task.interval, task.unit);
    const now = Date.now();
    const delayToFirstRun = task.nextRun - now;

    // Schedule first run at aligned time
    setTimeout(async () => {
      await this.executeTask(task);

      // Then run at regular intervals
      const timer = setInterval(async () => {
        await this.executeTask(task);
      }, intervalMs);

      this.timers.set(task.id, timer);
    }, delayToFirstRun);

    logger.debug("Task timer started with at-time", {
      taskId: task.id,
      taskName: task.name,
      delayToFirstRun,
      intervalMs,
    });
  }

  /**
   * Execute a task handler with error handling
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();

    try {
      this.emit("taskStart", task.id, task.name);

      logger.debug("Task executing", {
        taskId: task.id,
        taskName: task.name,
      });

      await task.handler();

      const duration = Date.now() - startTime;

      task.lastRun = startTime;
      task.nextRun = Date.now() + this.getIntervalMs(task.interval, task.unit);

      this.emit("taskComplete", task.id, task.name, duration);

      logger.debug("Task completed", {
        taskId: task.id,
        taskName: task.name,
        duration,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      logger.error("Task execution failed", {
        taskId: task.id,
        taskName: task.name,
        error: error.message,
        stack: error.stack,
      });

      this.emit("taskError", task.id, task.name, error);
    }
  }

  /**
   * Convert interval to milliseconds
   */
  private getIntervalMs(interval: number, unit: ScheduleUnit): number {
    switch (unit) {
      case "seconds":
        return interval * 1000;
      case "minutes":
        return interval * 60 * 1000;
      case "hours":
        return interval * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid schedule unit: ${unit}`);
    }
  }

  /**
   * Parse at-time string (e.g., ":00", ":30", ":45")
   * Returns seconds within the minute
   */
  private parseAtTime(time: string): number {
    if (!time.startsWith(":")) {
      throw new Error(`Invalid at-time format: ${time} (expected :SS)`);
    }

    const seconds = Number.parseInt(time.slice(1), 10);

    if (Number.isNaN(seconds) || seconds < 0 || seconds >= 60) {
      throw new Error(`Invalid at-time seconds: ${time} (expected :00 to :59)`);
    }

    return seconds;
  }

  /**
   * Calculate next run time aligned to specific seconds
   */
  private getNextAlignedTime(now: number, targetSeconds: number): number {
    const currentDate = new Date(now);
    const currentSeconds = currentDate.getSeconds();

    // Calculate time to next target seconds
    let delaySeconds = targetSeconds - currentSeconds;
    if (delaySeconds <= 0) {
      delaySeconds += 60;
    }

    return now + delaySeconds * 1000;
  }
}

/**
 * Singleton scheduler instance
 */
let schedulerInstance: Scheduler | null = null;

/**
 * Get or create the singleton scheduler
 */
export function getScheduler(): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
  }
  return schedulerInstance;
}

/**
 * Destroy the singleton scheduler
 */
export function destroyScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance.removeAllListeners();
    schedulerInstance = null;
  }
}

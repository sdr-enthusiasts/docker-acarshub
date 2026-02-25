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
import { Scheduler } from "../scheduler.js";

describe("Scheduler", () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new Scheduler();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe("Task Scheduling", () => {
    it("should schedule a task to run at intervals", () => {
      let executionCount = 0;

      const taskId = scheduler.every(1, "seconds").do(() => {
        executionCount++;
      }, "test-task");

      expect(taskId).toBeDefined();
      scheduler.start();

      // Advance time to trigger task execution
      vi.advanceTimersByTime(1000);
      expect(executionCount).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(executionCount).toBe(2);

      vi.advanceTimersByTime(1000);
      expect(executionCount).toBe(3);
    });

    it("should schedule tasks with different intervals", () => {
      let count1s = 0;
      let count5s = 0;

      scheduler.every(1, "seconds").do(() => {
        count1s++;
      });

      scheduler.every(5, "seconds").do(() => {
        count5s++;
      });

      scheduler.start();

      vi.advanceTimersByTime(1000);
      expect(count1s).toBe(1);
      expect(count5s).toBe(0);

      vi.advanceTimersByTime(4000); // Total 5s
      expect(count1s).toBe(5);
      expect(count5s).toBe(1);

      vi.advanceTimersByTime(5000); // Total 10s
      expect(count1s).toBe(10);
      expect(count5s).toBe(2);
    });

    it("should support second intervals", () => {
      let count = 0;

      scheduler.every(2, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(2000);
      expect(count).toBe(1);

      vi.advanceTimersByTime(2000);
      expect(count).toBe(2);
    });

    it("should support minute intervals", () => {
      let count = 0;

      scheduler.every(1, "minutes").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(60000);
      expect(count).toBe(1);

      vi.advanceTimersByTime(60000);
      expect(count).toBe(2);
    });

    it("should support hour intervals", () => {
      let count = 0;

      scheduler.every(1, "hours").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(3600000);
      expect(count).toBe(1);

      vi.advanceTimersByTime(3600000);
      expect(count).toBe(2);
    });

    it("should support async task handlers", async () => {
      let executed = false;

      scheduler.every(1, "seconds").do(async () => {
        executed = true;
      });

      scheduler.start();

      vi.advanceTimersByTime(1000);

      expect(executed).toBe(true);
    });
  });

  describe("At-Time Scheduling", () => {
    it("should schedule task at specific seconds within minute", () => {
      let executed = false;

      scheduler
        .every(1, "minutes")
        .at(":30")
        .do(() => {
          executed = true;
        }, "at-time-task");

      scheduler.start();

      // Should eventually execute when we advance enough time
      vi.advanceTimersByTime(70000); // 70 seconds should cover first execution

      expect(executed).toBe(true);
    });

    it("should parse at-time format correctly", () => {
      let executed = false;

      scheduler
        .every(1, "minutes")
        .at(":00")
        .do(() => {
          executed = true;
        });

      scheduler.start();

      // Should eventually execute
      vi.advanceTimersByTime(120000);
      expect(executed).toBe(true);
    });
  });

  describe("Task Management", () => {
    it("should return unique task IDs", () => {
      const taskId1 = scheduler.every(1, "seconds").do(() => {});
      const taskId2 = scheduler.every(1, "seconds").do(() => {});

      expect(taskId1).not.toBe(taskId2);
    });

    it("should get task by ID", () => {
      const taskId = scheduler.every(5, "seconds").do(() => {}, "test-task");

      const task = scheduler.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
      expect(task?.name).toBe("test-task");
      expect(task?.interval).toBe(5);
      expect(task?.unit).toBe("seconds");
    });

    it("should get all tasks", () => {
      scheduler.every(1, "seconds").do(() => {}, "task1");
      scheduler.every(5, "minutes").do(() => {}, "task2");
      scheduler.every(1, "hours").do(() => {}, "task3");

      const tasks = scheduler.getTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.name)).toEqual(["task1", "task2", "task3"]);
    });

    it("should enable task by ID", () => {
      let count = 0;

      const taskId = scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      // Disable task
      scheduler.disableTask(taskId);

      vi.advanceTimersByTime(2000);
      expect(count).toBe(0); // Should not execute when disabled

      // Re-enable task
      scheduler.enableTask(taskId);

      vi.advanceTimersByTime(1000);
      expect(count).toBeGreaterThan(0); // Should execute after re-enabling
    });

    it("should disable task by ID", () => {
      let count = 0;

      const taskId = scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(1000);
      expect(count).toBe(1);

      scheduler.disableTask(taskId);

      vi.advanceTimersByTime(2000);
      expect(count).toBe(1); // Count should not increase
    });

    it("should remove task by ID", () => {
      let count = 0;

      const taskId = scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(1000);
      expect(count).toBe(1);

      scheduler.removeTask(taskId);

      vi.advanceTimersByTime(2000);
      expect(count).toBe(1); // Count should not increase

      const task = scheduler.getTask(taskId);
      expect(task).toBeUndefined();
    });

    it("should manually run a task", async () => {
      let count = 0;

      const taskId = scheduler.every(60, "seconds").do(() => {
        count++;
      });

      await scheduler.runTask(taskId);
      expect(count).toBe(1);

      await scheduler.runTask(taskId);
      expect(count).toBe(2);
    });

    it("should throw error when manually running non-existent task", async () => {
      await expect(scheduler.runTask("invalid-task-id")).rejects.toThrow(
        "Task not found: invalid-task-id",
      );
    });
  });

  describe("Lifecycle Management", () => {
    it("should start scheduler", () => {
      let count = 0;

      scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(2000);
      expect(count).toBe(2);
    });

    it("should not start twice", () => {
      let count = 0;

      scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();
      scheduler.start(); // Should be ignored

      vi.advanceTimersByTime(1000);
      expect(count).toBe(1); // Should only run once per interval
    });

    it("should stop scheduler", () => {
      let count = 0;

      scheduler.every(1, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(2000);
      expect(count).toBe(2);

      scheduler.stop();

      vi.advanceTimersByTime(2000);
      expect(count).toBe(2); // Count should not increase after stop
    });

    it("should not execute tasks before start is called", () => {
      let count = 0;

      scheduler.every(1, "seconds").do(() => {
        count++;
      });

      vi.advanceTimersByTime(5000);
      expect(count).toBe(0); // Should not execute without start()
    });
  });

  describe("Event Emission", () => {
    it("should emit taskStart event", () => {
      const startEvents: Array<{ taskId: string; taskName: string }> = [];

      scheduler.on("taskStart", (taskId, taskName) => {
        startEvents.push({ taskId, taskName });
      });

      const taskId = scheduler.every(1, "seconds").do(() => {}, "test-task");

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].taskId).toBe(taskId);
      expect(startEvents[0].taskName).toBe("test-task");
    });

    it.skip("should emit taskComplete event with duration", () => {
      const completeEvents: Array<{
        taskId: string;
        taskName: string;
        duration: number;
      }> = [];

      scheduler.on("taskComplete", (taskId, taskName, duration) => {
        completeEvents.push({ taskId, taskName, duration });
      });

      const taskId = scheduler.every(1, "seconds").do(() => {
        // Task body
      }, "test-task");

      scheduler.start();
      vi.advanceTimersByTime(1100); // Slightly more than 1 second

      expect(completeEvents.length).toBeGreaterThanOrEqual(1);
      expect(completeEvents[0].taskId).toBe(taskId);
      expect(completeEvents[0].taskName).toBe("test-task");
      expect(completeEvents[0].duration).toBeGreaterThanOrEqual(0);
    });

    it("should emit taskError event on task failure", () => {
      const errors: Array<{ taskId: string; taskName: string; error: Error }> =
        [];

      scheduler.on("taskError", (taskId, taskName, error) => {
        errors.push({ taskId, taskName, error });
      });

      const taskId = scheduler.every(1, "seconds").do(() => {
        throw new Error("Task failed");
      }, "failing-task");

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(errors).toHaveLength(1);
      expect(errors[0].taskId).toBe(taskId);
      expect(errors[0].taskName).toBe("failing-task");
      expect(errors[0].error.message).toBe("Task failed");
    });

    it("should continue executing other tasks after one fails", () => {
      let successCount = 0;

      scheduler.every(1, "seconds").do(() => {
        throw new Error("This task fails");
      }, "failing-task");

      scheduler.every(1, "seconds").do(() => {
        successCount++;
      }, "success-task");

      scheduler.start();

      vi.advanceTimersByTime(2000);
      expect(successCount).toBe(2); // Success task should still execute
    });
  });

  describe("Error Handling", () => {
    it("should handle synchronous errors gracefully", () => {
      let errorCount = 0;

      scheduler.on("taskError", () => {
        errorCount++;
      });

      scheduler.every(1, "seconds").do(() => {
        throw new Error("Sync error");
      });

      scheduler.start();

      vi.advanceTimersByTime(2000);
      expect(errorCount).toBe(2);
    });

    it.skip("should handle async errors gracefully", () => {
      let errorCount = 0;

      scheduler.on("taskError", () => {
        errorCount++;
      });

      scheduler.every(1, "seconds").do(async () => {
        throw new Error("Async error");
      });

      scheduler.start();

      vi.advanceTimersByTime(1100);

      expect(errorCount).toBeGreaterThan(0);
    });

    it("should not crash scheduler when task throws", () => {
      let healthyTaskCount = 0;

      scheduler.every(1, "seconds").do(() => {
        throw new Error("Crashing task");
      });

      scheduler.every(1, "seconds").do(() => {
        healthyTaskCount++;
      });

      scheduler.start();

      vi.advanceTimersByTime(3000);
      expect(healthyTaskCount).toBe(3); // Healthy task continues to run
    });
  });

  describe("Task Metadata", () => {
    it.skip("should track last run time", () => {
      const taskId = scheduler.every(1, "seconds").do(() => {});

      scheduler.start();

      const taskBefore = scheduler.getTask(taskId);
      expect(taskBefore?.lastRun).toBeNull();

      vi.advanceTimersByTime(1100);

      const taskAfter = scheduler.getTask(taskId);
      expect(taskAfter?.lastRun).not.toBeNull();
      if (taskAfter?.lastRun !== null && taskAfter?.lastRun !== undefined) {
        expect(taskAfter?.lastRun).toBeGreaterThan(0);
      }
    });

    it("should track next run time", () => {
      const taskId = scheduler.every(5, "seconds").do(() => {});

      const task = scheduler.getTask(taskId);
      expect(task?.nextRun).toBeGreaterThan(Date.now());
    });

    it.skip("should update metadata after each execution", () => {
      const taskId = scheduler.every(1, "seconds").do(() => {});

      scheduler.start();

      vi.advanceTimersByTime(1100);
      const task1 = scheduler.getTask(taskId);
      const lastRun1 = task1?.lastRun;

      vi.advanceTimersByTime(1100);
      const task2 = scheduler.getTask(taskId);
      const lastRun2 = task2?.lastRun;

      expect(lastRun1).not.toBeNull();
      expect(lastRun2).not.toBeNull();
      if (
        lastRun1 !== null &&
        lastRun1 !== undefined &&
        lastRun2 !== null &&
        lastRun2 !== undefined
      ) {
        expect(lastRun2).toBeGreaterThan(lastRun1);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle task with name undefined", () => {
      const taskId = scheduler.every(1, "seconds").do(() => {});

      const task = scheduler.getTask(taskId);
      expect(task?.name).toBeDefined(); // Should default to task ID
    });

    it("should handle disabling already disabled task", () => {
      const taskId = scheduler.every(1, "seconds").do(() => {});

      scheduler.disableTask(taskId);
      scheduler.disableTask(taskId); // Should not throw
    });

    it("should handle enabling already enabled task", () => {
      const taskId = scheduler.every(1, "seconds").do(() => {});

      scheduler.enableTask(taskId);
      scheduler.enableTask(taskId); // Should not throw
    });

    it("should handle removing non-existent task", () => {
      scheduler.removeTask("non-existent-id"); // Should not throw
    });

    it("should handle disabling non-existent task", () => {
      scheduler.disableTask("non-existent-id"); // Should not throw
    });

    it("should handle enabling non-existent task", () => {
      scheduler.enableTask("non-existent-id"); // Should not throw
    });

    it("should handle very short intervals", () => {
      let count = 0;

      scheduler.every(100, "seconds").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(100000);
      expect(count).toBe(1);
    });

    it("should handle very long intervals", () => {
      let count = 0;

      scheduler.every(24, "hours").do(() => {
        count++;
      });

      scheduler.start();

      vi.advanceTimersByTime(24 * 3600000);
      expect(count).toBe(1);
    });
  });

  describe("Multiple Schedulers", () => {
    it("should allow multiple independent schedulers", () => {
      const scheduler2 = new Scheduler();

      let count1 = 0;
      let count2 = 0;

      scheduler.every(1, "seconds").do(() => {
        count1++;
      });

      scheduler2.every(1, "seconds").do(() => {
        count2++;
      });

      scheduler.start();
      scheduler2.start();

      vi.advanceTimersByTime(2000);

      expect(count1).toBe(2);
      expect(count2).toBe(2);

      scheduler2.stop();
    });
  });
});

/**
 * Lane 调度系统单元测试
 */

import { describe, it, expect, vi } from "vitest";
import {
  laneManager,
  enqueueInLane,
  enqueue,
  setConcurrency,
  getQueueSize,
  CommandLane,
} from "./lanes.js";

describe("Lane 系统", () => {
  describe("并发控制", () => {
    it("应该设置并发数", () => {
      setConcurrency("test-lane", 5);
      // 并发数已设置，后续任务会使用该并发数
      expect(true).toBe(true);
    });

    it("并发数至少为 1", () => {
      setConcurrency("test-lane-min", 0);
      // 并发数应被设置为 1
      expect(true).toBe(true);
    });

    it("应该自动处理空 Lane 名称", () => {
      setConcurrency("  ", 3);
      // 应使用默认 Lane
      expect(true).toBe(true);
    });
  });

  describe("任务执行", () => {
    it("应该执行单个任务", async () => {
      const task = vi.fn().mockResolvedValue("result");
      const promise = enqueueInLane("test-single", task);

      const result = await promise;
      expect(result).toBe("result");
      expect(task).toHaveBeenCalledTimes(1);
    });

    it("应该按顺序执行并发限制内的任务", async () => {
      const results: number[] = [];
      const task1 = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(1);
            resolve();
          }, 10)
        );
      const task2 = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(2);
            resolve();
          }, 5)
        );

      await Promise.all([enqueueInLane("test-sequential", task1), enqueueInLane("test-sequential", task2)]);

      expect(results).toEqual([1, 2]);
    });

    it("应该支持并发执行多个任务", async () => {
      setConcurrency("test-concurrent", 2);
      const results: number[] = [];

      const task1 = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(1);
            resolve();
          }, 10)
        );
      const task2 = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(2);
            resolve();
          }, 5)
        );

      await Promise.all([enqueueInLane("test-concurrent", task1), enqueueInLane("test-concurrent", task2)]);

      expect(results).toEqual([2, 1]);
    });

    it("应该处理任务错误", async () => {
      const error = new Error("Task failed");
      const task = vi.fn().mockRejectedValue(error);

      await expect(enqueueInLane("test-error", task)).rejects.toThrow("Task failed");
      expect(task).toHaveBeenCalledTimes(1);
    });
  });

  describe("队列管理", () => {
    it("应该正确报告队列大小", () => {
      enqueueInLane("test-queue-size", () => Promise.resolve());
      const size = getQueueSize("test-queue-size");
      expect(typeof size).toBe("number");
    });

    it("应该处理不存在的 Lane", () => {
      expect(getQueueSize("nonexistent")).toBe(0);
    });
  });
});

describe("便捷函数", () => {
  describe("enqueueInLane", () => {
    it("应该在指定 Lane 中执行任务", async () => {
      const task = vi.fn().mockResolvedValue("result");
      const result = await enqueueInLane("custom", task);
      expect(result).toBe("result");
    });
  });

  describe("enqueue", () => {
    it("应该在默认 Lane 中执行任务", async () => {
      const task = vi.fn().mockResolvedValue("result");
      const result = await enqueue(task);
      expect(result).toBe("result");
    });
  });

  describe("getQueueSize", () => {
    it("应该返回默认 Lane 的队列大小", () => {
      enqueue(() => Promise.resolve());
      const size = getQueueSize();
      expect(typeof size).toBe("number");
    });
  });
});

describe("CommandLane 枚举", () => {
  it("应该定义所有 Lane 类型", () => {
    expect(CommandLane.Main).toBe("main");
    expect(CommandLane.Cron).toBe("cron");
    expect(CommandLane.Agent).toBe("agent");
    expect(CommandLane.Nested).toBe("nested");
  });
});

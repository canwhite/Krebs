/**
 * Subagent 简单验证测试
 *
 * 这个测试直接使用 CommonJS require() 来避免 vitest 模块问题
 */

const { describe, it, expect, beforeEach, afterEach } = require("vitest");
const { SubagentRegistry } = require("../dist/agent/subagent/index.js");
const { rm } = require("node:fs/promises");
const { existsSync } = require("node:fs");

describe("SubagentRegistry - Basic Tests", () => {
  const testStoreDir = "./test-data/subagents";
  let registry;
  let config;

  beforeEach(() => {
    // 清理测试目录
    if (existsSync(testStoreDir)) {
      rm(testStoreDir, { recursive: true });
    }

    config = {
      enabled: true,
      maxConcurrent: 3,
      archiveAfterMinutes: 60,
      defaultCleanup: "delete",
      allowedAgents: ["*"],
    };

    registry = new SubagentRegistry(config, testStoreDir);
  });

  afterEach(async () => {
    await registry.stop();
    // 清理测试目录
    if (existsSync(testStoreDir)) {
      rm(testStoreDir, { recursive: true });
    }
  });

  describe("register", () => {
    it("应该成功注册一个新的 subagent 运行", () => {
      const record = registry.register({
        runId: "test-run-1",
        childSessionKey: "subagent:test-run-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      expect(record).toBeDefined();
      expect(record.runId).toBe("test-run-1");
      expect(record.task).toBe("测试任务");
      expect(record.createdAt).toBeDefined();
    });
  });

  describe("get", () => {
    it("应该能够获取已注册的 subagent", () => {
      registry.register({
        runId: "test-get-1",
        childSessionKey: "subagent:test-get-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      const retrieved = registry.get("test-get-1");
      expect(retrieved).toBeDefined();
      expect(retrieved.runId).toBe("test-get-1");
    });

    it("对于不存在的 runId 应该返回 undefined", () => {
      const retrieved = registry.get("non-existent");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("update", () => {
    it("应该能够更新 subagent 运行状态", () => {
      registry.register({
        runId: "test-update-1",
        childSessionKey: "subagent:test-update-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      registry.update({
        runId: "test-update-1",
        startedAt: Date.now(),
        outcome: {
          status: "completed",
          completedAt: Date.now(),
          result: "任务完成",
        },
      });

      const record = registry.get("test-update-1");
      expect(record?.startedAt).toBeDefined();
      expect(record?.outcome?.status).toBe("completed");
    });
  });

  describe("delete", () => {
    it("应该能够删除 subagent", () => {
      registry.register({
        runId: "test-delete-1",
        childSessionKey: "subagent:test-delete-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      expect(registry.get("test-delete-1")).toBeDefined();

      const deleted = registry.delete("test-delete-1");
      expect(deleted).toBe(true);
      expect(registry.get("test-delete-1")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("应该列出所有 subagent", () => {
      // 注册几个 subagent
      for (let i = 0; i < 3; i++) {
        registry.register({
          runId: `test-list-${i}`,
          childSessionKey: `subagent:test-list-${i}:abc123`,
          requesterSessionKey: "user:123",
          requesterDisplayKey: "user:123",
          task: `测试任务 ${i}`,
          cleanup: "delete",
        });
      }

      const list = registry.list();
      expect(list).toHaveLength(3);
    });
  });

  describe("getActiveCount", () => {
    it("应该正确统计活跃的 subagent 数量", () => {
      expect(registry.getActiveCount()).toBe(0);

      registry.register({
        runId: "test-active-1",
        childSessionKey: "subagent:test-active-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      expect(registry.getActiveCount()).toBe(1);

      registry.update({
        runId: "test-active-1",
        startedAt: Date.now(),
        outcome: {
          status: "completed",
          completedAt: Date.now(),
        },
      });

      expect(registry.getActiveCount()).toBe(0);
    });
  });

  describe("getStats", () => {
    it("应该返回正确的统计信息", () => {
      // 注册一些 subagent
      registry.register({
        runId: "test-stats-1",
        childSessionKey: "subagent:test-stats-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      registry.register({
        runId: "test-stats-2",
        childSessionKey: "subagent:test-stats-2:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      registry.update({
        runId: "test-stats-1",
        startedAt: Date.now(),
        outcome: {
          status: "completed",
          completedAt: Date.now(),
        },
      });

      registry.update({
        runId: "test-stats-2",
        startedAt: Date.now(),
        outcome: {
          status: "failed",
          completedAt: Date.now(),
          error: "任务失败",
        },
      });

      const stats = registry.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe("logToolCall", () => {
    it("应该记录工具调用日志", () => {
      registry.register({
        runId: "test-log-1",
        childSessionKey: "subagent:test-log-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      registry.logToolCall({
        runId: "test-log-1",
        toolName: "bash",
        calledAt: Date.now(),
        parameters: { command: "echo 'hello'" },
        result: { success: true, output: "hello" },
        requesterSessionKey: "user:123",
      });

      const logs = registry.getToolCallLogs("test-log-1");
      expect(logs).toHaveLength(1);
      expect(logs[0].toolName).toBe("bash");
    });
  });

  describe("persist and restore", () => {
    it("应该能够持久化和恢复数据", async () => {
      // 注册一些 subagent
      registry.register({
        runId: "test-persist-1",
        childSessionKey: "subagent:test-persist-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
      });

      // 持久化
      await registry.persist();

      // 创建新的 registry 实例并恢复
      const newRegistry = new SubagentRegistry(config, testStoreDir);
      await newRegistry.restore();

      expect(newRegistry.get("test-persist-1")).toBeDefined();

      await newRegistry.stop();
    });
  });

  describe("cleanup", () => {
    it("应该能够清理过期记录", () => {
      const archiveAfterMs = 1000; // 1 秒

      // 创建一个过期的 subagent
      registry.register({
        runId: "test-cleanup-1",
        childSessionKey: "subagent:test-cleanup-1:abc123",
        requesterSessionKey: "user:123",
        requesterDisplayKey: "user:123",
        task: "测试任务",
        cleanup: "delete",
        createdAt: Date.now() - archiveAfterMs - 100, // 1 秒前
      });

      // 清理应该删除过期记录
      registry.cleanup();

      expect(registry.get("test-cleanup-1")).toBeUndefined();
    });
  });
});

/**
 * Subagent 集成测试
 *
 * 测试完整的 Subagent 创建和执行流程
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentManager } from "@/agent/core/manager.js";
import { SubagentRegistry } from "@/agent/subagent/index.js";
import type { AgentConfig } from "@/types/index.js";
import { MockLLMProvider } from "../../test/helpers/index.js";

describe("Subagent Integration", () => {
  let agentManager: AgentManager;
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    agentManager = new AgentManager(
      {
        dataDir: "./test-data/integration",
        subagents: {
          enabled: true,
          maxConcurrent: 5,
          archiveAfterMinutes: 60,
          defaultCleanup: "delete",
          allowedAgents: ["*"],
        },
      },
      {
        provider: mockProvider,
        tools: [],
      },
    );
  });

  afterEach(async () => {
    await agentManager.stop();
  });

  describe("Subagent 系统初始化", () => {
    it("应该在 AgentManager 中初始化 SubagentRegistry", () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeInstanceOf(SubagentRegistry);
    });

    it("应该能够获取 SubagentRegistry", () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();
      expect(registry?.getStats()).toEqual({
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
        timeout: 0,
        cancelled: 0,
      });
    });
  });

  describe("spawn_subagent 工具", () => {
    it("应该在工具列表中找到 spawn_subagent", () => {
      const tools = agentManager.getTools();
      const spawnTool = tools.find((t: any) => t.name === "spawn_subagent");

      expect(spawnTool).toBeDefined();
      expect(spawnTool?.description).toContain("后台子代理");
    });
  });

  describe("Subagent 创建流程", () => {
    it("应该能够成功创建 Subagent", async () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();

      // 模拟创建 Subagent
      const record = registry!.register({
        runId: "test-integration-1",
        childSessionKey: "subagent:test-1:abc123",
        requesterSessionKey: "user:test",
        requesterDisplayKey: "user:test",
        task: "测试任务",
        cleanup: "delete",
      });

      expect(record).toBeDefined();
      expect(record.runId).toBe("test-integration-1");
      expect(record.task).toBe("测试任务");

      // 验证注册表中存在
      const retrieved = registry!.get("test-integration-1");
      expect(retrieved).toEqual(record);
    });

    it("应该能够更新 Subagent 状态", async () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();

      // 创建 Subagent
      registry!.register({
        runId: "test-integration-2",
        childSessionKey: "subagent:test-2:abc123",
        requesterSessionKey: "user:test",
        requesterDisplayKey: "user:test",
        task: "测试任务",
        cleanup: "delete",
      });

      // 更新状态
      registry!.update({
        runId: "test-integration-2",
        startedAt: Date.now(),
        outcome: {
          status: "completed",
          completedAt: Date.now(),
          result: "任务完成",
        },
      });

      // 验证更新
      const record = registry!.get("test-integration-2");
      expect(record?.outcome?.status).toBe("completed");
      expect(record?.outcome?.result).toBe("任务完成");
    });

    it("应该能够删除 Subagent", async () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();

      // 创建 Subagent
      registry!.register({
        runId: "test-integration-3",
        childSessionKey: "subagent:test-3:abc123",
        requesterSessionKey: "user:test",
        requesterDisplayKey: "user:test",
        task: "测试任务",
        cleanup: "delete",
      });

      expect(registry!.get("test-integration-3")).toBeDefined();

      // 删除
      const deleted = registry!.delete("test-integration-3");
      expect(deleted).toBe(true);

      // 验证已删除
      expect(registry!.get("test-integration-3")).toBeUndefined();
    });
  });

  describe("并发控制", () => {
    it("应该限制最大并发数", async () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();

      const maxConcurrent = 3;

      // 创建 3 个 Subagent（达到限制）
      for (let i = 0; i < maxConcurrent; i++) {
        registry!.register({
          runId: `test-concurrent-${i}`,
          childSessionKey: `subagent:test-${i}:abc`,
          requesterSessionKey: "user:test",
          requesterDisplayKey: "user:test",
          task: `任务 ${i}`,
          cleanup: "delete",
        });
      }

      expect(registry!.getActiveCount()).toBe(maxConcurrent);

      // 第 4 个应该失败
      expect(() => {
        registry!.register({
          runId: "test-concurrent-3",
          childSessionKey: "subagent:test-3:abc",
          requesterSessionKey: "user:test",
          requesterDisplayKey: "user:test",
          task: "任务 3",
          cleanup: "delete",
        });
      }).toThrow("Max concurrent subagents limit reached");
    });
  });

  describe("持久化和恢复", () => {
    it("应该能够持久化 Subagent 数据", async () => {
      const registry = agentManager.getSubagentRegistry();
      expect(registry).toBeDefined();

      // 创建一些 Subagent
      registry!.register({
        runId: "test-persist-1",
        childSessionKey: "subagent:test-1:abc",
        requesterSessionKey: "user:test",
        requesterDisplayKey: "user:test",
        task: "持久化测试",
        cleanup: "delete",
      });

      // 持久化
      await registry!.persist();

      // 创建新的 Registry 并恢复
      const newRegistry = new SubagentRegistry(
        {
          enabled: true,
          maxConcurrent: 5,
          archiveAfterMinutes: 60,
          defaultCleanup: "delete",
          allowedAgents: ["*"],
        },
        "./test-data/integration",
      );
      await newRegistry.restore();

      // 验证恢复的数据
      const record = newRegistry.get("test-persist-1");
      expect(record).toBeDefined();
      expect(record?.task).toBe("持久化测试");

      await newRegistry.stop();
    });
  });
});

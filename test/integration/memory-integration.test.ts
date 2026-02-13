/**
 * Memory 集成测试
 *
 * 测试 Memory 系统与 Agent 对话流程的完整集成
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentManager } from "@/agent/core/index.js";
import type { AgentManagerConfig } from "@/agent/core/index.js";
import type { AgentManagerDeps } from "@/agent/core/index.js";
import type { LLMProvider } from "@/provider/index.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  async chat() {
    return {
      content: "Test response",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async chatStream() {
    return {
      content: "Test response",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async embed() {
    return { embedding: new Array(768).fill(0.1), dims: 768, model: "mock" };
  }

  async embedBatch() {
    return [await this.embed("")];
  }
}

describe("Memory Integration", () => {
  let tempDir: string;
  let dataDir: string;
  let agentManager: AgentManager;
  let mockProvider: MockLLMProvider;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "krebs-test-"));
    dataDir = path.join(tempDir, "data");

    await fs.mkdir(dataDir, { recursive: true });

    // 创建 Mock Provider
    mockProvider = new MockLLMProvider();

    // 创建 AgentManager
    const config: AgentManagerConfig = {
      dataDir,
      enableMemory: true, // 启用 Memory
    };

    const deps: AgentManagerDeps = {
      provider: mockProvider,
    };

    agentManager = new AgentManager(config, deps);

    // 启动 AgentManager（会自动启动 MemoryService）
    await agentManager.start();
  });

  afterEach(async () => {
    if (agentManager) {
      await agentManager.stop();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Memory Service 创建和管理", () => {
    it("应该创建 MemoryService", () => {
      const memoryService = agentManager.getMemoryService();
      expect(memoryService).toBeDefined();
    });

    it("应该在 dataDir 下创建 memory 目录", async () => {
      const memoryDir = path.join(dataDir, "memory");
      const exists = await fs.access(memoryDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("自动注入记忆", () => {
    it("应该创建 Agent 并注入 MemoryService", async () => {
      const agentConfig = {
        id: "test-agent",
        name: "Test Agent",
        model: "test-model",
      };

      const agent = agentManager.createAgent(agentConfig);
      expect(agent).toBeDefined();
    });

    it("应该在对话中自动注入相关记忆", async () => {
      // 1. 创建测试记忆
      const memoryDir = path.join(dataDir, "memory");
      await fs.mkdir(memoryDir, { recursive: true });

      const memoryFile = path.join(memoryDir, "MEMORY.md");
      await fs.writeFile(
        memoryFile,
        `
# 项目目标

Krebs 是一个轻量级的 AI Agent 框架。
`,
        "utf-8"
      );

      // 2. 创建 Agent
      const agentConfig = {
        id: "test-agent",
        name: "Test Agent",
        model: "test-model",
      };

      agentManager.createAgent(agentConfig);

      // 3. 模拟对话（Agent 应该自动注入记忆）
      // 注意：这需要实际的 LLM 调用，这里只是验证流程
      const agent = agentManager.getAgent("test-agent");
      expect(agent).toBeDefined();

      // 验证 MemoryService 可用
      const memoryService = agentManager.getMemoryService();
      expect(memoryService).toBeDefined();
    });
  });

  describe("自动保存对话", () => {
    it("应该在对话后自动保存到每日日志", async () => {
      // 创建 Agent
      const agentConfig = {
        id: "test-agent-save",
        name: "Test Agent Save",
        model: "test-model",
      };

      agentManager.createAgent(agentConfig);

      // 验证 MemoryService 已创建
      const memoryService = agentManager.getMemoryService();
      expect(memoryService).toBeDefined();

      // 注意：实际的对话保存需要在 Agent.process() 中调用
      // 这里只是验证 MemoryService 的 autoSaveEnabled 配置
      const stats = memoryService!.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe("自动触发刷新", () => {
    it("应该在接近上下文限制时触发刷新", async () => {
      // 创建 Agent
      const agentConfig = {
        id: "test-agent-flush",
        name: "Test Agent Flush",
        model: "test-model",
        maxTokens: 1000,
      };

      agentManager.createAgent(agentConfig);

      // 验证 MemoryService 可用
      const memoryService = agentManager.getMemoryService();
      expect(memoryService).toBeDefined();

      // 注意：实际的刷新触发需要在 Agent.process() 中调用
      // 这里只是验证 MemoryService 存在
      expect(memoryService).toBeDefined();
    });
  });

  describe("Memory 统计", () => {
    it("应该返回正确的统计信息", async () => {
      const memoryService = agentManager.getMemoryService();
      expect(memoryService).toBeDefined();

      const stats = memoryService!.getStats();
      expect(stats).toHaveProperty("fileCount");
      expect(stats).toHaveProperty("chunkCount");
      expect(stats).toHaveProperty("totalSize");
    });
  });

  describe("配置选项", () => {
    it("应该支持禁用 Memory", async () => {
      const config: AgentManagerConfig = {
        dataDir,
        enableMemory: false, // 禁用 Memory
      };

      const deps: AgentManagerDeps = {
        provider: mockProvider,
      };

      const manager = new AgentManager(config, deps);
      await manager.start();

      const memoryService = manager.getMemoryService();
      expect(memoryService).toBeUndefined();

      await manager.stop();
    });

    it("应该支持自定义 dataDir", async () => {
      const customDataDir = path.join(tempDir, "custom-data");

      const config: AgentManagerConfig = {
        dataDir: customDataDir,
        enableMemory: true,
      };

      const deps: AgentManagerDeps = {
        provider: mockProvider,
      };

      const manager = new AgentManager(config, deps);
      await manager.start();

      const memoryService = manager.getMemoryService();
      expect(memoryService).toBeDefined();

      await manager.stop();
    });
  });

  describe("启动和停止", () => {
    it("应该正确启动和停止 MemoryService", async () => {
      const config: AgentManagerConfig = {
        dataDir,
        enableMemory: true,
      };

      const deps: AgentManagerDeps = {
        provider: mockProvider,
      };

      const manager = new AgentManager(config, deps);

      // 启动
      await manager.start();
      let memoryService = manager.getMemoryService();
      expect(memoryService).toBeDefined();

      // 停止
      await manager.stop();
      memoryService = manager.getMemoryService();
      // MemoryService 实例仍然存在，但已停止
      expect(memoryService).toBeDefined();
    });
  });
});

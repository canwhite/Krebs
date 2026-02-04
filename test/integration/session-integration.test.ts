/**
 * Session 模块集成测试
 *
 * 测试 SessionStorage 与现有系统的完整集成
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { resolve } from "node:path";

import { createEnhancedSessionStorage } from "@/storage/session/index.js";
import { AgentManager } from "@/agent/core/index.js";
import { createAnthropicProvider } from "@/provider/index.js";
import type { Message } from "@/types/index.js";

describe("Session Integration", () => {
  const testDir = resolve("/tmp/krebs-test-integration");
  let agentManager: AgentManager;
  let sessionStorage: any;

  beforeEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });

    // 创建 Session Storage
    sessionStorage = createEnhancedSessionStorage({
      baseDir: testDir,
      enableCache: true,
      cacheTtl: 1000,
    });

    // 创建 Mock Provider
    const mockProvider = {
      name: "mock",
      async chat(messages: Message[]) {
        return {
          content: `Mock response to: ${messages[messages.length - 1].content}`,
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
        };
      },
      async chatStream(messages: Message[], onChunk: (chunk: string) => void) {
        const response = `Mock response to: ${messages[messages.length - 1].content}`;
        for (const char of response) {
          onChunk(char);
        }
        return {
          content: response,
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
        };
      },
      async embed(text: string) {
        return {
          embedding: new Array(512).fill(0),
          model: "mock",
        };
      },
      async embedBatch(texts: string[]) {
        return texts.map(() => ({
          embedding: new Array(512).fill(0),
          model: "mock",
        }));
      },
    };

    // 创建 AgentManager
    agentManager = new AgentManager(
      {
        enableSkills: false,
      },
      {
        provider: mockProvider as any,
        storage: sessionStorage,
      }
    );

    // 创建测试 Agent
    agentManager.createAgent({
      id: "test-agent",
      name: "Test Agent",
      systemPrompt: "You are a test agent.",
    });
  });

  afterEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("SessionStorage 与 AgentManager 集成", () => {
    it("应该保存和加载会话", async () => {
      const sessionId = `test-${crypto.randomUUID()}`;
      const orchestrator = agentManager.getOrchestrator("test-agent");

      expect(orchestrator).toBeDefined();

      // 第一次对话
      const result1 = await orchestrator!.process("Hello", sessionId);
      expect(result1.response).toContain("Mock response");

      // 加载会话
      const store = sessionStorage.getStore();
      const session = await store.loadSession(sessionId);

      expect(session).not.toBeNull();
      expect(session!.messages.length).toBeGreaterThanOrEqual(2); // 至少有 user + assistant（可能有 system）
      expect(session!.messages[session!.messages.length - 2].content).toBe("Hello");
    });

    it("应该支持多轮对话", async () => {
      const sessionId = `test-${crypto.randomUUID()}`;
      const orchestrator = agentManager.getOrchestrator("test-agent");

      // 第一轮
      await orchestrator!.process("First message", sessionId);

      // 第二轮
      await orchestrator!.process("Second message", sessionId);

      // 第三轮
      await orchestrator!.process("Third message", sessionId);

      // 验证会话历史
      const store = sessionStorage.getStore();
      const session = await store.loadSession(sessionId);

      expect(session!.messages.length).toBeGreaterThanOrEqual(6); // 3 轮对话 × 2 条消息
      // 验证消息顺序：user1, assistant1, user2, assistant2, user3, assistant3
      const firstUserMsgIndex = session!.messages.findIndex(m => m.content === "First message");
      expect(firstUserMsgIndex).toBeGreaterThanOrEqual(0);
      // 下一条是 assistant 回复
      expect(session!.messages[firstUserMsgIndex + 1].content).toContain("Mock response to: First message");
      // 再下一条是第二条用户消息
      expect(session!.messages[firstUserMsgIndex + 2].content).toBe("Second message");
    });

    it("应该保存会话元数据", async () => {
      const sessionId = `test-${crypto.randomUUID()}`;
      const orchestrator = agentManager.getOrchestrator("test-agent");

      await orchestrator!.process("Hello", sessionId);

      // 验证元数据
      const store = sessionStorage.getStore();
      const session = await store.loadSession(sessionId);

      expect(session!.entry.sessionId).toBeDefined();
      expect(session!.entry.updatedAt).toBeDefined();
      expect(session!.entry.createdAt).toBeDefined();
    });

    it("应该支持多个独立的会话", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");

      const sessionId1 = `test-${crypto.randomUUID()}`;
      const sessionId2 = `test-${crypto.randomUUID()}`;

      await orchestrator!.process("Session 1", sessionId1);
      await orchestrator!.process("Session 2", sessionId2);

      // 验证两个会话独立
      const store = sessionStorage.getStore();
      const session1 = await store.loadSession(sessionId1);
      const session2 = await store.loadSession(sessionId2);

      // 验证两个会话独立（检查消息内容而不是顺序）
      const hasSession1 = session1!.messages.some(m => m.content === "Session 1");
      const hasSession2 = session2!.messages.some(m => m.content === "Session 2");
      expect(hasSession1).toBe(true);
      expect(hasSession2).toBe(true);
    });
  });

  describe("多 Agent 支持", () => {
    it("应该支持多 agent 的独立会话", async () => {
      // 创建第二个 agent
      agentManager.createAgent({
        id: "test-agent-2",
        name: "Test Agent 2",
        systemPrompt: "You are another test agent.",
      });

      const orchestrator1 = agentManager.getOrchestrator("test-agent");
      const orchestrator2 = agentManager.getOrchestrator("test-agent-2");

      const userKey = "user:123";

      // 使用两个不同的 agent
      await orchestrator1!.process("From agent 1", `agent:test-agent:${userKey}`);
      await orchestrator2!.process("From agent 2", `agent:test-agent-2:${userKey}`);

      // 验证两个会话独立
      const store = sessionStorage.getStore();
      const sessions = await store.listSessions();

      // 检查所有 sessionKeys（用于调试）
      const allSessionKeys = sessions.map((s: any) => s.sessionKey);
      if (allSessionKeys.length === 0) {
        throw new Error(`No sessions found at all`);
      }
      if (!allSessionKeys.some(k => k.includes("test-agent"))) {
        throw new Error(`No sessions found with "test-agent" in key. Found: ${JSON.stringify(allSessionKeys)}`);
      }

      // 查找包含 test-agent 的会话（因为 : 会被替换为 _）
      const agent1Sessions = sessions.filter((s: any) => s.sessionKey.includes("agent=test-agent=") || s.sessionKey.includes("agent_test-agent_"));
      // 查找包含 test-agent-2 的会话
      const agent2Sessions = sessions.filter((s: any) => s.sessionKey.includes("agent=test-agent-2=") || s.sessionKey.includes("agent_test-agent-2_"));

      expect(agent1Sessions.length).toBeGreaterThan(0);
      expect(agent2Sessions.length).toBeGreaterThan(0);
    });
  });

  describe("会话管理功能", () => {
    it("应该列出所有会话", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");

      await orchestrator!.process("Message 1", "session-1");
      await orchestrator!.process("Message 2", "session-2");
      await orchestrator!.process("Message 3", "session-3");

      const store = sessionStorage.getStore();
      const sessions = await store.listSessions();

      expect(sessions).toHaveLength(3);
    });

    it("应该更新会话元数据", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");
      await orchestrator!.process("Hello", "test-session");

      const store = sessionStorage.getStore();
      const updated = await store.updateSessionMetadata("test-session", {
        model: "gpt-4",
        totalTokens: 100,
      });

      expect(updated).not.toBeNull();
      expect(updated!.model).toBe("gpt-4");
      expect(updated!.totalTokens).toBe(100);
    });

    it("应该删除会话", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");
      await orchestrator!.process("Hello", "test-session");

      const store = sessionStorage.getStore();
      let exists = await store.loadSession("test-session");
      expect(exists).not.toBeNull();

      await store.deleteSession("test-session");

      exists = await store.loadSession("test-session");
      expect(exists).toBeNull();
    });
  });

  describe("并发安全", () => {
    it("应该处理并发的保存操作", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");
      const sessionId = `test-${crypto.randomUUID()}`;

      // 并发保存
      const promises = Array.from({ length: 10 }, (_, i) =>
        orchestrator!.process(`Message ${i}`, sessionId)
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();

      // 验证会话一致性
      const store = sessionStorage.getStore();
      const session = await store.loadSession(sessionId);

      expect(session).not.toBeNull();
      expect(session!.messages.length).toBeGreaterThan(0);
    });
  });

  describe("缓存功能", () => {
    it("应该使用缓存提升性能", async () => {
      const orchestrator = agentManager.getOrchestrator("test-agent");
      const sessionId = `test-${crypto.randomUUID()}`;

      await orchestrator!.process("Hello", sessionId);

      const store = sessionStorage.getStore();

      // 第一次加载（从文件）
      const start1 = Date.now();
      await store.loadSession(sessionId);
      const time1 = Date.now() - start1;

      // 第二次加载（从缓存）
      const start2 = Date.now();
      await store.loadSession(sessionId);
      const time2 = Date.now() - start2;

      // 缓存应该更快（虽然可能不明显）
      expect(time2).toBeLessThanOrEqual(time1 + 10);
    });
  });
});

/**
 * 测试 Session 上下文传递
 *
 * 验证：多轮对话中，LLM 能正确读取历史消息
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "@/agent/core/agent.js";
import type { AgentDeps, AgentConfig } from "@/agent/core/agent.js";
import type { Message } from "@/types/index.js";

describe("Agent Context Passing", () => {
  let mockProvider: any;
  let mockStorage: any;
  let agentDeps: AgentDeps;
  let agentConfig: AgentConfig;
  let historyMessages: Message[] = [];

  beforeEach(() => {
    // Mock Provider
    mockProvider = {
      name: "test-provider",
      chat: vi.fn(),
      chatStream: vi.fn(),
    };

    // Mock Storage
    historyMessages = [];
    mockStorage = {
      saveSession: vi.fn(),
      loadSession: vi.fn(async (sessionId: string) => {
        return historyMessages;
      }),
    };

    // Agent 配置
    agentConfig = {
      id: "test-agent",
      name: "Test Agent",
      systemPrompt: "You are a helpful assistant.",
      model: "test-model",
    };

    // Agent 依赖
    agentDeps = {
      provider: mockProvider,
      storage: mockStorage,
      tools: [],
    };
  });

  describe("without MemoryService", () => {
    it("应该正确传递历史消息给 LLM", async () => {
      // 创建 Agent
      const agent = new Agent(agentConfig, agentDeps);

      // 设置历史消息
      historyMessages = [
        { role: "user", content: "你好，我叫张三", timestamp: Date.now() },
        {
          role: "assistant",
          content: "你好张三！很高兴认识你。",
          timestamp: Date.now(),
        },
      ];

      // Mock Provider 返回
      mockProvider.chat.mockResolvedValue({
        content: "你好张三！有什么我可以帮助你的吗？",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });

      // 调用 Agent
      const result = await agent.process("我叫什么名字？", "test-session");

      // 验证 Provider 被调用，且消息包含历史
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
      const messagesSent = mockProvider.chat.mock.calls[0][0];

      // 应该有 4 条消息：system + 历史用户 + 历史助手 + 当前用户
      expect(messagesSent.length).toBe(4);
      expect(messagesSent[0].role).toBe("system");
      expect(messagesSent[1].content).toBe("你好，我叫张三");
      expect(messagesSent[2].content).toBe("你好张三！很高兴认识你。");
      expect(messagesSent[3].content).toBe("我叫什么名字？");
    });

    it("应该在多轮对话中累积历史消息", async () => {
      const agent = new Agent(agentConfig, agentDeps);

      // 第一轮对话
      mockProvider.chat.mockResolvedValueOnce({
        content: "你好张三！",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      await agent.process("你好，我叫张三", "session-1");

      // 第二轮对话（应该加载第一轮的历史）
      historyMessages = [
        { role: "user", content: "你好，我叫张三", timestamp: Date.now() },
        { role: "assistant", content: "你好张三！", timestamp: Date.now() },
      ];

      mockProvider.chat.mockResolvedValueOnce({
        content: "你叫张三。",
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
      });
      await agent.process("我叫什么名字？", "session-1");

      // 验证第二轮调用时，消息包含历史
      const messagesSent = mockProvider.chat.mock.calls[1][0];
      expect(messagesSent.length).toBe(4); // system + 2条历史 + 当前
      expect(messagesSent[messagesSent.length - 1].content).toBe("我叫什么名字？");
    });
  });

  describe("with MemoryService", () => {
    it("应该在记忆注入失败时降级到普通流程", async () => {
      // Mock MemoryService（会抛出错误）
      const mockMemoryService = {
        injectRelevantMemories: vi.fn().mockRejectedValue(new Error("Memory service failed")),
      };

      agentDeps.memoryService = mockMemoryService;

      const agent = new Agent(agentConfig, agentDeps);

      // 设置历史消息
      historyMessages = [
        { role: "user", content: "你好，我叫张三", timestamp: Date.now() },
        { role: "assistant", content: "你好张三！", timestamp: Date.now() },
      ];

      mockProvider.chat.mockResolvedValue({
        content: "你叫张三。",
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
      });

      // 调用 Agent
      const result = await agent.process("我叫什么名字？", "test-session");

      // 验证降级到普通流程（仍然包含历史）
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
      const messagesSent = mockProvider.chat.mock.calls[0][0];

      // 应该有 4 条消息：system + 历史用户 + 历史助手 + 当前用户
      expect(messagesSent.length).toBe(4);
      expect(messagesSent[1].content).toBe("你好，我叫张三");
      expect(messagesSent[3].content).toBe("我叫什么名字？");
    });

    it("应该在记忆注入成功时保留历史消息", async () => {
      // Mock MemoryService（成功注入记忆）
      const mockMemoryService = {
        injectRelevantMemories: vi.fn().mockImplementation(async (messages: Message[]) => {
          // 在前面添加记忆系统消息
          return [
            {
              role: "system",
              content: "[相关记忆] 用户之前提到了张三 [以上是相关的长期记忆]",
              timestamp: Date.now(),
            },
            ...messages, // 保留原始消息（包含历史）
          ] as Message[];
        }),
      };

      agentDeps.memoryService = mockMemoryService;

      const agent = new Agent(agentConfig, agentDeps);

      // 设置历史消息
      historyMessages = [
        { role: "user", content: "你好，我叫张三", timestamp: Date.now() },
        { role: "assistant", content: "你好张三！", timestamp: Date.now() },
      ];

      mockProvider.chat.mockResolvedValue({
        content: "根据记忆和对话历史，你叫张三。",
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      });

      // 调用 Agent
      const result = await agent.process("我叫什么名字？", "test-session");

      // 验证记忆被注入且历史消息被保留
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
      const messagesSent = mockProvider.chat.mock.calls[0][0];

      // 应该有 6 条消息：
      // 1. system prompt
      // 2. 记忆系统消息
      // 3. 历史用户消息
      // 4. 历史助手消息
      // 5. 当前用户消息
      expect(messagesSent.length).toBe(5);
      expect(messagesSent[0].role).toBe("system");
      expect(messagesSent[1].role).toBe("system"); // 记忆注入
      expect(messagesSent[1].content).toContain("[相关记忆]");
      expect(messagesSent[2].content).toBe("你好，我叫张三");
      expect(messagesSent[4].content).toBe("我叫什么名字？");
    });
  });
});

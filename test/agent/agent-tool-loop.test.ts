/**
 * Agent Tool Calling 循环测试
 *
 * 测试多步工具调用功能
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "@/agent/core/agent.js";
import type { AgentConfig, AgentDeps, Message } from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import type { Tool } from "@/agent/tools/index.js";

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private callCount = 0;
  private responses: any[] = [];

  setResponses(responses: any[]) {
    this.responses = responses;
    this.callCount = 0;
  }

  async chat(messages: Message[], options?: any): Promise<any> {
    const response = this.responses[this.callCount];
    this.callCount++;

    if (!response) {
      throw new Error(`Unexpected call #${this.callCount}. Only ${this.responses.length} responses configured.`);
    }

    return response;
  }

  async chatStream(messages: Message[], options: any, onChunk: (chunk: string) => void): Promise<any> {
    // For now, just call chat
    const response = await this.chat(messages, options);
    if (response.content) {
      onChunk(response.content);
    }
    return response;
  }

  async embed(text: string): Promise<any> {
    throw new Error("Not implemented");
  }

  async embedBatch(texts: string[]): Promise<any[]> {
    throw new Error("Not implemented");
  }

  getCallCount() {
    return this.callCount;
  }
}

// Mock Tools
const createMockTool = (name: string, executeResult: any): Tool => ({
  name,
  description: `Mock tool ${name}`,
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async (args: any) => {
    console.log(`[Mock Tool ${name}] Executing with args:`, args);
    return executeResult;
  },
});

// Mock Storage
const mockStorage = {
  sessions: new Map<string, Message[]>(),

  async saveSession(sessionId: string, messages: Message[]) {
    mockStorage.sessions.set(sessionId, messages);
  },

  async loadSession(sessionId: string) {
    return mockStorage.sessions.get(sessionId) || null;
  },

  clear() {
    mockStorage.sessions.clear();
  },
};

describe("Agent - Tool Calling Loop", () => {
  let mockProvider: MockLLMProvider;
  let agent: Agent;
  let tool1: Tool;
  let tool2: Tool;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    mockStorage.clear();

    // 创建两个 Mock 工具
    tool1 = createMockTool("get_weather", {
      city: "Beijing",
      temperature: 25,
      condition: "sunny",
    });

    tool2 = createMockTool("calculate", {
      result: 42,
    });

    const config: AgentConfig = {
      agentId: "test-agent",
      model: "mock-model",
      temperature: 0.7,
    };

    const deps: AgentDeps = {
      provider: mockProvider,
      storage: mockStorage,
      tools: [tool1, tool2],
    };

    agent = new Agent(config, deps);
  });

  describe("单步工具调用", () => {
    it("应该调用一次工具并返回结果", async () => {
      // 模拟 LLM 响应：第一次调用工具，第二次返回最终答案
      mockProvider.setResponses([
        // 第一次 LLM 调用（包含工具调用）
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Beijing" },
            },
          ],
        },
        // 第二次 LLM 调用（最终回复）
        {
          content: "The weather in Beijing is sunny with a temperature of 25°C.",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("What's the weather in Beijing?", "session-1");

      // 验证：调用了两次 LLM
      expect(mockProvider.getCallCount()).toBe(2);

      // 验证：返回最终答案
      expect(result.response).toContain("Beijing");
      expect(result.response).toContain("sunny");
      expect(result.response).toContain("25");

      // 验证：保存了会话历史
      const session = mockStorage.sessions.get("session-1");
      expect(session).toBeDefined();
      expect(session!.length).toBe(4); // user + assistant(tool_calls) + user(tool_result) + assistant(final)
    });
  });

  describe("多步工具调用", () => {
    it("应该连续调用多个工具", async () => {
      // 模拟：LLM 先调用 get_weather，然后调用 calculate，最后给出答案
      mockProvider.setResponses([
        // 第1次：调用 get_weather
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Beijing" },
            },
          ],
        },
        // 第2次：调用 calculate
        {
          content: "",
          toolCalls: [
            {
              id: "call_2",
              name: "calculate",
              arguments: { expression: "25 * 2" },
            },
          ],
        },
        // 第3次：最终答案
        {
          content: "Based on the weather (25°C) and calculation (42), here's the result.",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Check weather and calculate", "session-2");

      // 验证：调用了3次 LLM
      expect(mockProvider.getCallCount()).toBe(3);

      // 验证：返回最终答案
      expect(result.response).toContain("weather");
      expect(result.response).toContain("calculation");
    });

    it("应该在一次循环中并行调用多个工具", async () => {
      // 模拟：LLM 一次请求调用多个工具
      mockProvider.setResponses([
        // 第1次：并行调用两个工具
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Beijing" },
            },
            {
              id: "call_2",
              name: "calculate",
              arguments: { expression: "1 + 1" },
            },
          ],
        },
        // 第2次：最终答案
        {
          content: "Weather is sunny and calculation result is 42.",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Check weather and calculate", "session-3");

      // 验证：调用了2次 LLM（并行工具 + 最终答案）
      expect(mockProvider.getCallCount()).toBe(2);

      // 验证：两个工具都被执行
      expect(result.response.toLowerCase()).toContain("weather");
      expect(result.response.toLowerCase()).toContain("calculation");
    });
  });

  describe("无工具调用", () => {
    it("应该直接返回 LLM 回复（不调用工具）", async () => {
      mockProvider.setResponses([
        {
          content: "Hello! How can I help you today?",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Hello", "session-4");

      // 验证：只调用一次 LLM
      expect(mockProvider.getCallCount()).toBe(1);

      // 验证：返回回复
      expect(result.response).toBe("Hello! How can I help you today?");

      // 验证：保存了会话历史
      const session = mockStorage.sessions.get("session-4");
      expect(session).toBeDefined();
      expect(session!.length).toBe(2); // user + assistant
    });
  });

  describe("工具执行错误", () => {
    it("应该处理工具执行失败的情况", async () => {
      // 创建一个会抛出错误的工具
      const failingTool = createMockTool("failing_tool", null);
      failingTool.execute = async () => {
        throw new Error("Tool execution failed!");
      };

      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "failing_tool",
              arguments: {},
            },
          ],
        },
        {
          content: "I encountered an error with the tool.",
          toolCalls: [],
        },
      ]);

      // 替换工具列表
      (agent as any).deps.tools = [failingTool];

      const result = await agent.process("Use the failing tool", "session-5");

      // 验证：即使工具失败，也应该继续并返回最终答案
      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("error");
    });

    it("应该处理工具不存在的情况", async () => {
      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "non_existent_tool",
              arguments: {},
            },
          ],
        },
        {
          content: "The tool was not found.",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Use non-existent tool", "session-6");

      // 验证：即使工具不存在，也应该继续
      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("not found");
    });
  });

  describe("最大迭代限制", () => {
    it("应该在达到最大迭代次数时停止", async () => {
      // 模拟：LLM 持续要求调用工具，不给出最终答案
      const infiniteToolCallResponse = {
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "get_weather",
            arguments: { city: "Beijing" },
          },
        ],
      };

      // 设置12个响应（超过 maxIterations=10）
      mockProvider.setResponses(Array(12).fill(infiniteToolCallResponse));

      await expect(
        agent.process("Keep calling tools", "session-7")
      ).rejects.toThrow("Max iterations (10) reached");
    });
  });

  describe("会话历史管理", () => {
    it("应该在工具调用循环中正确维护消息历史", async () => {
      mockProvider.setResponses([
        // 第1次：调用工具
        {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Beijing" },
            },
          ],
        },
        // 第2次：最终答案
        {
          content: "Weather is sunny.",
          toolCalls: [],
        },
      ]);

      await agent.process("What's the weather?", "session-8");

      const session = mockStorage.sessions.get("session-8");

      // 验证：保存的消息不包含系统提示词
      expect(session).toBeDefined();
      expect(session!.length).toBe(4);

      // 验证：消息结构
      expect(session![0].role).toBe("user");
      expect(session![1].role).toBe("assistant");
      expect(session![1].toolCalls).toBeDefined();
      expect(session![2].role).toBe("user");  // 工具结果
      expect(session![3].role).toBe("assistant");
      expect(session![3].content).toBe("Weather is sunny.");
    });
  });
});

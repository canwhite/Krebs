/**
 * Agent 工具调用循环 - 全面测试套件
 *
 * 测试目标：
 * 1. 验证工具调用循环的正确性
 * 2. 验证中间消息的保存
 * 3. 验证上下文压缩功能
 * 4. 验证边缘情况和错误处理
 * 5. 验证性能和并发
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "@/agent/core/agent.js";
import type { AgentConfig, AgentDeps, Message } from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import type { Tool } from "@/agent/tools/index.js";

// ========== Mock LLM Provider ==========

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private callCount = 0;
  private responses: any[] = [];
  private callLog: any[] = [];

  setResponses(responses: any[]) {
    this.responses = responses;
    this.callCount = 0;
    this.callLog = [];
  }

  async chat(messages: Message[], options?: any): Promise<any> {
    const response = this.responses[this.callCount];

    // 记录调用
    this.callLog.push({
      index: this.callCount,
      messageCount: messages.length,
      hasToolCalls: !!response?.toolCalls?.length,
      tools: response?.toolCalls?.map((t: any) => t.name) || [],
    });

    this.callCount++;

    if (!response) {
      throw new Error(`Unexpected call #${this.callCount}. Only ${this.responses.length} responses configured.`);
    }

    return response;
  }

  async chatStream(messages: Message[], options: any, onChunk: (chunk: string) => void): Promise<any> {
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

  getCallLog() {
    return this.callLog;
  }

  getLastCall() {
    return this.callLog[this.callLog - 1];
  }
}

// ========== Mock 工具 ==========

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

// 创建一个慢工具（用于测试并发）
const createSlowTool = (name: string, delayMs: number, result: any): Tool => ({
  name,
  description: `Slow tool ${name}`,
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async (args: any) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return result;
  },
});

// ========== Mock Storage ==========

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

  getSessionCount() {
    return mockStorage.sessions.size;
  },
};

describe("Agent - 工具调用循环全面测试", () => {
  let mockProvider: MockLLMProvider;
  let agent: Agent;
  let tool1: Tool;
  let tool2: Tool;
  let tool3: Tool;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    mockStorage.clear();

    // 创建三个 Mock 工具
    tool1 = createMockTool("search", {
      query: "Beijing weather",
      results: ["Sunny, 25°C"],
    });

    tool2 = createMockTool("calculate", {
      expression: "25 * 2",
      result: 50,
    });

    tool3 = createMockTool("translate", {
      text: "Hello",
      target: "Chinese",
      result: "你好",
    });

    const config: AgentConfig = {
      agentId: "test-agent",
      model: "mock-model",
      temperature: 0.7,
      maxTokens: 4096,
    };

    const deps: AgentDeps = {
      provider: mockProvider,
      storage: mockStorage,
      tools: [tool1, tool2, tool3],
    };

    agent = new Agent(config, deps);
  });

  describe("基础功能验证", () => {
    it("应该正确执行单步工具调用", async () => {
      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [{ id: "call_1", name: "search", arguments: { query: "Beijing" } }],
        },
        {
          content: "Search result: Sunny, 25°C",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Search for Beijing weather", "session-1");

      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("Sunny");
      expect(result.response).toContain("25°C");
    });

    it("应该正确执行多步顺序调用", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "", toolCalls: [{ id: "call_2", name: "calculate", arguments: {} }] },
        { content: "", toolCalls: [{ id: "call_3", name: "translate", arguments: {} }] },
        { content: "All tasks completed", toolCalls: [] },
      ]);

      const result = await agent.process("Do multiple tasks", "session-2");

      expect(mockProvider.getCallCount()).toBe(4);
      expect(result.response).toContain("All tasks completed");
    });

    it("应该正确执行并行工具调用", async () => {
      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [
            { id: "call_1", name: "search", arguments: {} },
            { id: "call_2", name: "calculate", arguments: {} },
          ],
        },
        {
          content: "Both tools executed",
          toolCalls: [],
        },
      ]);

      const result = await agent.process("Search and calculate", "session-3");

      expect(mockProvider.getCallCount()).toBe(2);

      // 验证两个工具都在同一次调用中
      const firstCall = mockProvider.getCallLog()[0];
      expect(firstCall.tools).toContain("search");
      expect(firstCall.tools).toContain("calculate");
    });
  });

  describe("中间消息保存验证", () => {
    it("应该保存工具调用请求消息", async () => {
      mockProvider.setResponses([
        { content: "Let me search for that", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "Found it!", toolCalls: [] },
      ]);

      await agent.process("Search for something", "session-4");

      const session = mockStorage.sessions.get("session-4");
      expect(session).toBeDefined();
      expect(session!.length).toBe(4); // user + assistant(text + tool_calls) + user(tool_result) + assistant(final)

      // 验证第2条消息包含工具调用
      const toolCallMessage = session![1];
      expect(toolCallMessage.role).toBe("assistant");
      expect(toolCallMessage.toolCalls).toBeDefined();
      expect(toolCallMessage.toolCalls!.length).toBe(1);
      expect(toolCallMessage.toolCalls![0].name).toBe("search");
    });

    it("应该保存工具执行结果消息", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: { query: "test" } }] },
        { content: "Done", toolCalls: [] },
      ]);

      await agent.process("Search", "session-5");

      const session = mockStorage.sessions.get("session-5");
      expect(session).toBeDefined();
      expect(session!.length).toBe(4); // user + assistant(tool_call) + user(tool_result) + assistant(final)

      // 验证第3条消息是工具结果
      const toolResultMessage = session![2];
      expect(toolResultMessage.role).toBe("user");

      const resultData = JSON.parse(toolResultMessage.content);
      expect(resultData.toolCallId).toBe("call_1");
      expect(resultData.toolName).toBe("search");
      expect(resultData.result).toBeDefined();
    });

    it("应该保存多步调用的所有中间消息", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "", toolCalls: [{ id: "call_2", name: "calculate", arguments: {} }] },
        { content: "Done", toolCalls: [] },
      ]);

      await agent.process("Search and calculate", "session-6");

      const session = mockStorage.sessions.get("session-6");
      // 2次工具调用应该产生：
      // user + assistant(tool1) + user(result1) + assistant(tool2) + user(result2) + assistant(final)
      // = 6条消息
      expect(session!.length).toBe(6);

      // 验证消息序列
      expect(session![0].role).toBe("user");
      expect(session![1].role).toBe("assistant");
      expect(session![1].toolCalls).toBeDefined();
      expect(session![2].role).toBe("user"); // tool1 result
      expect(session![3].role).toBe("assistant"); // tool2 call
      expect(session![3].toolCalls).toBeDefined();
      expect(session![4].role).toBe("user"); // tool2 result
      expect(session![5].role).toBe("assistant"); // final
    });

    it("应该保存并行工具调用的所有消息", async () => {
      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [
            { id: "call_1", name: "search", arguments: {} },
            { id: "call_2", name: "calculate", arguments: {} },
          ],
        },
        { content: "Done", toolCalls: [] },
      ]);

      await agent.process("Search and calculate", "session-7");

      const session = mockStorage.sessions.get("session-7");
      expect(session!.length).toBe(5); // user + assistant(tools) + user(result1) + user(result2) + assistant(final)

      // 验证包含两个工具调用
      const toolCalls = session![1].toolCalls;
      expect(toolCalls!.length).toBe(2);
    });
  });

  describe("上下文压缩测试", () => {
    it("应该在上下文过长时自动压缩", async () => {
      // 创建一个长对话历史（使用长消息来触发压缩）
      const longHistory: Message[] = [];
      const longMessage = "This is a very long message that contains a lot of text. ".repeat(50); // ~2500 chars per message

      for (let i = 0; i < 30; i++) {
        longHistory.push({ role: "user" as const, content: longMessage, timestamp: Date.now() });
        longHistory.push({ role: "assistant" as const, content: longMessage, timestamp: Date.now() });
      }

      mockStorage.sessions.set("session-long", longHistory);

      mockProvider.setResponses([
        { content: "I'll help", toolCalls: [] },
      ]);

      await agent.process("Help me", "session-long");

      // 验证：压缩后保留了重要的消息
      const session = mockStorage.sessions.get("session-long");
      // 原有60条长消息 + 2条新消息 = 62条
      // 每条消息 ~2500 chars，总计 ~155000 chars，约 ~51667 tokens
      // 远超过 3277 (80% of 4096)，应该触发压缩
      // 压缩后应该保留最近20条
      expect(session!.length).toBe(20); // 精确的20条
    });

    it("应该保留最近的消息", async () => {
      // 创建一个中等长度的历史
      const history: Message[] = [];
      for (let i = 0; i < 15; i++) {
        history.push({ role: "user" as const, content: `Msg ${i}`, timestamp: Date.now() });
        history.push({ role: "assistant" as const, content: `Resp ${i}`, timestamp: Date.now() });
      }

      mockStorage.sessions.set("session-medium", history);

      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "Done", toolCalls: [] },
      ]);

      await agent.process("Search", "session-medium");

      // 验证：最近的消息被保留
      const session = mockStorage.sessions.get("session-medium");
      const lastMessage = session![session!.length - 1];
      expect(lastMessage.content).toBe("Done");
    });
  });

  describe("错误处理测试", () => {
    it("应该处理工具执行失败的情况", async () => {
      const failingTool = createMockTool("failing", null);
      failingTool.execute = async () => {
        throw new Error("Tool failed!");
      };

      (agent as any).deps.tools = [failingTool];

      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "failing", arguments: {} }] },
        { content: "Tool execution failed", toolCalls: [] },
      ]);

      const result = await agent.process("Use failing tool", "session-error");

      // 应该继续执行并返回错误信息
      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("failed");
    });

    it("应该处理工具不存在的情况", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "nonexistent", arguments: {} }] },
        { content: "Tool not found", toolCalls: [] },
      ]);

      const result = await agent.process("Use nonexistent tool", "session-missing");

      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("not found");
    });

    it("应该在达到最大迭代次数时停止", async () => {
      const infiniteToolCall = {
        content: "",
        toolCalls: [{ id: "call_1", name: "search", arguments: {} }],
      };

      // 设置11个响应（超过 maxIterations=10）
      mockProvider.setResponses(Array(11).fill(infiniteToolCall));

      await expect(
        agent.process("Infinite tool calls", "session-infinite")
      ).rejects.toThrow("Max iterations (10) reached");
    });
  });

  describe("性能测试", () => {
    it("应该高效执行并行工具调用", async () => {
      const slowTool1 = createSlowTool("slow1", 100, { result: "done1" });
      const slowTool2 = createSlowTool("slow2", 100, { result: "done2" });
      const slowTool3 = createSlowTool("slow3", 100, { result: "done3" });

      (agent as any).deps.tools = [slowTool1, slowTool2, slowTool3];

      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [
            { id: "call_1", name: "slow1", arguments: {} },
            { id: "call_2", name: "slow2", arguments: {} },
            { id: "call_3", name: "slow3", arguments: {} },
          ],
        },
        { content: "All done", toolCalls: [] },
      ]);

      const startTime = Date.now();
      const result = await agent.process("Run slow tools in parallel", "session-parallel");
      const endTime = Date.now();

      // 并行执行：3个100ms工具同时执行，应该接近100ms
      // 考虑到Promise.allSettled的开销，设置合理范围
      expect(endTime - startTime).toBeGreaterThanOrEqual(100); // 至少100ms（最慢的工具）
      expect(endTime - startTime).toBeLessThan(250); // 应该远少于300ms（顺序执行的时间）
      expect(result.response).toContain("All done");
    });

    it("应该正确处理大量工具调用", async () => {
      // 模拟9次工具调用（第10次返回最终答案）
      const responses = [];
      for (let i = 0; i < 9; i++) {
        responses.push({
          content: "",
          toolCalls: [{ id: `call_${i}`, name: "search", arguments: { index: i } }],
        });
      }
      responses.push({ content: "Completed 9 searches", toolCalls: [] });

      mockProvider.setResponses(responses);

      const result = await agent.process("Do 9 searches", "session-many");

      expect(mockProvider.getCallCount()).toBe(10);
      expect(result.response).toContain("9");
    });
  });

  describe("边缘情况测试", () => {
    it("应该处理空工具调用列表", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [] },
        { content: "No tools needed", toolCalls: [] },
      ]);

      const result = await agent.process("Simple question", "session-no-tools");

      // 当没有工具调用时，应该直接返回
      expect(mockProvider.getCallCount()).toBe(1);
      // 空的响应会返回空字符串
      expect(result.response).toBe("");
    });

    it("应该处理工具返回null的情况", async () => {
      const nullTool = createMockTool("null_tool", null);

      (agent as any).deps.tools = [nullTool];

      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "null_tool", arguments: {} }] },
        { content: "Tool returned null", toolCalls: [] },
      ]);

      const result = await agent.process("Use null tool", "session-null");

      expect(mockProvider.getCallCount()).toBe(2);
      expect(result.response).toContain("null");
    });

    it("应该处理工具返回复杂对象的情况", async () => {
      const complexTool = createMockTool("complex", {
        nested: {
          data: [1, 2, 3],
          metadata: { key: "value" }
        },
        timestamp: Date.now()
      });

      (agent as any).deps.tools = [complexTool];

      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "complex", arguments: {} }] },
        { content: "Got complex result", toolCalls: [] },
      ]);

      const result = await agent.process("Use complex tool", "session-complex");

      expect(mockProvider.getCallCount()).toBe(2);

      // 验证复杂对象被正确序列化和保存
      const session = mockStorage.sessions.get("session-complex");
      const toolResult = JSON.parse(session![2].content);
      expect(toolResult.result).toBeDefined();
      expect(toolResult.result.nested).toBeDefined();
    });
  });

  describe("多会话隔离测试", () => {
    it("应该正确隔离不同会话的消息", async () => {
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "Done", toolCalls: [] },
      ]);

      // 按顺序处理多个会话（因为 mockProvider 的响应限制）
      await agent.process("Search for A", "session-a");
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "Done", toolCalls: [] },
      ]);
      await agent.process("Search for B", "session-b");
      mockProvider.setResponses([
        { content: "", toolCalls: [{ id: "call_1", name: "search", arguments: {} }] },
        { content: "Done", toolCalls: [] },
      ]);
      await agent.process("Search for C", "session-c");

      // 验证每个会话都有独立的历史
      const sessionA = mockStorage.sessions.get("session-a");
      const sessionB = mockStorage.sessions.get("session-b");
      const sessionC = mockStorage.sessions.get("session-c");

      expect(sessionA).toBeDefined();
      expect(sessionB).toBeDefined();
      expect(sessionC).toBeDefined();

      expect(sessionA!.length).toBe(4); // user + assistant(tool) + user(result) + assistant(final)
      expect(sessionB!.length).toBe(4);
      expect(sessionC!.length).toBe(4);
    });
  });

  describe("工具参数传递测试", () => {
    it("应该正确传递工具参数", async () => {
      let receivedArgs: any = null;

      const argTool = {
        name: "arg_tool",
        description: "Tool that captures arguments",
        parameters: {
          type: "object",
          properties: {
            foo: { type: "string" },
            bar: { type: "number" },
          },
        },
        execute: async (args: any) => {
          receivedArgs = args;
          return { success: true, args };
        },
      };

      (agent as any).deps.tools = [argTool];

      mockProvider.setResponses([
        {
          content: "",
          toolCalls: [{
            id: "call_1",
            name: "arg_tool",
            arguments: { foo: "test", bar: 42 }
          }],
        },
        { content: "Arguments received", toolCalls: [] },
      ]);

      await agent.process("Use arg tool", "session-args");

      expect(receivedArgs).toEqual({ foo: "test", bar: 42 });
    });
  });
});

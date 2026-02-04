/**
 * 测试工具函数
 */

import type { LLMProvider, Message, ChatCompletionResult } from "../../src/types/index.js";
import type { AgentConfig } from "../../src/types/index.js";

/**
 * 创建 Mock Provider
 */
export function createMockProvider(
  responses: Record<string, string> = {}
): LLMProvider {
  return {
    name: "mock-provider",
    async chat(
      _messages: Message[],
      _options?: { temperature?: number; maxTokens?: number }
    ): Promise<ChatCompletionResult> {
      const key = JSON.stringify(_messages);
      return {
        response: responses[key] || "Mock response",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };
    },
    async chatStream(
      _messages: Message[],
      _options: { temperature?: number; maxTokens?: number },
      _onChunk: (chunk: string) => void
    ): Promise<ChatCompletionResult> {
      const response = "Mock streaming response";
      for (const char of response) {
        _onChunk(char);
      }
      return {
        response,
        usage: {
          promptTokens: 10,
          completionTokens: response.length,
          totalTokens: 10 + response.length,
        },
      };
    },
    async embed(_text: string): Promise<{ embedding: number[]; model: string }> {
      return {
        embedding: Array(768).fill(0),
        model: "mock-embed",
      };
    },
    async embedBatch(_texts: string[]): Promise<{ embedding: number[]; model: string }[]> {
      return _texts.map(() => ({
        embedding: Array(768).fill(0),
        model: "mock-embed",
      }));
    },
  };
}

/**
 * 创建测试 Agent 配置
 */
export function createTestAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "You are a test assistant",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 4096,
    ...overrides,
  };
}

/**
 * 创建测试消息
 */
export function createTestMessage(
  role: "user" | "assistant" | "system",
  content: string
): Message {
  return {
    role,
    content,
    timestamp: Date.now(),
  };
}

/**
 * 创建测试消息列表
 */
export function createTestMessages(...contents: string[]): Message[] {
  return contents.map((content, index) =>
    index % 2 === 0
      ? createTestMessage("user", content)
      : createTestMessage("assistant", content)
  );
}

/**
 * 等待异步操作完成
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建 Mock Storage
 */
export function createMockStorage() {
  const storage = new Map<string, Message[]>();
  return {
    async saveSession(sessionId: string, messages: Message[]): Promise<void> {
      storage.set(sessionId, messages);
    },
    async loadSession(sessionId: string): Promise<Message[] | null> {
      return storage.get(sessionId) || null;
    },
    clear() {
      storage.clear();
    },
  };
}

/**
 * 增量摘要功能测试
 *
 * 测试目标：
 * 1. 验证增量摘要只在有新增消息时才生成新摘要
 * 2. 验证缓存可以正确复用
 * 3. 验证摘要合并逻辑正确
 * 4. 验证长对话场景下的性能提升
 */

import { describe, it, expect, beforeEach } from "vitest";
import { summarizeMessages, clearAllSummaryCache } from "../../src/utils/summarization.js";
import type { Message } from "../../src/types/index.js";

describe("增量摘要功能 (Incremental Summarization)", () => {
  let mockProvider: MockLLMProvider;
  let baseMessages: Message[];

  beforeEach(() => {
    // 清除缓存
    clearAllSummaryCache();

    // 创建 Mock Provider
    mockProvider = new MockLLMProvider();

    // 创建基础消息（模拟30条历史消息）
    baseMessages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i + 1}: This is a test message with some content.`,
      timestamp: Date.now() + i * 1000,
    }));
  });

  describe("场景1: 首次摘要", () => {
    it("应该生成完整摘要", async () => {
      const result = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });

      expect(result.summary).toBeDefined();
      expect(result.originalMessageCount).toBe(30);
      expect(result.estimatedTokens).toBeGreaterThan(0);

      // 验证LLM被调用
      expect(mockProvider.callCount).toBe(1);
    });
  });

  describe("场景2: 无新增消息", () => {
    it("应该复用现有摘要，不调用LLM", async () => {
      // 第一次调用
      const result1 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount1 = mockProvider.callCount;

      // 第二次调用相同消息
      const result2 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount2 = mockProvider.callCount;

      // 验证复用了缓存
      expect(callCount2).toBe(callCount1);
      expect(result2.summary).toBe(result1.summary);
      expect(result2.originalMessageCount).toBe(30);
    });
  });

  describe("场景3: 少量新增消息（< 10条）", () => {
    it("应该直接复用旧摘要，不生成新摘要", async () => {
      // 第一次调用：30条消息
      const result1 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount1 = mockProvider.callCount;

      // 第二次调用：35条消息（新增5条）
      const extendedMessages = [
        ...baseMessages,
        ...Array.from({ length: 5 }, (_, i) => ({
          role: "user" as const,
          content: `New message ${i + 1}`,
          timestamp: Date.now() + (30 + i) * 1000,
        })),
      ];

      const result2 = await summarizeMessages(mockProvider, extendedMessages, {
        enableIncremental: true,
      });
      const callCount2 = mockProvider.callCount;

      // 验证没有调用LLM（新增消息少于10条）
      expect(callCount2).toBe(callCount1);
      expect(result2.summary).toBe(result1.summary);
      expect(result2.originalMessageCount).toBe(35);
    });
  });

  describe("场景4: 大量新增消息（≥ 10条）", () => {
    it("应该只对新增消息生成摘要，然后合并", async () => {
      // 第一次调用：30条消息
      const result1 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount1 = mockProvider.callCount;

      // 第二次调用：45条消息（新增15条）
      const newMessages = Array.from({ length: 15 }, (_, i) => ({
        role: "user" as const,
        content: `New message ${i + 1}`,
        timestamp: Date.now() + (30 + i) * 1000,
      }));

      const extendedMessages = [...baseMessages, ...newMessages];

      const result2 = await summarizeMessages(mockProvider, extendedMessages, {
        enableIncremental: true,
      });
      const callCount2 = mockProvider.callCount;

      // 验证调用了LLM（新增消息≥10条）
      expect(callCount2).toBe(callCount1 + 1);

      // 验证结果
      expect(result2.summary).toContain(result1.summary); // 应该包含旧摘要
      expect(result2.originalMessageCount).toBe(45);
      expect(result2.newMessagesCount).toBe(15);
    });
  });

  describe("场景5: 禁用增量摘要", () => {
    it("应该每次都生成完整摘要", async () => {
      // 第一次调用
      const result1 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: false, // 禁用增量摘要
      });
      const callCount1 = mockProvider.callCount;

      // 清除缓存，强制重新生成
      clearAllSummaryCache();

      // 第二次调用相同消息
      const result2 = await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: false,
      });
      const callCount2 = mockProvider.callCount;

      // 验证每次都调用LLM（禁用了增量摘要）
      expect(callCount2).toBe(callCount1 + 1);
      expect(result2.summary).toBe(result1.summary);
    });
  });

  describe("场景6: 长对话性能对比", () => {
    it("增量摘要应该显著减少LLM调用次数", async () => {
      let messages = [...baseMessages];
      let incrementalCalls = 0;
      let fullSummaryCalls = 0;

      // 模拟12轮对话，每轮新增5条消息（总共60条新增）
      for (let round = 0; round < 12; round++) {
        const newMessages = Array.from({ length: 5 }, (_, i) => ({
          role: "user" as const,
          content: `Round ${round + 1}, Message ${i + 1}`,
          timestamp: Date.now() + (messages.length + i) * 1000,
        }));

        messages = [...messages, ...newMessages];

        // 使用增量摘要
        const callCountBefore = mockProvider.callCount;
        await summarizeMessages(mockProvider, messages, {
          enableIncremental: true,
        });
        incrementalCalls += mockProvider.callCount - callCountBefore;
      }

      // 重置
      clearAllSummaryCache();
      messages = [...baseMessages];

      // 使用完整摘要（禁用增量）- 每次都清除缓存来模拟无缓存情况
      for (let round = 0; round < 12; round++) {
        const newMessages = Array.from({ length: 5 }, (_, i) => ({
          role: "user" as const,
          content: `Round ${round + 1}, Message ${i + 1}`,
          timestamp: Date.now() + (messages.length + i) * 1000,
        }));

        messages = [...messages, ...newMessages];

        const callCountBefore = mockProvider.callCount;
        // 每次清除缓存，模拟无缓存情况
        clearAllSummaryCache();
        await summarizeMessages(mockProvider, messages, {
          enableIncremental: false,
        });
        fullSummaryCalls += mockProvider.callCount - callCountBefore;
      }

      // 增量摘要应该大幅减少LLM调用
      // 在这个场景中：
      // - 完整摘要（无缓存）：12轮 × 1次调用 = 12次
      // - 增量摘要：每2轮才调用1次（因为每轮新增5条，需要累计到≥10条才触发）≈ 6次
      expect(incrementalCalls).toBeLessThan(fullSummaryCalls);
    });
  });

  describe("场景7: 缓存失效边界情况", () => {
    it("应该正确处理刚好10条新增消息的边界情况", async () => {
      // 第一次调用：30条消息
      await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount1 = mockProvider.callCount;

      // 第二次调用：40条消息（新增10条，刚好达到阈值）
      const newMessages = Array.from({ length: 10 }, (_, i) => ({
        role: "user" as const,
        content: `New message ${i + 1}`,
        timestamp: Date.now() + (30 + i) * 1000,
      }));

      const extendedMessages = [...baseMessages, ...newMessages];

      const result = await summarizeMessages(mockProvider, extendedMessages, {
        enableIncremental: true,
      });
      const callCount2 = mockProvider.callCount;

      // 验证：刚好10条应该触发增量摘要
      expect(callCount2).toBe(callCount1 + 1);
      expect(result.newMessagesCount).toBe(10);
    });

    it("应该正确处理9条新增消息的边界情况", async () => {
      // 第一次调用：30条消息
      await summarizeMessages(mockProvider, baseMessages, {
        enableIncremental: true,
      });
      const callCount1 = mockProvider.callCount;

      // 第二次调用：39条消息（新增9条，未达到阈值）
      const newMessages = Array.from({ length: 9 }, (_, i) => ({
        role: "user" as const,
        content: `New message ${i + 1}`,
        timestamp: Date.now() + (30 + i) * 1000,
      }));

      const extendedMessages = [...baseMessages, ...newMessages];

      const result = await summarizeMessages(mockProvider, extendedMessages, {
        enableIncremental: true,
      });
      const callCount2 = mockProvider.callCount;

      // 验证：9条不应该触发增量摘要
      expect(callCount2).toBe(callCount1);
      expect(result.newMessagesCount).toBeUndefined();
    });
  });
});

/**
 * Mock LLM Provider for testing
 */
class MockLLMProvider {
  public callCount = 0;

  async chat(_messages: Message[], _options: any) {
    this.callCount++;
    return {
      content: `Summary of ${_messages.length} messages: This is a generated summary.`,
      role: "assistant",
    };
  }
}

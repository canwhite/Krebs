/**
 * 对话摘要工具
 *
 * 使用 LLM 生成智能摘要，而非简单的统计信息
 * 参考 openclaw-cn-ds 的压缩机制
 */

import type { Message } from "@/types/index.js";
import type { LLMProvider } from "@/provider/base.js";
import { estimateMessagesTokens } from "./token-estimator.js";

/**
 * 摘要配置
 */
export interface SummarizationOptions {
  /**
   * 摘要的最大 token 数量
   */
  maxTokens?: number;

  /**
   * 摘要的详细程度
   */
  detail?: "concise" | "balanced" | "detailed";

  /**
   * 关注点（可选）
   */
  focus?: "decisions" | "actions" | "all";

  /**
   * 是否包含时间戳
   */
  includeTimestamps?: boolean;
}

/**
 * 摘要结果
 */
export interface SummarizationResult {
  /**
   * 生成的摘要文本
   */
  summary: string;

  /**
   * 原始消息数量
   */
  originalMessageCount: number;

  /**
   * 摘要的 token 数量（估算）
   */
  estimatedTokens: number;

  /**
   * 生成时间
   */
  generatedAt: number;
}

/**
 * 摘要缓存条目
 */
interface CacheEntry {
  summary: string;
  messagesHash: string;
  generatedAt: number;
  expiresAt: number;
}

/**
 * 摘要缓存类
 */
class SummaryCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttl: number; // 缓存过期时间（毫秒）

  constructor(ttl: number = 300000) {
    // 默认 5 分钟
    this.ttl = ttl;
  }

  /**
   * 生成消息哈希（用于缓存键）
   */
  private hashMessages(messages: Message[]): string {
    // 简单哈希：基于消息数量、角色和内容长度
    const parts = messages.map((m) => `${m.role}:${m.content?.length || 0}`);
    return `${messages.length}|${parts.join("|")}`;
  }

  /**
   * 获取缓存的摘要
   */
  get(messages: Message[]): string | null {
    const key = this.hashMessages(messages);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.summary;
  }

  /**
   * 设置缓存
   */
  set(messages: Message[], summary: string): void {
    const key = this.hashMessages(messages);
    const entry: CacheEntry = {
      summary,
      messagesHash: key,
      generatedAt: Date.now(),
      expiresAt: Date.now() + this.ttl,
    };
    this.cache.set(key, entry);
  }

  /**
   * 清除过期缓存
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
}

// 全局缓存实例
const globalSummaryCache = new SummaryCache();

/**
 * 构建摘要提示词
 */
function buildSummaryPrompt(
  messages: Message[],
  options: SummarizationOptions
): string {
  const detail = options.detail || "balanced";
  const focus = options.focus || "all";

  let prompt = `请总结以下对话内容，生成一个简洁但信息丰富的摘要。\n\n`;

  // 根据详细程度添加要求
  switch (detail) {
    case "concise":
      prompt += `要求：\n`;
      prompt += `- 极其简洁，只保留关键信息\n`;
      prompt += `- 省略细节，突出结论\n`;
      break;
    case "balanced":
      prompt += `要求：\n`;
      prompt += `- 平衡简洁性和完整性\n`;
      prompt += `- 保留重要结论和上下文\n`;
      prompt += `- 省略琐碎细节\n`;
      break;
    case "detailed":
      prompt += `要求：\n`;
      prompt += `- 详细但结构化\n`;
      prompt += `- 保留重要细节和推理过程\n`;
      prompt += `- 使用清晰的层次结构\n`;
      break;
  }

  // 根据关注点添加要求
  if (focus !== "all") {
    prompt += `\n特别关注：${focus === "decisions" ? "决策和结论" : "行动和结果"}\n`;
  }

  prompt += `\n对话内容：\n\n`;

  // 格式化消息
  messages.forEach((msg) => {
    const roleLabel = msg.role === "user" ? "用户" : msg.role === "assistant" ? "助手" : "系统";
    const timestamp = options.includeTimestamps
      ? `[${new Date(msg.timestamp || Date.now()).toLocaleTimeString("zh-CN")}] `
      : "";
    prompt += `${timestamp}${roleLabel}: ${msg.content}\n\n`;
  });

  return prompt;
}

/**
 * 使用 LLM 生成摘要
 *
 * @param provider - LLM Provider
 * @param messages - 要摘要的消息列表
 * @param options - 摘要选项
 * @returns 摘要结果
 */
export async function summarizeMessages(
  provider: LLMProvider,
  messages: Message[],
  options: SummarizationOptions = {}
): Promise<SummarizationResult> {
  // 检查缓存
  const cached = globalSummaryCache.get(messages);
  if (cached) {
    console.log(`[Summarization] Cache hit for ${messages.length} messages`);
    return {
      summary: cached,
      originalMessageCount: messages.length,
      estimatedTokens: estimateMessagesTokens([{ content: cached }]),
      generatedAt: Date.now(),
    };
  }

  console.log(`[Summarization] Generating summary for ${messages.length} messages...`);

  // 构建摘要提示词
  const summaryPrompt = buildSummaryPrompt(messages, options);

  // 调用 LLM 生成摘要
  const startTime = Date.now();
  const response = await provider.chat(
    [{ content: summaryPrompt, role: "user", timestamp: Date.now() }],
    {
      model: "claude-3-5-haiku-20241022", // 使用快速模型生成摘要
      temperature: 0.3, // 较低温度，确保摘要稳定
      maxTokens: options.maxTokens || 1000,
    }
  );

  const duration = Date.now() - startTime;
  const summary = response.content.trim();

  console.log(`[Summarization] Summary generated in ${duration}ms (${summary.length} chars)`);

  // 缓存摘要
  globalSummaryCache.set(messages, summary);

  // 返回结果
  return {
    summary,
    originalMessageCount: messages.length,
    estimatedTokens: estimateMessagesTokens([{ content: summary }]),
    generatedAt: Date.now(),
  };
}

/**
 * 清除过期缓存
 */
export function clearSummaryCache(): void {
  globalSummaryCache.clearExpired();
}

/**
 * 清除所有缓存
 */
export function clearAllSummaryCache(): void {
  globalSummaryCache.clear();
}

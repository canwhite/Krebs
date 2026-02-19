/**
 * 上下文压缩工具
 *
 * 参考 OpenClaw 的实现，提供智能的上下文压缩策略
 * 包括：历史修剪、分块摘要、渐进式降级
 */

import type { Message } from "@/types/index.js";
import { estimateMessagesTokens } from "./token-estimator.js";

/**
 * 压缩选项
 */
export interface CompactionOptions {
  /**
   * 最大上下文 token 数量
   */
  maxTokens: number;

  /**
   * 历史消息占用的最大比例（默认 0.8 = 80%）
   */
  maxHistoryShare?: number;

  /**
   * 保留最近的消息数量（默认 10 条）
   */
  keepRecentCount?: number;

  /**
   * 是否生成摘要（默认 true）
   */
  enableSummarization?: boolean;

  /**
   * 摘要的最大 token 数量
   */
  summaryMaxTokens?: number;
}

/**
 * 压缩结果
 */
export interface CompactionResult {
  /**
   * 压缩后的消息列表
   */
  messages: Message[];

  /**
   * 压缩前的 token 数量
   */
  tokensBefore: number;

  /**
   * 压缩后的 token 数量
   */
  tokensAfter: number;

  /**
   * 删除的消息数量
   */
  droppedMessages: number;

  /**
   * 生成的内容摘要（如果有）
   */
  summary?: string;
}

/**
 * 简单的消息摘要
 *
 * 注意：这是一个简化版的摘要，不调用 LLM
 * 真正的智能摘要需要调用 LLM API，可以在未来扩展
 */
function generateSimpleSummary(messages: Message[]): string {
  if (messages.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // 统计消息类型
  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant").length;
  const systemMessages = messages.filter((m) => m.role === "system").length;

  parts.push(`[历史对话摘要]`);
  parts.push(`- 用户消息: ${userMessages} 条`);
  parts.push(`- 助手回复: ${assistantMessages} 条`);
  if (systemMessages > 0) {
    parts.push(`- 系统提示: ${systemMessages} 条`);
  }

  // 提取前几条用户消息的关键词（简单截取）
  const userContents = messages
    .filter((m) => m.role === "user")
    .slice(0, 3)
    .map((m) => {
      const content = String(m.content || "").trim();
      // 截取前 50 个字符
      return content.length > 50 ? content.slice(0, 50) + "..." : content;
    });

  if (userContents.length > 0) {
    parts.push(`\n近期话题:`);
    userContents.forEach((content, i) => {
      parts.push(`${i + 1}. ${content}`);
    });
  }

  return parts.join("\n");
}

/**
 * 历史修剪策略
 *
 * 保留最近的消息，删除旧的消息
 */
function pruneHistory(
  messages: Message[],
  options: CompactionOptions
): Message[] {
  const keepRecentCount = options.keepRecentCount || 10;
  const maxTokens = options.maxTokens;
  const maxHistoryTokens = Math.floor(maxTokens * (options.maxHistoryShare || 0.8));

  // 如果消息数量少于保留数量，直接返回
  if (messages.length <= keepRecentCount) {
    return messages;
  }

  // 保留最近的消息
  let recentMessages = messages.slice(-keepRecentCount);
  let estimatedTokens = estimateMessagesTokens(recentMessages);

  // 如果最近的消息也超过限制，继续删除
  while (recentMessages.length > 2 && estimatedTokens > maxHistoryTokens) {
    recentMessages = recentMessages.slice(1); // 删除最旧的一条
    estimatedTokens = estimateMessagesTokens(recentMessages);
  }

  return recentMessages;
}

/**
 * 智能压缩策略
 *
 * 结合历史修剪和摘要生成
 */
export function compactMessages(
  messages: Message[],
  options: CompactionOptions
): CompactionResult {
  const tokensBefore = estimateMessagesTokens(messages);
  const enableSummarization = options.enableSummarization !== false;

  // 如果未超过限制，直接返回
  const maxHistoryTokens = Math.floor(
    options.maxTokens * (options.maxHistoryShare || 0.8)
  );

  if (tokensBefore <= maxHistoryTokens) {
    return {
      messages,
      tokensBefore,
      tokensAfter: tokensBefore,
      droppedMessages: 0,
    };
  }

  console.log(
    `[Compaction] Context length (${tokensBefore} tokens) exceeds limit (${maxHistoryTokens}), compressing...`
  );

  // 策略1: 历史修剪
  const prunedMessages = pruneHistory(messages, options);
  const droppedCount = messages.length - prunedMessages.length;

  // 策略2: 生成摘要（如果启用且需要）
  let summary: string | undefined;
  let finalMessages = prunedMessages;

  if (enableSummarization && droppedCount > 0) {
    // 为被删除的消息生成摘要
    const droppedMessages = messages.slice(0, droppedCount);
    summary = generateSimpleSummary(droppedMessages);

    // 将摘要作为系统消息插入到开头
    if (summary) {
      const summaryMessage: Message = {
        role: "system",
        content: `[上下文摘要]\n${summary}\n\n以下是最新的对话内容：`,
        timestamp: Date.now(),
      };

      finalMessages = [summaryMessage, ...prunedMessages];
    }
  }

  const tokensAfter = estimateMessagesTokens(finalMessages);

  console.log(
    `[Compaction] Compressed from ${messages.length} to ${finalMessages.length} messages ` +
      `(${tokensBefore} → ${tokensAfter} tokens, dropped ${droppedCount} messages)`
  );

  return {
    messages: finalMessages,
    tokensBefore,
    tokensAfter,
    droppedMessages: droppedCount,
    summary,
  };
}

/**
 * 检查是否需要压缩
 */
export function needsCompaction(
  messages: Message[],
  maxTokens: number,
  maxHistoryShare: number = 0.8
): boolean {
  const tokens = estimateMessagesTokens(messages);
  const maxHistoryTokens = Math.floor(maxTokens * maxHistoryShare);
  return tokens > maxHistoryTokens;
}

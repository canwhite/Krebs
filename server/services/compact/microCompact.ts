/**
 * Micro Compact - 轻量级上下文清理机制
 *
 * 核心逻辑：
 * 1. 扫描 role === "toolResult" 的消息
 * 2. 按 age 排序，保留最近 keepRecent 个
 * 3. 超过 truncateThreshold 的替换为占位符
 * 4. 完整内容持久化到 transcript
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent, ImageContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { DEFAULT_MICRO_COMPACT_CONFIG, type MicroCompactConfig } from "./types.js";

export interface PruneTarget {
  messageIndex: number;
  toolMessage: ToolResultMessage;
  age: number;
  contentLength: number;
}

export function createMicroCompact(config: Partial<MicroCompactConfig> = {}) {
  const cfg: MicroCompactConfig = { ...DEFAULT_MICRO_COMPACT_CONFIG, ...config };

  const MICRO_COMPACT_PREFIX = "[MicroCompact]";

  /**
   * 从 content 数组中提取纯文本
   */
  function extractTextContent(content: (TextContent | ImageContent)[]): string {
    return content
      .filter((part): part is TextContent => part.type === "text")
      .map(part => part.text)
      .join("");
  }

  /**
   * 检查内容是否已被 MicroCompact 处理
   */
  function isAlreadyTruncated(content: (TextContent | ImageContent)[]): boolean {
    const text = extractTextContent(content);
    return text.includes(MICRO_COMPACT_PREFIX);
  }

  return {
    /**
     * 扫描并返回需要 truncate 的 tool results
     */
    findToolResultsToPrune(messages: AgentMessage[]): PruneTarget[] {
      const toolResults: PruneTarget[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;

        // ToolResultMessage 是独立的 role === "toolResult"，不是嵌套在 user 消息中
        if (msg.role === "toolResult") {
          const toolMsg = msg as ToolResultMessage;

          // 跳过已处理的
          if (isAlreadyTruncated(toolMsg.content)) {
            continue;
          }

          const content = extractTextContent(toolMsg.content);

          toolResults.push({
            messageIndex: i,
            toolMessage: toolMsg,
            age: messages.length - i,
            contentLength: content.length,
          });
        }
      }

      // 按 age 排序（age 越小越新），取需要处理的部分
      // 排序后 age 升序：[age1(newest), age2, age3, age4(oldest)]
      // slice(keepRecent) 取前 keepRecent 个（最新的），所以 toPrune 是最老的
      toolResults.sort((a, b) => a.age - b.age);
      return toolResults.slice(cfg.keepRecent);
    },

    /**
     * 执行 truncate（返回修改后的 messages array）
     * 使用 immutable 方式：先记录要修改的 index，再 map 构建新数组
     */
    truncateToolResults(
      messages: AgentMessage[],
      toPrune: PruneTarget[]
    ): AgentMessage[] {
      if (toPrune.length === 0) {
        return messages;
      }

      // 构建要替换的 map: messageIndex -> placeholder
      const truncateMap = new Map<number, string>();
      for (const target of toPrune) {
        if (target.contentLength <= cfg.truncateThreshold) {
          continue;
        }

        const placeholder = `${MICRO_COMPACT_PREFIX} Previous ${target.toolMessage.toolName} result (cleared to save tokens, original length: ${target.contentLength})`;
        truncateMap.set(target.messageIndex, placeholder);
      }

      if (truncateMap.size === 0) {
        return messages;
      }

      // Immutable 更新：构建新数组
      return messages.map((msg, i) => {
        const placeholder = truncateMap.get(i);
        if (placeholder === undefined) {
          return msg;
        }

        // 返回新的 ToolResultMessage with placeholder
        return {
          ...msg,
          content: [{ type: "text", text: placeholder }] as (TextContent | ImageContent)[],
        } as ToolResultMessage;
      });
    },

    getConfig(): MicroCompactConfig {
      return { ...cfg };
    },
  };
}

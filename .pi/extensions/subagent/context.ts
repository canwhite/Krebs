/**
 * Context 构建与隔离
 * 为 subagent 构建干净的 parent context，避免敏感信息泄露
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { extractText, filterSensitiveData } from "./context-filter.js";

// buildCleanContext 选项
export interface CleanContextOptions {
  includeUserMessages?: boolean;   // 默认 true
  includeAssistantMessages?: boolean; // 默认 true
  includeSummaries?: boolean;     // 默认 false
  maxMessages?: number;           // 默认 10，0 = 不使用 parent context
  filterSensitive?: boolean;       // 默认 true
}

// 干净上下文构建（注意：ctx 是 parent 的 extension context）
export function buildCleanContext(
  ctx: ExtensionContext,
  options: CleanContextOptions = {}
): string {
  const {
    includeUserMessages = true,
    includeAssistantMessages = true,
    includeSummaries = false,
    maxMessages = 10,
    filterSensitive = true,
  } = options;

  // ctx 是 parent 的 extension context，sessionManager.getBranch() 返回 parent 的消息
  const entries = (ctx.sessionManager as any).getBranch();
  if (!entries?.length) return "";

  // maxMessages = 0 表示不使用 parent context（安全默认）
  if (maxMessages === 0) return "";

  // 反向遍历获取最后 N 条消息（getBranch() 返回从头到尾，尾是最新的）
  const reversed = [...entries].reverse();
  const parts: string[] = [];
  let messageCount = 0;

  for (const entry of reversed) {
    // summary_anchor 始终先处理，不受 maxMessages 限制
    if (entry.type === "summary_anchor" && includeSummaries) {
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
      continue;  // summaries 不计入 messageCount
    }

    if (entry.type === "message") {
      const msg = entry.message as AgentMessage | undefined;
      if (!msg || !("content" in msg)) continue;

      // 先判断是否达到 limit，再决定是否添加
      if (messageCount >= maxMessages) break;

      let content = extractText((msg as any).content);

      if (msg.role === "user" && includeUserMessages) {
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[User]: ${content.trim()}`);
          messageCount++;
        }
      } else if (msg.role === "assistant" && includeAssistantMessages) {
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[Assistant]: ${content.trim()}`);
          messageCount++;
        }
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
${parts.join("\n\n")}

---
# Your Task (below)
`;
}

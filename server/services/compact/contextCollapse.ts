/**
 * Context Collapse - 读时投影压缩
 *
 * 核心逻辑：
 * 1. 75% tokens 触发
 * 2. 计算 boundary（headIndex, tailIndex）
 * 3. 调 LLM 对 [headIndex, tailIndex) 生成摘要
 * 4. 创建投影：摘要消息替换旧消息段
 * 5. context hook 返回投影
 * 6. 底层 JSONL 不变
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model, UserMessage, TextContent } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { DEFAULT_CONTEXT_COLLAPSE_CONFIG, type ContextCollapseConfig } from "./types.js";

export interface CompactBoundary {
  headIndex: number; // 压缩起始 index（包含）
  tailIndex: number; // 压缩结束 index（不包含）
}

export interface CollapseResult {
  projectedMessages: AgentMessage[];
  boundary: CompactBoundary;
  summary: string;
}

/**
 * 估算单条消息的 token 数
 */
function estimateMessageTokens(msg: AgentMessage): number {
  // 简单估算：按字符数 / 4
  const str = JSON.stringify(msg);
  return Math.ceil(str.length / 4);
}

export function createContextCollapser(config: Partial<ContextCollapseConfig> = {}) {
  const cfg: ContextCollapseConfig = { ...DEFAULT_CONTEXT_COLLAPSE_CONFIG, ...config };

  return {
    /**
     * 判断是否应该触发 Context Collapse
     */
    shouldCollapse(tokens: number, contextWindow: number): boolean {
      if (!contextWindow || contextWindow === 0) return false;
      const percent = tokens / contextWindow;
      return percent >= cfg.triggerThreshold && cfg.enabled;
    },

    /**
     * 计算压缩边界（基于 index）
     * @param messages AgentMessage[] - 完整消息数组
     * @param latestAnchor 上次 collapse 的 SummaryAnchor（如果有）
     */
    calculateBoundary(
      messages: AgentMessage[],
      latestAnchor?: SummaryAnchor
    ): CompactBoundary | null {
      // 1. 确定 headIndex：
      //    - 如果有 latestAnchor，用其 tailIndex
      //    - 否则从 0 开始
      const headIndex = latestAnchor?.tailIndex ?? 0;

      // 2. 计算 tailIndex：
      //    - 从 tail 往前累加，保留 cfg.keepRecentTokens
      let tokenCount = 0;
      let tailIndex = messages.length;

      for (let i = messages.length - 1; i >= headIndex && tokenCount < cfg.keepRecentTokens; i--) {
        const msg = messages[i];
        if (!msg) continue;
        tokenCount += estimateMessageTokens(msg);
        tailIndex = i;
      }

      // 3. 确保有足够的待压缩内容（至少 2 条消息才值得压缩）
      if (tailIndex <= headIndex) {
        return null; // 没有内容可压缩
      }

      return { headIndex, tailIndex };
    },

    /**
     * 创建投影（在内存中，不修改底层）
     */
    createProjection(
      messages: AgentMessage[],
      boundary: CompactBoundary,
      summary: string
    ): AgentMessage[] {
      const { headIndex, tailIndex } = boundary;

      // 构建新消息数组：
      // - [0, headIndex): 保持原样
      // - [headIndex, tailIndex): 替换为摘要消息
      // - [tailIndex, end): 保持原样

      const summaryMessage: AgentMessage = {
        role: "user",
        content: `【Context Collapse 摘要】\n${summary}`,
        timestamp: Date.now(),
      } as AgentMessage;

      return [
        ...messages.slice(0, headIndex),
        summaryMessage,
        ...messages.slice(tailIndex),
      ];
    },

    /**
     * 生成摘要（调 LLM）
     */
    async generateSummary(
      messages: AgentMessage[],
      headIndex: number,
      tailIndex: number,
      model?: Model<any>,
      apiKey?: string,
      signal?: AbortSignal
    ): Promise<string> {
      // 1. 提取 [headIndex, tailIndex) 的消息内容
      const rangeMessages = messages.slice(headIndex, tailIndex);
      if (rangeMessages.length === 0) {
        return "[empty range]";
      }

      // 2. 如果没有 model 或 apiKey，返回占位符
      if (!model || !apiKey) {
        return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
      }

      // 3. 构造 prompt
      const formatMessage = (m: AgentMessage, i: number): string => {
        const role = "role" in m ? m.role : "unknown";
        let content: string;
        if ("content" in m) {
          content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        } else {
          content = JSON.stringify(m);
        }
        return `[${i + headIndex}] ${role}: ${content}`;
      };

      const prompt = `请为以下对话历史生成简洁摘要：

${rangeMessages.map((m, i) => formatMessage(m, i)).join('\n')}

摘要要求：
- 保留关键决策和进展
- 简洁明了，便于后续上下文理解
- 100-200 字以内`;

      try {
        const userMessage: UserMessage = {
          role: "user",
          content: [{ type: "text", text: prompt }],
          timestamp: Date.now(),
        };

        const response = await completeSimple(
          model,
          {
            systemPrompt: "你是一个简洁的摘要生成器。请根据提供的对话历史生成简短摘要。",
            messages: [userMessage],
          },
          { maxTokens: 1024, signal, apiKey }
        );

        const textContent = response.content.find((c): c is TextContent => c.type === "text");
        const result = textContent?.text?.trim() ?? "";
        return result || `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
      } catch (err: any) {
        console.error("[ContextCollapse] LLM call failed:", err.message);
        return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
      }
    },

    getConfig(): ContextCollapseConfig {
      return { ...cfg };
    },
  };
}

/**
 * Summary Anchor 结构（存储在 session 中）
 */
export interface SummaryAnchor {
  headIndex: number; // 压缩范围起始 index（包含）
  tailIndex: number; // 压缩范围结束 index（不包含）
  summary: string; // 摘要内容
  tokensBefore: number; // 压缩前的 token 数
  createdAt: number; // 时间戳
  layer: "context_collapse";
}

/**
 * 从 session entries 获取最新的 SummaryAnchor
 */
export function getLatestSummaryAnchor(entries: any[]): SummaryAnchor | undefined {
  const anchors = entries.filter(
    (e) => e.type === "custom" && e.customType === "summary_anchor"
  );
  if (anchors.length === 0) return undefined;
  const latest = anchors[anchors.length - 1];
  return latest.data as SummaryAnchor;
}

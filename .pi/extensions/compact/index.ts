import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";
import { createMicroCompact } from "../../../server/services/compact/microCompact.js";
import { createContextCollapser, getLatestSummaryAnchor } from "../../../server/services/compact/contextCollapse.js";

const microCompact = createMicroCompact();
const contextCollapser = createContextCollapser();

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx) => {
    const usage = ctx.getContextUsage();
    if (!usage?.tokens) {
      return {};
    }

    let messages = event.messages;

    // 1. Micro Compact（如果启用）
    if (microCompact.getConfig().enabled) {
      const toPrune = microCompact.findToolResultsToPrune(messages);
      if (toPrune.length > 0) {
        // 持久化完整内容到 transcript
        for (const target of toPrune) {
          const content = target.toolMessage.content
            .filter((part: TextContent | ImageContent): part is TextContent => part.type === "text")
            .map(part => part.text)
            .join("");

          // Use appendCustomEntry to get entry ID back (api.appendEntry returns void)
          (ctx.sessionManager as any).appendCustomEntry("micro_compact", {
            originalContent: content,
            toolName: target.toolMessage.toolName,
            truncatedAt: Date.now(),
            originalMessageIndex: target.messageIndex,  // Fixed: was messageIndex
          });
        }

        // 执行 truncate
        messages = microCompact.truncateToolResults(messages, toPrune);
      }
    }

    // 2. Context Collapse（如果启用且达到阈值）
    const ccConfig = contextCollapser.getConfig();
    if (ccConfig.enabled && contextCollapser.shouldCollapse(usage.tokens, usage.contextWindow)) {
      // 获取上次的 SummaryAnchor
      const entries = ctx.sessionManager.getEntries();
      const latestAnchor = getLatestSummaryAnchor(entries as any[]);

      // 计算边界
      const boundary = contextCollapser.calculateBoundary(messages, latestAnchor);
      if (boundary) {
        // 获取 model 和 API key 用于生成摘要
        const model = ctx.model;
        let apiKey: string | undefined;
        if (model) {
          apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
        }

        // 生成摘要
        const summary = await contextCollapser.generateSummary(
          messages,
          boundary.headIndex,
          boundary.tailIndex,
          model,
          apiKey,
          ctx.signal
        );

        // 创建投影
        const projected = contextCollapser.createProjection(messages, boundary, summary);

        // 持久化 Summary Anchor（获取 entry ID）
        (ctx.sessionManager as any).appendCustomEntry("summary_anchor", {
          headIndex: boundary.headIndex,
          tailIndex: boundary.tailIndex,
          summary,
          tokensBefore: usage.tokens,
          createdAt: Date.now(),
          layer: "context_collapse",
        });

        // 通知用户
        if (ctx.ui) {
          ctx.ui.notify(
            `Context Collapse: compressed ${boundary.tailIndex - boundary.headIndex} messages`,
            "info"
          );
        }

        return { messages: projected };
      }
    }

    return { messages };
  });
}

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
import { createMicroCompact } from "../../../server/services/compact/microCompact.js";

const microCompact = createMicroCompact();

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx) => {
    // 1. 检查是否启用
    const config = microCompact.getConfig();
    if (!config.enabled) {
      return {};
    }

    // 2. 找到需要 prune 的 tool results
    const toPrune = microCompact.findToolResultsToPrune(event.messages);
    if (toPrune.length === 0) {
      return {};
    }

    // 3. 持久化完整内容到 transcript
    for (const target of toPrune) {
      const content = target.toolMessage.content
        .filter((part: TextContent | ImageContent): part is TextContent => part.type === "text")
        .map(part => part.text)
        .join("");

      api.appendEntry("micro_compact", {
        originalContent: content,
        toolName: target.toolMessage.toolName,
        truncatedAt: Date.now(),
        messageIndex: target.messageIndex,
      });
    }

    // 4. 执行 truncate（immutable 方式）
    const modifiedMessages = microCompact.truncateToolResults(event.messages, toPrune);

    // 5. 通知用户（可选）
    if (ctx.ui) {
      ctx.ui.notify(
        `Micro Compact: pruned ${toPrune.length} old tool results`,
        "info"
      );
    }

    return { messages: modifiedMessages };
  });
}

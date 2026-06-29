/**
 * Memory Context Extension
 *
 * 在 Session 开始时将 MEMORY.md 内容注入到 agent context
 */

import type { ExtensionAPI, BeforeAgentStartEvent } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import { readMemorySync } from "../../../server/services/memory/storage.js";

const MEMORY_CONTEXT_HEADER = "【历史记忆】以下是你之前会话中沉淀的重要信息，请参考：\n\n";

export default function (api: ExtensionAPI) {
  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    // 检查是否有 MEMORY.md
    const memoryContent = readMemorySync(ctx.cwd);

    if (!memoryContent || memoryContent.trim() === "# Memory\n\n") {
      return {};
    }

    // 每次都返回 systemPrompt，防止被重置回 base
    return {
      systemPrompt: MEMORY_CONTEXT_HEADER + memoryContent,
    };
  });
}

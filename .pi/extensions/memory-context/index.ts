/**
 * Memory Context Extension
 *
 * 在 Session 开始时将 MEMORY.md 内容注入到 agent context
 */

import type { ExtensionAPI, BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import { readMemorySync } from "../../../server/services/memory/storage.js";

const MEMORY_CONTEXT_HEADER = "【历史记忆】以下是你之前会话中沉淀的重要信息，请参考：\n\n";

export default function (api: ExtensionAPI) {
  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    // 检查是否有 MEMORY.md
    const memoryContent = readMemorySync(ctx.cwd);

    // 检查是否有真实的 session 条目（仅 header 时不注入）
    if (!memoryContent || !memoryContent.includes("## Session:")) {
      return {};
    }

    // 每次都返回 systemPrompt，防止被重置回 base
    return {
      systemPrompt: MEMORY_CONTEXT_HEADER + memoryContent,
    };
  });
}

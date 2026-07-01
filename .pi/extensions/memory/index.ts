/**
 * Memory Consolidation - Extension Entry
 *
 * Hooks into context event to trigger memory consolidation at 50% token usage
 */

import type { ExtensionAPI, ContextEvent } from "@earendil-works/pi-coding-agent";
import { createMemoryConsolidationEngine } from "../../../server/services/memory/engine.js";
import { MEMORY_THRESHOLD } from "../../../server/services/memory/types.js";

const engine = createMemoryConsolidationEngine();

export default function (api: ExtensionAPI) {
  api.on("context", async (event: ContextEvent, ctx) => {
    const usage = ctx.getContextUsage();
    if (!usage?.percent) {
      return {};
    }

    // Trigger at 50% threshold (no upper bound - handles catch-up from blind spot)
    // Engine's findConsolidationStart prevents duplicate consolidation
    if (usage.percent >= MEMORY_THRESHOLD) {
      console.log(
        `[MemoryConsolidation] Triggered at ${(usage.percent * 100).toFixed(1)}% token usage`
      );

      const result = await engine.consolidate(event.messages, ctx, api);

      if (result.isUseful) {
        console.log(
          `[MemoryConsolidation] Summarized ${result.messageCount} messages, wrote to MEMORY.md`
        );

        // Notify user
        if (ctx.ui) {
          ctx.ui.notify(
            `Memory consolidation: wrote summary to MEMORY.md`,
            "info"
          );
        }
      } else if (result.success && !result.isUseful) {
        console.log(
          `[MemoryConsolidation] No useful content to summarize, pointer advanced`
        );
      }
    }

    return {};
  });
}

/**
 * Memory Consolidation - Engine
 *
 * Core consolidation logic
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import {
  type ConsolidationState,
  type ConsolidationResult,
  CUSTOM_ENTRY_TYPE,
  INVALIDATION_ENTRY_TYPE,
  MIN_SUMMARY_LENGTH,
} from "./types.js";
import { appendMemory } from "./storage.js";
import { summarizeMessages } from "./llm.js";

interface InvalidationData {
  invalidatedEntryId: string;
  invalidatedAt: number;
  reason: string;
}

interface SessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  customType?: string;
  data?: ConsolidationState | InvalidationData;
}

function isInvalidated(entries: SessionEntry[], entryId: string): boolean {
  return entries.some((e) => {
    if (e.type !== "custom" || e.customType !== INVALIDATION_ENTRY_TYPE) {
      return false;
    }
    const data = e.data as InvalidationData | undefined;
    return data?.invalidatedEntryId === entryId;
  });
}

function getLastValidState(entries: SessionEntry[]): ConsolidationState | null {
  const consolidations = entries.filter(
    (e) => e.type === "custom" && e.customType === CUSTOM_ENTRY_TYPE
  );

  if (consolidations.length === 0) return null;

  // Find last non-invalidated
  for (let i = consolidations.length - 1; i >= 0; i--) {
    const entry = consolidations[i];
    if (entry && !isInvalidated(entries, entry.id)) {
      return entry.data as ConsolidationState;
    }
  }

  return null;
}

function findConsolidationStart(
  currentMessageCount: number,
  lastState: ConsolidationState | null
): { startIndex: number; hasNewMessages: boolean } {
  if (!lastState) {
    return { startIndex: 0, hasNewMessages: true };
  }

  const newMessagesCount = currentMessageCount - lastState.messageCountAtConsolidation;

  if (newMessagesCount <= 0) {
    return {
      startIndex: lastState.messageCountAtConsolidation,
      hasNewMessages: false,
    };
  }

  return {
    startIndex: lastState.messageCountAtConsolidation,
    hasNewMessages: true,
  };
}

export interface MemoryConsolidationEngine {
  consolidate(
    messages: AgentMessage[],
    ctx: ExtensionContext,
    api: ExtensionAPI
  ): Promise<ConsolidationResult>;
}

export function createMemoryConsolidationEngine(): MemoryConsolidationEngine {
  return {
    async consolidate(
      messages: AgentMessage[],
      ctx: ExtensionContext,
      api: ExtensionAPI
    ): Promise<ConsolidationResult> {
      const currentMessageCount = messages.length;

      // Get entries from session
      const entries = ctx.sessionManager.getEntries() as SessionEntry[];
      const lastState = getLastValidState(entries);

      // Check if there are new messages
      const { startIndex, hasNewMessages } = findConsolidationStart(
        currentMessageCount,
        lastState
      );

      if (!hasNewMessages) {
        return {
          success: true,
          summaryText: "",
          messageCount: currentMessageCount,
          isUseful: false,
        };
      }

      // Slice messages to consolidate
      const toConsolidate = messages.slice(startIndex);

      // Get model and API key
      const model = ctx.model;
      if (!model) {
        console.error("[MemoryConsolidation] No model available");
        return {
          success: false,
          summaryText: "",
          messageCount: currentMessageCount,
          isUseful: false,
        };
      }

      const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
      if (!apiKey) {
        console.error("[MemoryConsolidation] No API key available");
        return {
          success: false,
          summaryText: "",
          messageCount: currentMessageCount,
          isUseful: false,
        };
      }

      // Generate summary via LLM
      let summaryText: string;
      try {
        summaryText = await summarizeMessages(toConsolidate, model, apiKey, ctx.signal);
      } catch (error: any) {
        console.error("[MemoryConsolidation] LLM call failed:", error.message);
        return {
          success: false,
          summaryText: "",
          messageCount: currentMessageCount,
          isUseful: false,
        };
      }

      // Get token usage (needed for both MEMORY.md write and state record)
      const usage = ctx.getContextUsage();
      const tokensAtConsolidation = usage?.tokens ?? 0;

      // Check if summary is useful
      const isUseful =
        summaryText.length >= MIN_SUMMARY_LENGTH && summaryText !== "SKIP";

      if (isUseful) {
        // Get session ID from session manager
        const sessionId = ctx.sessionManager.getSessionId();

        // Append to MEMORY.md
        try {
          await appendMemory(ctx.cwd, {
            sessionId,
            timestamp: new Date().toISOString(),
            tokenRange: {
              start: lastState?.tokensAtConsolidation ?? 0,
              end: tokensAtConsolidation,
            },
            messageCount: toConsolidate.length,
            summary: summaryText,
          });
        } catch (error: any) {
          console.error("[MemoryConsolidation] Failed to write to MEMORY.md:", error.message);
        }
      }

      // Always record state (even if SKIP) so pointer advances
      // Use api.appendEntry since it's on ExtensionAPI, not ExtensionContext
      api.appendEntry(CUSTOM_ENTRY_TYPE, {
        messageCountAtConsolidation: currentMessageCount,
        tokensAtConsolidation,
        summaryText,
        createdAt: Date.now(),
      });

      return {
        success: true,
        summaryText,
        messageCount: currentMessageCount,
        isUseful,
      };
    },
  };
}

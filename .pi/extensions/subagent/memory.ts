/**
 * Memory
 * 子 agent 记忆管理
 * 复用 Krebs 的 memory 服务进行 consolidated memory
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/**
 * SubagentMemory manages memory for a subagent session
 * Uses the parent's memory engine for consolidated memory
 */
export class SubagentMemory {
  private session: AgentSession;
  private parentMemoryKey: string;
  private entries: MemoryEntry[] = [];

  constructor(session: AgentSession, parentMemoryKey: string) {
    this.session = session;
    this.parentMemoryKey = parentMemoryKey;
  }

  /**
   * Add a memory entry
   */
  add(content: string, type: "observation" | "fact" | "insight" = "observation"): void {
    this.entries.push({
      id: generateMemoryId(),
      content,
      type,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all memory entries
   */
  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get memories formatted for context injection
   */
  getContextString(maxEntries: number = 10): string {
    if (this.entries.length === 0) return "";

    const recent = this.entries.slice(-maxEntries);
    const parts = recent.map((e) => `[${e.type}]: ${e.content}`);

    return `# Subagent Memory\n${parts.join("\n")}\n`;
  }

  /**
   * Search memories by keyword
   */
  search(keyword: string): MemoryEntry[] {
    const lower = keyword.toLowerCase();
    return this.entries.filter((e) =>
      e.content.toLowerCase().includes(lower)
    );
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Merge memories from parent context
   */
  mergeFromParent(parentMemories: MemoryEntry[]): void {
    // Avoid duplicates by checking content
    const existing = new Set(this.entries.map((e) => e.content));
    for (const mem of parentMemories) {
      if (!existing.has(mem.content)) {
        this.entries.push(mem);
      }
    }
  }
}

export interface MemoryEntry {
  id: string;
  content: string;
  type: "observation" | "fact" | "insight";
  timestamp: number;
}

/**
 * Memory store for all subagents (keyed by parent session id)
 */
class MemoryStore {
  private byParent = new Map<string, SubagentMemory>();

  getOrCreate(session: AgentSession, parentMemoryKey: string): SubagentMemory {
    const key = `${session.sessionId}:${parentMemoryKey}`;
    let mem = this.byParent.get(key);
    if (!mem) {
      mem = new SubagentMemory(session, parentMemoryKey);
      this.byParent.set(key, mem);
    }
    return mem;
  }

  clear(sessionId: string): void {
    for (const [key, mem] of this.byParent.entries()) {
      if (key.startsWith(sessionId)) {
        mem.clear();
        this.byParent.delete(key);
      }
    }
  }
}

const memoryStore = new MemoryStore();

/**
 * Get or create memory for a subagent session
 */
export function getSubagentMemory(
  session: AgentSession,
  parentMemoryKey: string = "default"
): SubagentMemory {
  return memoryStore.getOrCreate(session, parentMemoryKey);
}

/**
 * Extract memory-worthy content from agent messages
 */
export function extractMemoryContent(messages: AgentMessage[]): string[] {
  const content: string[] = [];

  for (const msg of messages) {
    if (msg.role === "assistant" && "content" in msg && msg.content) {
      const msgContent = msg.content as any;

      // Extract tool calls as observations
      if (typeof msgContent === "object" && "tool_calls" in msgContent) {
        const toolCalls = msgContent.tool_calls;
        for (const tc of toolCalls ?? []) {
          if (tc.function?.name) {
            content.push(`Used tool: ${tc.function.name}`);
          }
        }
      }

      // Extract text content as insights
      if (typeof msgContent === "string") {
        const text = msgContent.trim();
        if (text.length > 20) {
          content.push(text);
        }
      } else if (Array.isArray(msgContent)) {
        for (const part of msgContent) {
          if (part.type === "text" && part.text) {
            const text = part.text.trim();
            if (text.length > 20) {
              content.push(text);
            }
          }
        }
      }
    }
  }

  return content;
}

/**
 * Generate unique memory ID
 */
function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Clear memory for a session
 */
export function clearSubagentMemory(sessionId: string): void {
  memoryStore.clear(sessionId);
}

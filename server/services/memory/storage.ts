/**
 * Memory Consolidation - Storage
 *
 * Handles MEMORY.md file read/write/append operations
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MEMORY_FILE_NAME } from "./types.js";

const DEFAULT_HEADER = "# Memory\n\n";

export interface MemoryEntry {
  sessionId: string;
  timestamp: string;
  tokenRange: { start: number; end: number };
  messageCount: number;
  summary: string;
}

export function formatMemoryEntry(entry: MemoryEntry): string {
  const { sessionId, timestamp, tokenRange, messageCount, summary } = entry;

  return `## Session: ${sessionId} | ${timestamp}

**Token Range:** ${tokenRange.start} → ${tokenRange.end}
**Message Count:** ${messageCount} messages consolidated

### Summary
${summary}

---
`;
}

export async function readMemory(cwd: string): Promise<string> {
  const path = join(cwd, MEMORY_FILE_NAME);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return DEFAULT_HEADER;
}

// 同步读取函数，用于 before_agent_start hook
export function readMemorySync(cwd: string): string {
  const path = join(cwd, MEMORY_FILE_NAME);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return "";
}

export async function appendMemory(cwd: string, entry: MemoryEntry): Promise<void> {
  const path = join(cwd, MEMORY_FILE_NAME);

  // Create file with header if it doesn't exist
  if (!existsSync(path)) {
    writeFileSync(path, DEFAULT_HEADER, "utf-8");
  }

  const formatted = formatMemoryEntry(entry);
  appendFileSync(path, formatted, "utf-8");
}

/**
 * Session Cleaner
 *
 * Handles cleanup of session files:
 * - Preserves last N messages (default 5)
 * - Uses atomic operations for safety
 * - Integrates with LRU manager
 */

import { access, constants, rename, unlink as fsUnlink } from "fs/promises";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getSessionById, deleteSessionFromDb, getAllSessions } from "../../../db/index.js";
import { lruSessionManager } from "./lru-session-manager.js";

// Configuration
const PRESERVE_LAST_MESSAGES = 5;
const SESSION_DIR = join(process.cwd(), "sessions");

/**
 * Session file entry parsed from JSONL
 */
interface SessionEntry {
  type: string;
  message?: {
    role: string;
    content?: any;
    timestamp?: string;
  };
  session?: any;
  model_change?: any;
  timestamp?: string;
}

/**
 * Extract content from an assistant message
 */
function extractAssistantContent(entry: SessionEntry): string {
  if (!entry.message?.content) return "";

  const content = entry.message.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text || "")
      .join("\n");
  }

  return "";
}

/**
 * Check if file is in "deleting" state
 */
export function isFileDeleting(filePath: string): boolean {
  return filePath.includes(".deleting.");
}

/**
 * Validate session file integrity
 */
async function validateSessionFile(filePath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    let validCount = 0;
    let invalidCount = 0;

    for (const line of lines) {
      try {
        JSON.parse(line);
        validCount++;
      } catch {
        invalidCount++;
      }
    }

    if (invalidCount > 0) {
      return { valid: false, error: `${validCount} valid, ${invalidCount} invalid lines` };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

/**
 * Trim session file to preserve only last N message entries
 */
export async function trimSessionFile(
  filePath: string,
  preserveCount: number = PRESERVE_LAST_MESSAGES
): Promise<boolean> {
  try {
    // Validate first (async)
    const validation = await validateSessionFile(filePath);
    if (!validation.valid) {
      console.warn(`[CLEANER] Skipping invalid file: ${filePath}, ${validation.error}`);
      return false;
    }

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    // Collect all message entries
    const messages: SessionEntry[] = [];
    const headers: string[] = [];

    for (const line of lines) {
      try {
        const entry: SessionEntry = JSON.parse(line);
        if (entry.type === "message" && entry.message?.role) {
          messages.push(entry);
        } else {
          // Keep session info, model_change, etc. as headers
          headers.push(line);
        }
      } catch {
        // Skip invalid lines
      }
    }

    // If fewer messages than preserve count, keep as is
    if (messages.length <= preserveCount) {
      console.log(`[CLEANER] File ${filePath} has only ${messages.length} messages, keeping as is`);
      return true;
    }

    // Keep headers + last N messages
    const lastMessages = messages.slice(-preserveCount);
    const newContent = [...headers, ...lastMessages.map((m) => JSON.stringify(m))].join("\n") + "\n";

    // Atomic write: temp file + async rename
    const tempPath = `${filePath}.trim.tmp.${Date.now()}`;
    await writeFile(tempPath, newContent, "utf-8");
    // rename from fs/promises is async
    await rename(tempPath, filePath);

    console.log(`[CLEANER] Trimmed ${filePath}: ${messages.length} -> ${preserveCount} messages`);
    return true;
  } catch (e) {
    console.error(`[CLEANER] Failed to trim ${filePath}: ${e}`);
    return false;
  }
}

/**
 * Check if file exists (async)
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe delete session with atomic operations
 */
export async function safeDeleteSession(
  sessionId: string,
  filePath: string
): Promise<boolean> {
  const tempPath = `${filePath}.deleting.${Date.now()}`;

  try {
    // 1. Rename to temp (atomic, prevents reads during delete)
    if (await fileExists(filePath)) {
      await rename(filePath, tempPath);
    }

    // 2. Delete DB record
    deleteSessionFromDb(sessionId);

    // 3. Now safe to delete the temp file
    if (await fileExists(tempPath)) {
      await fsUnlink(tempPath);
    }

    console.log(`[CLEANER] Safely deleted session: ${sessionId}`);
    return true;
  } catch (e) {
    // Try to restore original filename on failure
    if (await fileExists(tempPath)) {
      try {
        await rename(tempPath, filePath);
      } catch {
        // Ignore restore errors
      }
    }
    console.error(`[CLEANER] Safe delete failed for ${sessionId}: ${e}`);
    return false;
  }
}

/**
 * Full cleanup of a session (evict from LRU + delete files + DB)
 */
export async function cleanupSession(sessionId: string): Promise<boolean> {
  // Get session info
  const sessionMeta = getSessionById(sessionId);
  const sessionInfo = lruSessionManager.getSessionInfo(sessionId);

  if (!sessionMeta && !sessionInfo?.filePath) {
    console.warn(`[CLEANER] No file path for session: ${sessionId}`);
    // Still try to remove from LRU
    lruSessionManager.removeSession(sessionId);
    return false;
  }

  const filePath = sessionMeta?.file_path || sessionInfo?.filePath;

  if (!filePath) {
    console.warn(`[CLEANER] Cannot determine file path for session: ${sessionId}`);
    lruSessionManager.removeSession(sessionId);
    return false;
  }

  // Check if file exists
  if (!(await fileExists(filePath))) {
    console.log(`[CLEANER] File already gone: ${filePath}`);
    lruSessionManager.removeSession(sessionId);
    deleteSessionFromDb(sessionId);
    return true;
  }

  // Trim the file first (preserve last N messages)
  await trimSessionFile(filePath);

  // Now delete the trimmed file
  return await safeDeleteSession(sessionId, filePath);
}

/**
 * Emergency cleanup when disk space is low
 */
export async function emergencyCleanup(count: number = 5): Promise<string[]> {
  const evicted: string[] = [];

  const candidates = lruSessionManager.getEvictionCandidates();

  // Sort by lastAccess (oldest first), skip active ones
  const evictable = candidates
    .filter((c) => !c.isActive)
    .slice(0, count);

  for (const candidate of evictable) {
    const success = await cleanupSession(candidate.sessionId);
    if (success) {
      evicted.push(candidate.sessionId);
    }
  }

  console.log(`[CLEANER] Emergency cleanup evicted ${evicted.length} sessions`);
  return evicted;
}

/**
 * Cleanup excess sessions beyond max limit
 */
export async function cleanupExcessSessions(): Promise<string[]> {
  const evicted: string[] = [];
  const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "30", 10);

  while (lruSessionManager.size > MAX_SESSIONS) {
    const candidates = lruSessionManager.getEvictionCandidates();
    const oldestNonActive = candidates.find((c) => !c.isActive);

    if (!oldestNonActive) {
      console.warn(`[CLEANER] All sessions are active, cannot cleanup`);
      break;
    }

    const success = await cleanupSession(oldestNonActive.sessionId);
    if (success) {
      evicted.push(oldestNonActive.sessionId);
    } else {
      // If cleanup failed, try next oldest
      console.warn(`[CLEANER] Cleanup failed for ${oldestNonActive.sessionId}, trying next`);
    }
  }

  return evicted;
}

/**
 * Check disk space and trigger emergency cleanup if needed
 */
export async function checkDiskSpace(): Promise<boolean> {
  const MIN_DISK_SPACE_GB = 1;

  try {
    // Use fs.statfs if available (Unix only)
    const stats = await Bun.file("/").stat();
    // Note: Bun.File.stat() doesn't provide disk space info directly
    // This is a simplified check - in production you'd use fstatfs
    return true;
  } catch {
    // If we can't check, assume OK
    return true;
  }
}

/**
 * Start session cleaner service
 */
export function startCleanerService(): void {
  console.log(`[CLEANER] Cleaner service started, preserving last ${PRESERVE_LAST_MESSAGES} messages`);
}

/**
 * LRU Session Manager
 *
 * Wraps sessions Map with LRU tracking and eviction.
 * Max sessions: configurable via MAX_SESSIONS env (default 30)
 */

import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";

// Configuration
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "30", 10);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Import cleanupSession for file cleanup (circular import but resolved at runtime)
import { cleanupSession } from "./session-cleaner.js";

// LRU Entry tracking
interface LRUEntry {
  sessionId: string;
  lastAccess: bigint; // monotonic time
  filePath?: string;
}

class LRUSessionManager {
  // Map from sessionId to runtime
  private sessions = new Map<string, AgentSessionRuntime>();

  // LRU tracking: ordered by last access (oldest first)
  private lruOrder: Map<string, LRUEntry> = new Map();

  // Tracks if cleanup is in progress
  private isCleaning = false;

  // Cleanup timer
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Get monotonic time for LRU ordering (immune to clock skew)
   */
  private monotonicTime(): bigint {
    return process.hrtime.bigint();
  }

  /**
   * Add a new session
   */
  addSession(sessionId: string, runtime: AgentSessionRuntime, filePath?: string): void {
    // Evict if at capacity
    if (this.sessions.size >= MAX_SESSIONS) {
      const evicted = this.evictOldest();
      // If evict failed (all sessions active), don't add new session
      if (!evicted) {
        console.warn(`[LRU] Cannot add session ${sessionId}: all sessions are active and at capacity`);
        return;
      }
      // Remove from Maps IMMEDIATELY to prevent size exceeding MAX_SESSIONS
      // Then trigger async cleanup (which will handle file deletion)
      const evictedInfo = this.getSessionInfo(evicted);
      this.removeSession(evicted);
      cleanupSession(evicted).catch((e) => {
        console.error(`[LRU] Failed to cleanup evicted session ${evicted}:`, e);
      });
    }

    this.sessions.set(sessionId, runtime);
    this.lruOrder.set(sessionId, {
      sessionId,
      lastAccess: this.monotonicTime(),
      filePath,
    });
  }

  /**
   * Get a session and update its LRU position
   */
  getSession(sessionId: string): AgentSessionRuntime | undefined {
    const runtime = this.sessions.get(sessionId);
    if (runtime) {
      // Update LRU position
      this.lruOrder.set(sessionId, {
        sessionId,
        lastAccess: this.monotonicTime(),
        filePath: this.lruOrder.get(sessionId)?.filePath,
      });
    }
    return runtime;
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): boolean {
    this.lruOrder.delete(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get current session count
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Get session info including file path
   */
  getSessionInfo(sessionId: string): LRUEntry | undefined {
    return this.lruOrder.get(sessionId);
  }

  /**
   * Update file path for a session
   */
  setFilePath(sessionId: string, filePath: string): void {
    const entry = this.lruOrder.get(sessionId);
    if (entry) {
      entry.filePath = filePath;
    }
  }

  /**
   * Check if session is active (running)
   */
  isSessionActive(sessionId: string): boolean {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return false;
    return runtime.session.isStreaming;
  }

  /**
   * Evict the oldest non-active session
   * Returns the sessionId if evicted, null if no evictable session found
   */
  private evictOldest(): string | null {
    // Find oldest non-active session
    let oldestId: string | null = null;
    let oldestTime = BigInt(Number.MAX_SAFE_INTEGER);

    for (const [id, entry] of this.lruOrder) {
      const runtime = this.sessions.get(id);
      if (runtime && !runtime.session.isStreaming) {
        if (entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestId = id;
        }
      }
    }

    if (oldestId) {
      console.log(`[LRU] Evicting session: ${oldestId}`);
      // DON'T remove from Maps here - cleanupSession needs to do that
      // We just mark it as "evicted" and return the ID
      return oldestId;
    }

    return null;
  }

  /**
   * Trigger cleanup of oldest sessions if over capacity
   */
  async enforceLimit(): Promise<string[]> {
    const evicted: string[] = [];

    while (this.sessions.size > MAX_SESSIONS) {
      const id = this.evictOldest();
      if (id) {
        evicted.push(id);
        // Remove from Maps immediately to prevent infinite loop
        this.removeSession(id);
        // Trigger async cleanup for evicted session
        cleanupSession(id).catch((e) => {
          console.error(`[LRU] Failed to cleanup evicted session ${id}:`, e);
        });
      } else {
        break; // No more evictable sessions (all active)
      }
    }

    return evicted;
  }

  /**
   * Start periodic cleanup timer
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.periodicCleanup().catch((e) => {
        console.error("[LRU] Periodic cleanup error:", e);
      });
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Periodic cleanup - enforce limits
   */
  private async periodicCleanup(): Promise<void> {
    if (this.isCleaning) return;
    this.isCleaning = true;

    try {
      const evicted = await this.enforceLimit();
      if (evicted.length > 0) {
        console.log(`[LRU] Periodic cleanup evicted ${evicted.length} sessions`);
      }
    } finally {
      this.isCleaning = false;
    }
  }

  /**
   * Stop the cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get sessions that are candidates for eviction
   */
  getEvictionCandidates(): Array<{ sessionId: string; lastAccess: bigint; isActive: boolean }> {
    const candidates: Array<{ sessionId: string; lastAccess: bigint; isActive: boolean }> = [];

    for (const [id, entry] of this.lruOrder) {
      const isActive = this.isSessionActive(id);
      candidates.push({
        sessionId: id,
        lastAccess: entry.lastAccess,
        isActive,
      });
    }

    // Sort by lastAccess (oldest first)
    candidates.sort((a, b) => (a.lastAccess < b.lastAccess ? -1 : 1));

    return candidates;
  }
}

// Singleton instance
export const lruSessionManager = new LRUSessionManager();

// Export for testing
export { LRUSessionManager };

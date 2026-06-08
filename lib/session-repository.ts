/**
 * Session Repository — 统一的 session 管理接口
 *
 * 两个适配器：
 * - InMemorySessionRepository：基于 Map，管理运行时 session
 * - SqliteSessionRepository：基于 SQLite，管理持久化 session 元数据
 */

import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

// ==================== Interface ====================

export interface SessionRepository {
  /** 存储 runtime */
  set(sessionId: string, runtime: AgentSessionRuntime): void;
  /** 获取 runtime */
  get(sessionId: string): AgentSessionRuntime | undefined;
  /** 删除 runtime */
  delete(sessionId: string): boolean;
  /** 是否存在 */
  has(sessionId: string): boolean;
  /** 列出所有 sessionId */
  keys(): IterableIterator<string>;
  /** 当前数量 */
  size: number;
}

// ==================== In-Memory Adapter ====================

/**
 * 内存版 Session Repository — 用于运行时 session 管理
 */
export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, AgentSessionRuntime>();

  set(sessionId: string, runtime: AgentSessionRuntime): void {
    this.sessions.set(sessionId, runtime);
  }

  get(sessionId: string): AgentSessionRuntime | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }

  get size(): number {
    return this.sessions.size;
  }
}

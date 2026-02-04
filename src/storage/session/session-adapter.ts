/**
 * Session Storage 适配器
 *
 * 将新的 SessionStore 适配到 ISessionStorage 接口
 * 保持与现有代码的兼容性
 */

import type { ISessionStorage } from "../interface.js";
import type { Message } from "@/types/index.js";
import { SessionStore } from "./session-store.js";
import type { SessionEntry } from "./types.js";

/**
 * SessionStorage 适配器类
 */
export class SessionStorageAdapter implements ISessionStorage {
  private readonly store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  /**
   * 保存会话
   */
  async saveSession(
    sessionId: string,
    messages: Message[],
  ): Promise<void> {
    await this.store.saveSession(sessionId, messages);
  }

  /**
   * 加载会话
   */
  async loadSession(
    sessionId: string,
  ): Promise<Message[] | null> {
    const result = await this.store.loadSession(sessionId);
    return result?.messages ?? null;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<string[]> {
    const sessions = await this.store.listSessions();
    return sessions.map((s) => s.sessionKey);
  }

  /**
   * 获取 SessionStore 实例（用于高级操作）
   */
  getStore(): SessionStore {
    return this.store;
  }

  /**
   * 更新会话元数据（扩展功能）
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionEntry>,
  ): Promise<SessionEntry | null> {
    return await this.store.updateSessionMetadata(sessionId, metadata);
  }

  /**
   * 加载完整的会话信息（包括元数据）
   */
  async loadSessionWithMetadata(
    sessionId: string,
  ): Promise<{ entry: SessionEntry; messages: Message[] } | null> {
    return await this.store.loadSession(sessionId);
  }
}

/**
 * 创建 SessionStorage 适配器
 */
export function createSessionStorageAdapter(
  baseDir: string,
  enableCache: boolean = true,
  cacheTtl: number = 45000,
): SessionStorageAdapter {
  const store = new SessionStore({
    baseDir,
    enableCache,
    cacheTtl,
  });

  return new SessionStorageAdapter(store);
}

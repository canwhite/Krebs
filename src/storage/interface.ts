/**
 * Storage 接口定义
 *
 * 目的：
 * - 解耦存储实现，允许运行时替换
 * - 支持多种存储后端（Markdown、数据库、Redis等）
 * - 便于单元测试（可注入 Mock 实现）
 */

import type { Message } from "@/types/index.js";

/**
 * 会话存储接口
 *
 * 定义会话存储的基本操作
 */
export interface ISessionStorage {
  /**
   * 保存会话
   *
   * @param sessionId - 会话ID
   * @param messages - 消息列表
   */
  saveSession(
    sessionId: string,
    messages: Message[]
  ): Promise<void>;

  /**
   * 加载会话
   *
   * @param sessionId - 会话ID
   * @returns 消息列表，如果不存在返回 null
   */
  loadSession(
    sessionId: string
  ): Promise<Message[] | null>;

  /**
   * 删除会话
   *
   * @param sessionId - 会话ID
   */
  deleteSession?(sessionId: string): Promise<void>;

  /**
   * 列出所有会话
   *
   * @returns 会话ID列表
   */
  listSessions?(): Promise<string[]>;
}

/**
 * 通用存储接口
 *
 * 定义通用的 KV 存储操作
 */
export interface IStorage {
  /**
   * 保存数据
   *
   * @param key - 键
   * @param value - 值
   */
  set(key: string, value: unknown): Promise<void>;

  /**
   * 获取数据
   *
   * @param key - 键
   * @returns 值，如果不存在返回 null
   */
  get(key: string): Promise<unknown | null>;

  /**
   * 删除数据
   *
   * @param key - 键
   */
  delete(key: string): Promise<void>;

  /**
   * 检查键是否存在
   *
   * @param key - 键
   */
  has(key: string): Promise<boolean>;

  /**
   * 列出所有键
   *
   * @param pattern - 键模式（可选）
   */
  list?(pattern?: string): Promise<string[]>;
}

/**
 * 存储适配器
 *
 * 将 SessionStore 适配为 ISessionStorage 接口
 */
export class SessionStorageAdapter implements ISessionStorage {
  constructor(private store: any) {}

  async saveSession(
    sessionId: string,
    messages: Message[]
  ): Promise<void> {
    await this.store.saveSession(sessionId, messages as any);
  }

  async loadSession(sessionId: string): Promise<Message[] | null> {
    const session = await this.store.loadSession(sessionId);
    return session?.messages as any || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.store.delete) {
      await this.store.delete(`${sessionId}.md`);
    }
  }

  async listSessions(): Promise<string[]> {
    if (this.store.listSessions) {
      const sessions = await this.store.listSessions();
      return sessions.map((s: any) => s.sessionId);
    }
    return [];
  }
}

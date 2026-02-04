/**
 * Storage 接口定义
 *
 * 目的：
 * - 解耦存储实现，允许运行时替换
 * - 支持多种存储后端（Markdown、数据库、Redis等）
 * - 便于单元测试（可注入 Mock 实现）
 */

import type { Message } from "@/types/index.js";
import type { MemorySearchResult } from "./memory/index.js";
import type { SessionEntry } from "./session/index.js";

/**
 * 记忆存储接口
 *
 * 定义长期记忆存储和搜索的基本操作
 */
export interface IMemoryStorage {
  /**
   * 搜索记忆
   *
   * @param query - 搜索查询
   * @param topK - 返回结果数量
   * @returns 搜索结果列表
   */
  search(query: string, topK?: number): Promise<MemorySearchResult[]>;

  /**
   * 启动管理器
   */
  start(): Promise<void>;

  /**
   * 停止管理器
   */
  stop(): Promise<void>;

  /**
   * 同步文件（增量更新）
   */
  sync(): Promise<void>;

  /**
   * 全量重建索引
   */
  reindex(): Promise<void>;

  /**
   * 获取统计信息
   */
  getStats(): {
    fileCount: number;
    chunkCount: number;
    totalSize: number;
  };
}

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
 * 增强版会话存储接口
 *
 * 扩展 ISessionStorage，添加元数据相关操作
 */
export interface IEnhancedSessionStorage extends ISessionStorage {
  /**
   * 更新会话元数据
   *
   * @param sessionId - 会话ID
   * @param metadata - 元数据更新
   * @returns 更新后的完整元数据，如果会话不存在返回 null
   */
  updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionEntry>
  ): Promise<SessionEntry | null>;

  /**
   * 加载会话（包含元数据）
   *
   * @param sessionId - 会话ID
   * @returns 会话元数据和消息列表，如果不存在返回 null
   */
  loadSessionWithMetadata(
    sessionId: string
  ): Promise<{ entry: SessionEntry; messages: Message[] } | null>;

  /**
   * 获取底层 SessionStore 实例（用于高级操作）
   */
  getStore(): any;
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
 * Markdown 存储适配器（旧版，兼容性保留）
 *
 * 将 Markdown SessionStore 适配为 ISessionStorage 接口
 * @deprecated 建议使用新的 session/session-adapter 中的 SessionStorageAdapter
 */
export class MarkdownSessionStorageAdapter implements ISessionStorage {
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

// 向后兼容的别名
export const SessionStorageAdapter = MarkdownSessionStorageAdapter;

/**
 * Session Storage 工厂函数
 *
 * 参考 openclaw-cn-ds 的设计
 * 提供统一的 SessionStorage 创建接口
 */

import path from "node:path";
import { createSessionStorageAdapter } from "./session-adapter.js";
import type { ISessionStorage, IEnhancedSessionStorage } from "../interface.js";
import { MarkdownSessionStorageAdapter } from "../interface.js";

/**
 * Session Storage 配置
 */
export interface SessionStorageConfig {
  /** 存储目录 */
  baseDir: string;
  /** 存储类型 */
  type?: "markdown" | "enhanced";
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存 TTL（毫秒） */
  cacheTtl?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SessionStorageConfig = {
  baseDir: "./data/sessions",
  type: "enhanced",
  enableCache: true,
  cacheTtl: 45000, // 45 秒
};

/**
 * 创建 Session Storage
 *
 * @param config - 配置对象
 * @returns SessionStorage 实例
 */
export function createSessionStorage(
  config?: Partial<SessionStorageConfig>,
): ISessionStorage {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // 确保路径是绝对路径
  const baseDir = path.resolve(fullConfig.baseDir);

  if (fullConfig.type === "enhanced") {
    // 使用增强版 SessionStore（支持文件锁、缓存、多 agent）
    return createSessionStorageAdapter(
      baseDir,
      fullConfig.enableCache,
      fullConfig.cacheTtl,
    );
  } else {
    // 使用旧版 Markdown SessionStore（向后兼容）
    const { SessionStore } = require("../markdown/store.js");
    const store = new SessionStore(baseDir);
    return new MarkdownSessionStorageAdapter(store);
  }
}

/**
 * 创建增强版 Session Storage（推荐）
 *
 * 支持更多功能，如更新元数据、加载完整会话等
 */
export function createEnhancedSessionStorage(
  config?: Partial<SessionStorageConfig>,
): IEnhancedSessionStorage {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const baseDir = path.resolve(fullConfig.baseDir);

  return createSessionStorageAdapter(
    baseDir,
    fullConfig.enableCache,
    fullConfig.cacheTtl,
  );
}

/**
 * 从环境变量创建 Session Storage
 *
 * 支持的环境变量：
 * - SESSION_STORAGE_DIR: 存储目录
 * - SESSION_STORAGE_TYPE: 存储类型（markdown/enhanced）
 * - SESSION_CACHE_ENABLED: 是否启用缓存
 * - SESSION_CACHE_TTL: 缓存 TTL（毫秒）
 */
export function createSessionStorageFromEnv(): ISessionStorage {
  const config: Partial<SessionStorageConfig> = {};

  if (process.env.SESSION_STORAGE_DIR) {
    config.baseDir = process.env.SESSION_STORAGE_DIR;
  }

  if (process.env.SESSION_STORAGE_TYPE) {
    config.type = process.env.SESSION_STORAGE_TYPE as "markdown" | "enhanced";
  }

  if (process.env.SESSION_CACHE_ENABLED !== undefined) {
    config.enableCache = process.env.SESSION_CACHE_ENABLED === "true";
  }

  if (process.env.SESSION_CACHE_TTL) {
    const ttl = parseInt(process.env.SESSION_CACHE_TTL, 10);
    if (!isNaN(ttl)) {
      config.cacheTtl = ttl;
    }
  }

  return createSessionStorage(config);
}

/**
 * Session Storage 管理器
 *
 * 单例模式，全局共享一个 Session Storage 实例
 */
class SessionStorageManager {
  private static instance: ISessionStorage | null = null;

  /**
   * 获取全局 Session Storage 实例
   */
  static getInstance(config?: Partial<SessionStorageConfig>): ISessionStorage {
    if (!this.instance) {
      this.instance = createSessionStorage(config);
    }
    return this.instance;
  }

  /**
   * 重置全局实例
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * 设置自定义实例
   */
  static setInstance(storage: ISessionStorage): void {
    this.instance = storage;
  }
}

export { SessionStorageManager };

/**
 * 增强版 Session Store
 *
 * 功能：
 * - 支持 Markdown 存储格式（增强的 frontmatter）
 * - 文件锁机制（防止并发写入）
 * - 缓存机制（TTL）
 * - SessionEntry 元数据管理
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type {
  SessionEntry,
  SessionStoreOptions,
  SessionLoadResult,
} from "./types.js";
import type { Message } from "@/types/index.js";

/**
 * Session Store 类
 */
export class SessionStore {
  private readonly baseDir: string;
  private readonly enableCache: boolean;
  private readonly cacheTtl: number;
  private readonly cache = new Map<string, { data: SessionEntry; loadedAt: number }>();

  constructor(options: SessionStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
    this.enableCache = options.enableCache ?? true;
    this.cacheTtl = options.cacheTtl ?? 45000; // 45 秒
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 获取会话文件路径
   */
  private resolveSessionPath(sessionKey: string): string {
    // 使用 session key 作为文件名，替换特殊字符
    const filename = sessionKey
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    return path.join(this.baseDir, `${filename}.md`);
  }

  /**
   * 解析 Markdown 文件（包含 frontmatter）
   */
  private parseMarkdown(content: string): {
    metadata: Partial<SessionEntry>;
    content: string;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const metadata = parseYaml(match[1]) as Partial<SessionEntry>;
      const body = match[2];
      return { metadata, content: body };
    }

    return {
      metadata: {},
      content,
    };
  }

  /**
   * 序列化为 Markdown 文件（包含 frontmatter）
   */
  private serializeMarkdown(
    metadata: Partial<SessionEntry>,
    content: string,
  ): string {
    return `---\n${stringifyYaml(metadata).trim()}\n---\n${content}`;
  }

  /**
   * 从缓存获取会话
   */
  private getCached(sessionKey: string): SessionEntry | null {
    if (!this.enableCache) return null;

    const cached = this.cache.get(sessionKey);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.loadedAt > this.cacheTtl) {
      this.cache.delete(sessionKey);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存
   */
  private setCached(sessionKey: string, entry: SessionEntry): void {
    if (!this.enableCache) return;
    this.cache.set(sessionKey, { data: entry, loadedAt: Date.now() });
  }

  /**
   * 清除缓存
   */
  private clearCached(sessionKey: string): void {
    this.cache.delete(sessionKey);
  }

  /**
   * 文件锁操作
   */
  private async withLock<T>(
    sessionKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockPath = `${this.resolveSessionPath(sessionKey)}.lock`;
    const timeoutMs = 10000; // 10 秒超时
    const pollIntervalMs = 25;
    const staleMs = 30000; // 30 秒清理过期锁
    const startedAt = Date.now();

    await this.ensureDir(this.baseDir);

    // 获取锁
    while (true) {
      try {
        const handle = await fs.open(lockPath, "wx");
        try {
          await handle.writeFile(
            JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
            "utf-8",
          );
        } catch {
          // 忽略写入错误
        }
        await handle.close();
        break;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

        const now = Date.now();
        if (now - startedAt > timeoutMs) {
          throw new Error(`Timeout acquiring lock for session: ${sessionKey}`);
        }

        // 检查是否为过期锁
        try {
          const stat = await fs.stat(lockPath);
          const ageMs = now - stat.mtimeMs;
          if (ageMs > staleMs) {
            await fs.unlink(lockPath);
            continue;
          }
        } catch {
          // 忽略错误
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    try {
      return await fn();
    } finally {
      await fs.unlink(lockPath).catch(() => {
        // 忽略删除错误
      });
    }
  }

  /**
   * 保存会话
   */
  async saveSession(
    sessionKey: string,
    messages: Message[],
    metadata: Partial<SessionEntry> = {},
  ): Promise<void> {
    await this.withLock(sessionKey, async () => {
      await this.saveSessionUnlocked(sessionKey, messages, metadata);
    });
  }

  /**
   * 保存会话（不加锁版本，内部使用）
   */
  private async saveSessionUnlocked(
    sessionKey: string,
    messages: Message[],
    metadata: Partial<SessionEntry> = {},
  ): Promise<void> {
    const filePath = this.resolveSessionPath(sessionKey);
    await this.ensureDir(path.dirname(filePath));

    // 加载现有元数据
    let existingMetadata: Partial<SessionEntry> = {};
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = this.parseMarkdown(content);
      existingMetadata = parsed.metadata;
    }

    // 合并元数据（注意顺序！）
    const now = Date.now();
    const mergedMetadata: SessionEntry = {
      ...existingMetadata,
      ...metadata,
      sessionId: metadata.sessionId ?? existingMetadata.sessionId ?? crypto.randomUUID(),
      createdAt: existingMetadata.createdAt ?? now,
      updatedAt: now, // 确保使用最新的时间
    };

    // 序列化消息内容
    const messageContent = this.serializeMessages(messages);

    // 写入文件
    const markdown = this.serializeMarkdown(mergedMetadata, messageContent);
    await fs.writeFile(filePath, markdown, "utf-8");

    // 更新缓存
    this.setCached(sessionKey, mergedMetadata);
  }

  /**
   * 序列化消息
   */
  private serializeMessages(messages: Message[]): string {
    return messages
      .map((m) => `## ${m.role}\n\n${m.content}`)
      .join("\n\n");
  }

  /**
   * 解析消息
   */
  private parseMessages(content: string): Message[] {
    const messages: Message[] = [];
    const roleRegex = /## (\w+)\n\n([\s\S]*?)(?=\n## |\n*$)/g;
    let match;

    while ((match = roleRegex.exec(content)) !== null) {
      const role = match[1] as "user" | "assistant" | "system";
      // 只添加有效的 role
      if (role === "user" || role === "assistant" || role === "system") {
        messages.push({
          role,
          content: match[2].trim(),
        });
      }
    }

    return messages;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionKey: string): Promise<SessionLoadResult | null> {
    // 先检查缓存
    const cachedEntry = this.getCached(sessionKey);
    if (cachedEntry) {
      // 从缓存获取元数据，但仍需加载消息内容
      const filePath = this.resolveSessionPath(sessionKey);
      if (existsSync(filePath)) {
        const content = await fs.readFile(filePath, "utf-8");
        const { content: body } = this.parseMarkdown(content);
        const messages = this.parseMessages(body);
        return { entry: cachedEntry, messages };
      }
    }

    const filePath = this.resolveSessionPath(sessionKey);

    if (!existsSync(filePath)) {
      return null;
    }

    const content = await fs.readFile(filePath, "utf-8");
    const { metadata, content: body } = this.parseMarkdown(content);

    const entry: SessionEntry = {
      sessionId: metadata.sessionId ?? crypto.randomUUID(),
      updatedAt: metadata.updatedAt ?? Date.now(),
      createdAt: metadata.createdAt ?? Date.now(),
      ...metadata,
    } as SessionEntry;

    const messages = this.parseMessages(body);

    // 更新缓存
    this.setCached(sessionKey, entry);

    return { entry, messages };
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionKey: string): Promise<void> {
    await this.withLock(sessionKey, async () => {
      const filePath = this.resolveSessionPath(sessionKey);
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
      this.clearCached(sessionKey);
    });
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<Array<{ sessionKey: string; entry: SessionEntry }>> {
    await this.ensureDir(this.baseDir);
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const sessions = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const sessionKey = entry.name.slice(0, -3); // 移除 .md
      const result = await this.loadSession(sessionKey);
      if (result) {
        sessions.push({ sessionKey, entry: result.entry });
      }
    }

    return sessions.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
  }

  /**
   * 更新会话元数据
   */
  async updateSessionMetadata(
    sessionKey: string,
    metadata: Partial<SessionEntry>,
  ): Promise<SessionEntry | null> {
    return await this.withLock(sessionKey, async () => {
      const filePath = this.resolveSessionPath(sessionKey);
      if (!existsSync(filePath)) {
        return null;
      }

      // 读取现有内容
      const content = await fs.readFile(filePath, "utf-8");
      const { metadata: existingMetadata, content: body } = this.parseMarkdown(content);

      if (!existingMetadata.sessionId) {
        return null;
      }

      // 合并元数据
      const merged: SessionEntry = {
        ...existingMetadata as SessionEntry,
        ...metadata,
        updatedAt: Date.now(),
      };

      // 解析消息
      const messages = this.parseMessages(body);

      // 直接保存（使用内部方法，不加锁）
      await this.saveSessionUnlocked(sessionKey, messages, merged);

      return merged;
    });
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

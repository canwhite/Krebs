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
import { createLogger } from "@/shared/logger.js";

/**
 * Session Store 类
 */
export class SessionStore {
  private readonly baseDir: string;
  private readonly enableCache: boolean;
  private readonly cacheTtl: number;
  private readonly cache = new Map<string, { data: SessionEntry; loadedAt: number }>();
  private readonly logger = createLogger("SessionStore");

  constructor(options: SessionStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
    this.enableCache = options.enableCache ?? true;
    this.cacheTtl = options.cacheTtl ?? 45000; // 45 秒
    this.logger.info(`SessionStore initialized: baseDir=${this.baseDir}, enableCache=${this.enableCache}, cacheTtl=${this.cacheTtl}`);
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
    const filePath = path.join(this.baseDir, `${filename}.md`);
    this.logger.debug(`resolveSessionPath: sessionKey="${sessionKey}" -> filename="${filename}.md" -> path="${filePath}"`);
    return filePath;
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
    this.logger.debug(`saveSession called: sessionKey="${sessionKey}", messages=${messages.length}, metadata=${JSON.stringify(metadata)}`);
    await this.withLock(sessionKey, async () => {
      await this.saveSessionUnlocked(sessionKey, messages, metadata);
    });
    this.logger.debug(`saveSession completed: sessionKey="${sessionKey}"`);
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
    this.logger.debug(`saveSessionUnlocked: sessionKey="${sessionKey}", filePath="${filePath}", incomingMessages=${messages.length}`);
    await this.ensureDir(path.dirname(filePath));

    // 加载现有元数据和消息
    let existingMetadata: Partial<SessionEntry> = {};
    let existingMessages: Message[] = [];

    if (existsSync(filePath)) {
      this.logger.debug(`Existing session file found, loading metadata and messages`);
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = this.parseMarkdown(content);
      existingMetadata = parsed.metadata;
      existingMessages = this.parseMessages(parsed.content);
      this.logger.debug(`Loaded existing: metadata=${JSON.stringify(existingMetadata)}, messages=${existingMessages.length}`);
    } else {
      this.logger.debug(`No existing session file, creating new one`);
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

    // 合并消息：现有消息 + 新消息
    // 实现去重逻辑，避免重复添加相同的消息
    const allMessages = this.mergeMessagesWithoutDuplicates(existingMessages, messages);
    this.logger.info(`Merged messages: existing=${existingMessages.length}, new=${messages.length}, total=${allMessages.length} (after deduplication)`);

    // 序列化消息内容
    const messageContent = this.serializeMessages(allMessages);

    // 写入文件
    const markdown = this.serializeMarkdown(mergedMetadata, messageContent);
    await fs.writeFile(filePath, markdown, "utf-8");

    // 更新缓存
    this.setCached(sessionKey, mergedMetadata);

    this.logger.info(`Session saved successfully: sessionKey="${sessionKey}", sessionId="${mergedMetadata.sessionId}", totalMessages=${allMessages.length}, fileSize=${markdown.length}`);
  }

  /**
   * 合并消息并去重
   *
   * 避免重复保存相同的消息。基于内容、角色和时间戳进行去重。
   */
  private mergeMessagesWithoutDuplicates(
    existingMessages: Message[],
    newMessages: Message[]
  ): Message[] {
    // 如果现有消息为空，直接返回新消息
    if (existingMessages.length === 0) {
      return [...newMessages];
    }

    // 如果新消息为空，返回现有消息
    if (newMessages.length === 0) {
      return [...existingMessages];
    }

    // 创建现有消息的指纹集合用于快速查找
    const existingFingerprints = new Set<string>();
    for (const msg of existingMessages) {
      const fingerprint = this.getMessageFingerprint(msg);
      existingFingerprints.add(fingerprint);
    }

    // 过滤新消息，只保留不在现有消息中的
    const uniqueNewMessages: Message[] = [];
    for (const msg of newMessages) {
      const fingerprint = this.getMessageFingerprint(msg);
      if (!existingFingerprints.has(fingerprint)) {
        uniqueNewMessages.push(msg);
        existingFingerprints.add(fingerprint); // 添加到集合，避免新消息之间的重复
      } else {
        this.logger.debug(`Skipping duplicate message: ${fingerprint}`);
      }
    }

    this.logger.debug(`Deduplication: existing=${existingMessages.length}, new=${newMessages.length}, unique=${uniqueNewMessages.length}`);

    // 返回合并后的消息（现有消息 + 去重后的新消息）
    return [...existingMessages, ...uniqueNewMessages];
  }

  /**
   * 生成消息指纹用于去重
   *
   * 基于角色、内容和时间戳（精确到秒）生成唯一标识
   */
  private getMessageFingerprint(msg: Message): string {
    // 使用角色和内容作为主要标识
    // 对于工具调用，包含toolCalls信息
    let contentHash = msg.content || '';

    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      // 对toolCalls进行稳定序列化
      const toolCallsStr = JSON.stringify(msg.toolCalls, Object.keys(msg.toolCalls).sort());
      contentHash += `|toolCalls:${toolCallsStr}`;
    }

    // 时间戳精确到秒，避免毫秒级差异导致无法匹配
    const timestampSec = Math.floor((msg.timestamp || Date.now()) / 1000);

    return `${msg.role}|${contentHash}|${timestampSec}`;
  }

  /**
   * 序列化消息
   *
   * 支持：
   * - 普通 user/assistant/system 消息
   * - tool_calls (assistant 的工具调用)
   * - tool_result (工具执行结果)
   */
  private serializeMessages(messages: Message[]): string {
    return messages
      .map((m) => {
        let lines: string[] = [];

        // 基础 role
        lines.push(`## ${m.role}`);

        // 如果有 tool_calls，序列化
        if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
          lines.push(`\n### tool_calls\n`);
          lines.push(`\n${JSON.stringify(m.toolCalls, null, 2)}\n`);
        }

        // 消息内容
        if (m.content) {
          lines.push(`\n${m.content}`);
        }

        return lines.join("");
      })
      .join("\n\n");
  }

  /**
   * 解析消息
   *
   * 支持：
   * - 普通 user/assistant/system 消息
   * - tool_calls (assistant 的工具调用)
   * - tool_result (工具执行结果)
   */
  private parseMessages(content: string): Message[] {
    const messages: Message[] = [];
    // 修复正则：支持 ## role\n内容 和 ## role\n\n内容 两种格式
    const messageRegex = /## (\w+)\n(\n?)([\s\S]*?)(?=\n## |\n*$)/g;
    let match;

    while ((match = messageRegex.exec(content)) !== null) {
      const role = match[1] as "user" | "assistant" | "system";

      // 只添加有效的 role
      if (role !== "user" && role !== "assistant" && role !== "system") {
        continue;
      }

      const messageContent = match[3]; // 第3个捕获组是内容

      // 检查是否包含 tool_calls
      const toolCallsMatch = messageContent.match(/### tool_calls\n\n([\s\S]*?)\n\n/);

      let toolCalls: any[] | undefined;
      if (toolCallsMatch) {
        try {
          toolCalls = JSON.parse(toolCallsMatch[1].trim());
        } catch (error) {
          console.warn('[SessionStore] Failed to parse tool_calls:', error);
        }
      }

      // 提取实际内容（排除 tool_calls 部分）
      let actualContent = messageContent;
      if (toolCallsMatch) {
        // 移除 tool_calls 部分
        actualContent = messageContent.replace(/### tool_calls\n\n[\s\S]*?\n\n/, "").trim();
      } else {
        actualContent = messageContent.trim();
      }

      messages.push({
        role,
        content: actualContent,
        ...(toolCalls ? { toolCalls } : {}),
        // 不添加 timestamp，因为文件中没有存储
      } as Message);
    }

    return messages;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionKey: string): Promise<SessionLoadResult | null> {
    this.logger.info(`loadSession called: sessionKey="${sessionKey}"`);

    // 先检查缓存
    const cachedEntry = this.getCached(sessionKey);
    if (cachedEntry) {
      this.logger.debug(`Cache hit for sessionKey="${sessionKey}"`);
      // 从缓存获取元数据，但仍需加载消息内容
      const filePath = this.resolveSessionPath(sessionKey);
      if (existsSync(filePath)) {
        const content = await fs.readFile(filePath, "utf-8");
        const { content: body } = this.parseMarkdown(content);
        const messages = this.parseMessages(body);
        this.logger.debug(`Loaded from cache: sessionKey="${sessionKey}", messages=${messages.length}`);
        return { entry: cachedEntry, messages };
      }
    } else {
      this.logger.debug(`Cache miss for sessionKey="${sessionKey}"`);
    }

    const filePath = this.resolveSessionPath(sessionKey);
    this.logger.debug(`Checking file existence: path="${filePath}"`);

    if (!existsSync(filePath)) {
      this.logger.warn(`Session file not found: sessionKey="${sessionKey}", path="${filePath}"`);
      return null;
    }

    this.logger.info(`Session file found: sessionKey="${sessionKey}", path="${filePath}"`);

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

    this.logger.info(`Session loaded successfully: sessionKey="${sessionKey}", entry.sessionId="${entry.sessionId}", messages=${messages.length}`);
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

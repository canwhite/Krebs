/**
 * Subagent Store (持久化存储)
 *
 * 职责：
 * - 管理 subagent 会话的持久化存储
 * - 提供保存、加载、删除会话的方法
 * - 支持会话清理策略（delete/keep）
 * - 基于 SessionStore 的设计
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { createLogger } from "@/shared/logger.js";
import type { SubagentRunRecord } from "./types.js";

const log = createLogger("SubagentStore");

export interface SubagentStoreOptions {
  baseDir: string;
  enableCache?: boolean;
  cacheTtl?: number; // 毫秒，默认 45000
}

interface CachedSession {
  messages: unknown[];
  metadata: SubagentRunRecord;
  loadedAt: number;
}

export class SubagentStore {
  private readonly baseDir: string;
  private readonly enableCache: boolean;
  private readonly cacheTtl: number;
  private readonly cache = new Map<string, CachedSession>();

  constructor(options: SubagentStoreOptions) {
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
   * 解析会话文件路径
   */
  private resolveSessionPath(sessionKey: string): string {
    // 将特殊字符替换为下划线，确保文件系统兼容性
    const safeKey = sessionKey.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.baseDir, `${safeKey}.md`);
  }

  /**
   * 保存 subagent 会话
   */
  async saveSession(
    sessionKey: string,
    messages: unknown[],
    metadata: SubagentRunRecord,
  ): Promise<void> {
    const filePath = this.resolveSessionPath(sessionKey);
    await this.ensureDir(this.baseDir);

    // 构建 frontmatter
    const frontmatter = {
      runId: metadata.runId,
      taskId: crypto.createHash("sha256").update(metadata.task).digest("hex").slice(0, 16),
      requesterSessionKey: metadata.requesterSessionKey,
      requesterDisplayKey: metadata.requesterDisplayKey,
      task: metadata.task,
      label: metadata.label,
      agentId: metadata.agentId,
      model: metadata.model,
      cleanup: metadata.cleanup,
      createdAt: metadata.createdAt,
      startedAt: metadata.startedAt,
      endedAt: metadata.endedAt,
      status: metadata.outcome?.status,
    };

    // 写入文件
    const content = this.formatSession(frontmatter, messages);
    await fs.writeFile(filePath, content, "utf-8");

    // 更新缓存
    if (this.enableCache) {
      this.cache.set(sessionKey, {
        messages,
        metadata,
        loadedAt: Date.now(),
      });
    }

    log.debug(`Saved subagent session: ${sessionKey}`);
  }

  /**
   * 加载 subagent 会话
   */
  async loadSession(
    sessionKey: string,
  ): Promise<{ messages: unknown[]; metadata: SubagentRunRecord } | null> {
    // 检查缓存
    if (this.enableCache) {
      const cached = this.cache.get(sessionKey);
      if (cached && Date.now() - cached.loadedAt < this.cacheTtl) {
        return {
          messages: cached.messages,
          metadata: cached.metadata,
        };
      }
    }

    const filePath = this.resolveSessionPath(sessionKey);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const { frontmatter, messages } = this.parseSession(content);

      // 更新缓存
      if (this.enableCache) {
        this.cache.set(sessionKey, {
          messages,
          metadata: frontmatter as unknown as SubagentRunRecord,
          loadedAt: Date.now(),
        });
      }

      return {
        messages,
        metadata: frontmatter as unknown as SubagentRunRecord,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除 subagent 会话
   */
  async deleteSession(sessionKey: string): Promise<boolean> {
    const filePath = this.resolveSessionPath(sessionKey);

    try {
      await fs.unlink(filePath);
      this.cache.delete(sessionKey);
      log.info(`Deleted subagent session: ${sessionKey}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  /**
   * 列出所有 subagent 会话
   */
  async listSessions(): Promise<Array<{ sessionKey: string; metadata: SubagentRunRecord }>> {
    await this.ensureDir(this.baseDir);
    const files = await fs.readdir(this.baseDir);
    const sessions: Array<{ sessionKey: string; metadata: SubagentRunRecord }> = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const sessionKey = file.slice(0, -3);
      const session = await this.loadSession(sessionKey);

      if (session) {
        sessions.push({
          sessionKey,
          metadata: session.metadata,
        });
      }
    }

    return sessions.sort(
      (a, b) => b.metadata.createdAt - a.metadata.createdAt,
    );
  }

  /**
   * 格式化会话内容（Markdown + frontmatter）
   */
  private formatSession(frontmatter: Record<string, unknown>, messages: unknown[]): string {
    const yaml = this.objToYaml(frontmatter);
    const content = messages.map((m) => JSON.stringify(m)).join("\n\n");
    return `---\n${yaml}---\n\n${content}`;
  }

  /**
   * 解析会话内容
   */
  private parseSession(content: string): {
    frontmatter: Record<string, unknown>;
    messages: unknown[];
  } {
    const lines = content.split("\n");
    const frontmatterEnd = lines.findIndex((line) => line === "---");

    if (frontmatterEnd === -1 || lines[0] !== "---") {
      return { frontmatter: {}, messages: [] };
    }

    const yamlLines = lines.slice(1, frontmatterEnd);
    const frontmatter = this.yamlToObj(yamlLines.join("\n"));

    const messageLines = lines.slice(frontmatterEnd + 1).join("\n");
    const messages = messageLines
      .split("\n\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    return { frontmatter, messages };
  }

  /**
   * 对象转 YAML（简化版）
   */
  private objToYaml(obj: Record<string, unknown>): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      if (value === null) {
        lines.push(`${key}: null`);
      } else if (typeof value === "string") {
        lines.push(`${key}: "${value}"`);
      } else if (typeof value === "number") {
        lines.push(`${key}: ${value}`);
      } else if (typeof value === "boolean") {
        lines.push(`${key}: ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`${key}: []`);
      } else if (typeof value === "object") {
        lines.push(`${key}: {}`);
      }
    }
    return lines.join("\n");
  }

  /**
   * YAML 转对象（简化版）
   */
  private yamlToObj(yaml: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const lines = yaml.split("\n");

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const trimmed = value.trim().replace(/^"|"$/g, "");
        obj[key] = trimmed;
      }
    }

    return obj;
  }

  /**
   * 清理过期缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

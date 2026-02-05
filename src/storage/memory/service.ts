/**
 * Memory Service - 记忆服务层
 *
 * 负责在 Agent 对话中集成长期记忆功能：
 * - 自动搜索相关记忆
 * - 触发记忆保存
 * - 管理记忆索引
 *
 * 参考：openclaw-cn-ds/src/agents/tools/memory-tool.ts
 */

import path from "node:path";
import fs from "node:fs/promises";
import { MemoryIndexManager, OllamaEmbeddingProvider } from "./index.js";
import type { IEmbeddingProvider } from "./types.js";
import type { Message } from "@/types/index.js";
import { ensureDir } from "./internal.js";

export interface MemoryServiceConfig {
  dataDir: string;
  embeddingProvider?: IEmbeddingProvider;
  searchEnabled?: boolean;
  autoSaveEnabled?: boolean;
  maxSearchResults?: number;
  minScore?: number;
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

// 为了避免与 types.ts 中的 MemorySearchResult 冲突，使用别名
export type ServiceMemorySearchResult = MemorySearchResult;

/**
 * Memory Service 类
 *
 * 提供 Agent 对话中的记忆功能
 */
export class MemoryService {
  private manager: MemoryIndexManager | null = null;
  private readonly config: Required<MemoryServiceConfig>;
  private readonly workspaceDir: string;

  constructor(config: MemoryServiceConfig) {
    this.workspaceDir = path.resolve(config.dataDir);
    this.config = {
      dataDir: config.dataDir,
      embeddingProvider: config.embeddingProvider ?? new OllamaEmbeddingProvider(),
      searchEnabled: config.searchEnabled ?? true,
      autoSaveEnabled: config.autoSaveEnabled ?? true,
      maxSearchResults: config.maxSearchResults ?? 6,
      minScore: config.minScore ?? 0.35,
    };
  }

  /**
   * 启动记忆服务
   */
  async start(): Promise<void> {
    if (!this.config.searchEnabled && !this.config.autoSaveEnabled) {
      return;
    }

    const dbPath = path.join(this.workspaceDir, ".memory", "index.sqlite");

    this.manager = new MemoryIndexManager({
      dbPath,
      workspaceDir: this.workspaceDir,
      embeddingProvider: this.config.embeddingProvider,
      chunkConfig: { tokens: 500, overlap: 50 },
    });

    await this.manager.start();
  }

  /**
   * 停止记忆服务
   */
  async stop(): Promise<void> {
    if (this.manager) {
      await this.manager.stop();
      this.manager = null;
    }
  }

  /**
   * 搜索相关记忆
   *
   * @param query - 搜索查询
   * @returns 相关记忆片段
   */
  async searchMemories(query: string): Promise<MemorySearchResult[]> {
    if (!this.manager || !this.config.searchEnabled) {
      return [];
    }

    const results = await this.manager.search(query, {
      maxResults: this.config.maxSearchResults,
      minScore: this.config.minScore,
    });

    // 返回结果
    return results.map((r) => ({
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.score,
      snippet: r.snippet,
    }));
  }

  /**
   * 为对话注入相关记忆
   *
   * 自动搜索与当前对话相关的记忆，并注入到消息列表中
   *
   * @param messages - 当前对话消息
   * @param lastMessages - 最近的消息（用于提取查询）
   * @returns 增强后的消息列表
   */
  async injectRelevantMemories(
    messages: Message[],
    lastMessages: Message[] = []
  ): Promise<Message[]> {
    if (!this.config.searchEnabled) {
      return messages;
    }

    // 从最近的消息中提取关键词作为查询
    const query = this.extractSearchQuery(lastMessages);
    if (!query) {
      return messages;
    }

    // 搜索相关记忆
    const memories = await this.searchMemories(query);
    if (memories.length === 0) {
      return messages;
    }

    // 构建记忆上下文
    const memoryContext = this.buildMemoryContext(memories);

    // 插入到消息列表前面
    return [
      {
        role: "system",
        content: `[相关记忆]\n${memoryContext}\n[以上是相关的长期记忆]`,
      },
      ...messages,
    ];
  }

  /**
   * 保存对话记忆
   *
   * 将对话内容保存到每日日志文件
   *
   * @param messages - 对话消息
   */
  async saveConversationMemory(messages: Message[]): Promise<void> {
    if (!this.config.autoSaveEnabled) {
      return;
    }

    if (messages.length === 0) {
      return;
    }

    // 创建 memory 目录
    const memoryDir = path.join(this.workspaceDir, "memory");
    ensureDir(memoryDir);

    // 生成每日日志文件名
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const logFile = path.join(memoryDir, `${today}.md`);

    // 格式化对话内容
    const content = this.formatConversation(messages);

    // 追加到文件
    await fs.appendFile(logFile, content + "\n\n", "utf-8");

    console.log(`[Memory Service] 已保存 ${messages.length} 条消息到 ${logFile}`);
  }

  /**
   * 触发记忆保存（在上下文接近限制时）
   *
   * 检查对话是否接近上下文限制，如果是则触发记忆刷新
   *
   * @param currentTokens - 当前 token 数
   * @param maxTokens - 最大 token 数
   */
  async maybeFlushMemory(
    currentTokens: number,
    maxTokens: number
  ): Promise<void> {
    if (!this.config.autoSaveEnabled) {
      return;
    }

    // 软阈值：最大 token 数 - 保留底线
    const softThreshold = maxTokens - 20000;
    if (currentTokens < softThreshold) {
      return;
    }

    // 触发索引更新（确保新内容被索引）
    if (this.manager) {
      await this.manager.sync();
      console.log(`[Memory Service] 已触发记忆刷新，当前 tokens: ${currentTokens}`);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { fileCount: number; chunkCount: number; totalSize: number } {
    if (!this.manager) {
      return { fileCount: 0, chunkCount: 0, totalSize: 0 };
    }

    return this.manager.getStats();
  }

  /**
   * 从消息中提取搜索查询
   */
  private extractSearchQuery(messages: Message[]): string {
    // 获取最后几条用户消息
    const userMessages = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content);

    if (userMessages.length === 0) {
      return "";
    }

    // 简单策略：取最后一条用户消息
    // TODO: 可以改进为提取关键词、实体等
    return userMessages[userMessages.length - 1];
  }

  /**
   * 构建记忆上下文
   */
  private buildMemoryContext(memories: MemorySearchResult[]): string {
    const parts = memories.map((m) => {
      const source = m.path.replace(/^memory\//, "");
      return `[${source}:${m.startLine}-${m.endLine}] (${m.score.toFixed(2)})\n${m.snippet}`;
    });

    return parts.join("\n\n---\n\n");
  }

  /**
   * 格式化对话为 Markdown
   */
  private formatConversation(messages: Message[]): string {
    const timestamp = new Date().toISOString();
    const lines: string[] = [];

    lines.push(`## Conversation Log - ${timestamp}`);
    lines.push("");

    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      const content = msg.content;

      // 处理多行内容
      const contentLines = content.split("\n");
      if (contentLines.length === 1) {
        lines.push(`**${role}**: ${content}`);
      } else {
        lines.push(`**${role}**:`);
        for (const line of contentLines) {
          lines.push(`> ${line}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 手动触发索引更新
   */
  async syncIndex(): Promise<void> {
    if (this.manager) {
      await this.manager.sync();
    }
  }

  /**
   * 重建索引
   */
  async reindex(): Promise<void> {
    if (this.manager) {
      await this.manager.reindex();
    }
  }
}

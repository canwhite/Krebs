/**
 * Subagent Registry (注册表)
 *
 * 职责：
 * - 管理所有 subagent 运行记录
 * - 提供注册、查询、更新、删除接口
 * - 支持内存存储和持久化
 * - 实现并发控制和资源限制
 * - 管理工具调用审计日志
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createLogger } from "@/shared/logger.js";
import type {
  SubagentRunRecord,
  SubagentConfig,
  RegisterSubagentParams,
  UpdateSubagentParams,
  SubagentToolCallLog,
  SubagentListFilter,
} from "./types.js";

const log = createLogger("SubagentRegistry");

export class SubagentRegistry {
  private readonly runs = new Map<string, SubagentRunRecord>();
  private readonly toolCallLogs = new Map<string, SubagentToolCallLog[]>();
  private readonly config: SubagentConfig;
  private readonly storePath: string;
  private persistTimer?: NodeJS.Timeout;

  constructor(config: SubagentConfig, storePath: string = "./data/subagents") {
    this.config = config;
    this.storePath = storePath;

    // 定期持久化（每 30 秒）
    this.persistTimer = setInterval(() => {
      this.persist().catch((err) => {
        log.error("Failed to persist registry:", err);
      });
    }, 30000);
  }

  /**
   * 注册新的 subagent 运行
   */
  register(params: RegisterSubagentParams): SubagentRunRecord {
    const runId = params.runId || crypto.randomUUID();

    // 检查并发限制
    if (this.config.maxConcurrent) {
      const activeCount = this.getActiveCount();
      if (activeCount >= this.config.maxConcurrent) {
        throw new Error(
          `Max concurrent subagents limit reached: ${this.config.maxConcurrent}`,
        );
      }
    }

    // 检查 agent 白名单
    if (
      this.config.allowedAgents &&
      this.config.allowedAgents.length > 0 &&
      !this.config.allowedAgents.includes("*")
    ) {
      const agentId = params.agentId || "default";
      if (!this.config.allowedAgents.includes(agentId)) {
        throw new Error(
          `Agent ${agentId} is not in the allowed agents list`,
        );
      }
    }

    const record: SubagentRunRecord = {
      runId,
      childSessionKey: params.childSessionKey,
      requesterSessionKey: params.requesterSessionKey,
      requesterDisplayKey: params.requesterDisplayKey,
      task: params.task,
      cleanup: params.cleanup,
      label: params.label,
      agentId: params.agentId,
      model: params.model || this.config.defaultModel,
      thinkingLevel: params.thinkingLevel,
      runTimeoutSeconds: params.runTimeoutSeconds,
      tools: params.tools,
      skills: params.skills,
      createdAt: Date.now(),
      startedAt: undefined,
      endedAt: undefined,
      outcome: undefined,
    };

    this.runs.set(runId, record);
    log.info(`Registered subagent run: ${runId}`);
    return record;
  }

  /**
   * 查询运行记录
   */
  get(runId: string): SubagentRunRecord | undefined {
    return this.runs.get(runId);
  }

  /**
   * 更新运行状态
   */
  update(params: UpdateSubagentParams): void {
    const record = this.runs.get(params.runId);
    if (!record) {
      throw new Error(`Subagent run not found: ${params.runId}`);
    }

    if (params.startedAt !== undefined) {
      record.startedAt = params.startedAt;
    }

    if (params.endedAt !== undefined) {
      record.endedAt = params.endedAt;
    }

    if (params.outcome !== undefined) {
      record.outcome = params.outcome;
    }

    if (params.cleanupCompletedAt !== undefined) {
      record.cleanupCompletedAt = params.cleanupCompletedAt;
    }

    if (params.cleanupHandled !== undefined) {
      record.cleanupHandled = params.cleanupHandled;
    }

    this.runs.set(params.runId, record);
    log.debug(`Updated subagent run: ${params.runId}`);
  }

  /**
   * 列出所有运行记录
   */
  list(filter?: SubagentListFilter): SubagentRunRecord[] {
    let records = Array.from(this.runs.values());

    if (filter) {
      if (filter.status) {
        records = records.filter((r) => r.outcome?.status === filter.status);
      }
      if (filter.requesterSessionKey) {
        records = records.filter(
          (r) => r.requesterSessionKey === filter.requesterSessionKey,
        );
      }
      if (filter.agentId) {
        records = records.filter((r) => r.agentId === filter.agentId);
      }
      if (filter.createdAfter !== undefined) {
        records = records.filter((r) => r.createdAt >= (filter.createdAfter as number));
      }
      if (filter.createdBefore !== undefined) {
        records = records.filter((r) => r.createdAt <= (filter.createdBefore as number));
      }
      if (filter.limit) {
        records = records.slice(0, filter.limit);
      }
      if (filter.offset) {
        records = records.slice(filter.offset);
      }
    }

    // 按创建时间倒序排列
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 删除运行记录
   */
  delete(runId: string): boolean {
    const deleted = this.runs.delete(runId);
    this.toolCallLogs.delete(runId);
    if (deleted) {
      log.info(`Deleted subagent run: ${runId}`);
    }
    return deleted;
  }

  /**
   * 清理过期记录
   */
  cleanup(): void {
    const now = Date.now();
    const archiveAfterMs = this.config.archiveAfterMinutes
      ? this.config.archiveAfterMinutes * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000; // 默认 7 天

    for (const [runId, record] of this.runs.entries()) {
      const archiveAt = record.archiveAtMs || (record.endedAt
        ? record.endedAt + archiveAfterMs
        : record.createdAt + archiveAfterMs);

      if (now > archiveAt) {
        this.runs.delete(runId);
        this.toolCallLogs.delete(runId);
        log.info(`Archived subagent run: ${runId}`);
      }
    }
  }

  /**
   * 持久化到磁盘
   */
  async persist(): Promise<void> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });

      const filePath = path.join(this.storePath, "registry.jsonl");
      const lines: string[] = [];

      for (const record of this.runs.values()) {
        lines.push(JSON.stringify(record));
      }

      await fs.writeFile(filePath, lines.join("\n") + "\n", "utf-8");
      log.debug(`Persisted ${this.runs.size} subagent runs to disk`);
    } catch (error) {
      log.error("Failed to persist registry:", error);
      throw error;
    }
  }

  /**
   * 从磁盘恢复
   */
  async restore(): Promise<void> {
    try {
      const filePath = path.join(this.storePath, "registry.jsonl");
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.trim().split("\n");

      for (const line of lines) {
        if (line) {
          const record = JSON.parse(line) as SubagentRunRecord;
          this.runs.set(record.runId, record);
        }
      }

      log.info(`Restored ${this.runs.size} subagent runs from disk`);
    } catch (error) {
      // 文件不存在是正常的，忽略
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn("Failed to restore registry:", error);
      }
    }
  }

  /**
   * 记录工具调用（安全审计）
   */
  logToolCall(logEntry: SubagentToolCallLog): void {
    const logs = this.toolCallLogs.get(logEntry.runId) || [];
    logs.push(logEntry);
    this.toolCallLogs.set(logEntry.runId, logs);
    log.debug(`Logged tool call: ${logEntry.toolName} for ${logEntry.runId}`);
  }

  /**
   * 获取工具调用日志
   */
  getToolCallLogs(runId: string): SubagentToolCallLog[] {
    return this.toolCallLogs.get(runId) || [];
  }

  /**
   * 获取活跃的 subagent 数量
   */
  getActiveCount(): number {
    return Array.from(this.runs.values()).filter(
      (r) => !r.outcome || r.outcome.status === "running",
    ).length;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    timeout: number;
    cancelled: number;
  } {
    const records = Array.from(this.runs.values());
    return {
      total: records.length,
      active: this.getActiveCount(),
      completed: records.filter((r) => r.outcome?.status === "completed").length,
      failed: records.filter((r) => r.outcome?.status === "failed").length,
      timeout: records.filter((r) => r.outcome?.status === "timeout").length,
      cancelled: records.filter((r) => r.outcome?.status === "cancelled").length,
    };
  }

  /**
   * 停止注册表（清理资源）
   */
  async stop(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }
    await this.persist();
    log.info("SubagentRegistry stopped");
  }
}

/**
 * Session 类型定义
 *
 * 参考 openclaw-cn-ds 的 session 设计，适配 Markdown 存储格式
 */

import crypto from "node:crypto";
import type { Message } from "@/types/index.js";

/**
 * Session 作用域
 */
export type SessionScope = "per-sender" | "global";

/**
 * Session 渠道类型
 */
export type SessionChannelType = "direct" | "group" | "channel";

/**
 * Session 来源信息
 */
export interface SessionOrigin {
  label?: string;
  provider?: string;
  surface?: string;
  chatType?: SessionChannelType;
  from?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
}

/**
 * Session 元数据（存储在 Markdown frontmatter）
 */
export interface SessionEntry {
  // === 基本信息 ===
  /** 会话唯一标识（UUID） */
  sessionId: string;
  /** 最后更新时间（毫秒时间戳） */
  updatedAt: number;
  /** 创建时间（毫秒时间戳） */
  createdAt?: number;

  // === Agent 信息 ===
  /** Agent ID（多 agent 支持） */
  agentId?: string;
  /** 父会话 key（用于 spawn 子会话，暂不实现） */
  spawnedBy?: string;

  // === 渠道信息 ===
  /** 渠道标识（如：telegram, slack, webchat） */
  channel?: string;
  /** 群组/频道 ID */
  groupId?: string;
  /** 会话主题/标题 */
  subject?: string;
  /** 群组频道名称 */
  groupChannel?: string;
  /** 工作区空间 */
  space?: string;

  // === 来源信息 ===
  origin?: SessionOrigin;

  // === 模型配置 ===
  /** 模型提供商 */
  modelProvider?: string;
  /** 模型名称 */
  model?: string;
  /** 上下文 token 数量 */
  contextTokens?: number;
  /** Provider 覆盖 */
  providerOverride?: string;
  /** 模型覆盖 */
  modelOverride?: string;

  // === Token 统计 ===
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** 总 token 数 */
  totalTokens?: number;

  // === 行为配置 ===
  /** 思考级别（用于控制推理深度） */
  thinkingLevel?: string;
  /** 详细级别（用于控制输出详细程度） */
  verboseLevel?: string;
  /** 推理级别 */
  reasoningLevel?: string;
  /** 提升级别 */
  elevatedLevel?: string;
  /** 响应使用策略 */
  responseUsage?: "on" | "off" | "tokens" | "full";
  /** 发送策略 */
  sendPolicy?: "allow" | "deny";
  /** 标签 */
  label?: string;
  /** 显示名称 */
  displayName?: string;

  // === 系统状态 ===
  /** 是否已发送系统消息 */
  systemSent?: boolean;
  /** 最后一次运行是否中止 */
  abortedLastRun?: boolean;

  // === 技能快照 ===
  /** 技能快照（记录会话使用的技能） */
  skillsSnapshot?: SessionSkillSnapshot;
}

/**
 * 技能快照
 */
export interface SessionSkillSnapshot {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  version?: number;
}

/**
 * Session Key 解析结果
 */
export interface ParsedSessionKey {
  /** Agent ID */
  agentId?: string;
  /** 会话标识（去掉 agent: 前缀后的部分） */
  key: string;
  /** 原始 key */
  raw: string;
}

/**
 * Session 存储选项
 */
export interface SessionStoreOptions {
  /** 存储根目录 */
  baseDir: string;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存 TTL（毫秒），默认 45 秒 */
  cacheTtl?: number;
}

/**
 * Session 加载结果
 */
export interface SessionLoadResult {
  /** 会话元数据 */
  entry: SessionEntry;
  /** 消息列表 */
  messages: Message[];
}

/**
 * Markdown 文档（包含 frontmatter）
 */
export interface MarkdownDocument {
  path: string;
  content: string;
  metadata: Partial<SessionEntry>;
}

/**
 * 合并 SessionEntry
 */
export function mergeSessionEntry(
  existing: SessionEntry | undefined,
  patch: Partial<SessionEntry>,
): SessionEntry {
  const sessionId = patch.sessionId ?? existing?.sessionId ?? crypto.randomUUID();
  const updatedAt = Math.max(
    existing?.updatedAt ?? 0,
    patch.updatedAt ?? 0,
    Date.now(),
  );

  if (!existing) {
    return {
      ...patch,
      sessionId,
      updatedAt,
      createdAt: patch.createdAt ?? Date.now(),
    } as SessionEntry;
  }

  return {
    ...existing,
    ...patch,
    sessionId,
    updatedAt,
  };
}

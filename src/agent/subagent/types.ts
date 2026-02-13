/**
 * Subagent 系统类型定义
 *
 * 定义 Subagent 的核心类型，包括运行记录、配置、结果等
 */

/**
 * Subagent 运行结果状态
 */
export type SubagentRunStatus =
  | "pending"     // 等待开始
  | "running"     // 运行中
  | "completed"   // 已完成
  | "failed"      // 失败
  | "timeout"     // 超时
  | "cancelled";  // 已取消

/**
 * Subagent 运行结果
 */
export interface SubagentRunOutcome {
  status: SubagentRunStatus;
  result?: unknown;
  error?: string;
  completedAt: number;
}

/**
 * 通知模式
 */
export type AnnounceMode =
  | "steer"     // 立即通知，引导用户关注
  | "followup"  // 作为后续消息追加
  | "collect"   // 收集结果，稍后统一通知
  | "silent";   // 静默执行，不通知

/**
 * Subagent 运行记录
 */
export interface SubagentRunRecord {
  // 标识信息
  runId: string;                    // 运行 ID（UUID）
  childSessionKey: string;          // 子会话键（格式：subagent:{runId}:{taskHash}）
  requesterSessionKey: string;      // 请求者会话键
  requesterDisplayKey: string;      // 请求者显示键
  task: string;                     // 任务描述

  // 配置信息
  cleanup: "delete" | "keep";       // 清理策略
  label?: string;                   // 可选标签
  agentId?: string;                 // 目标 agent ID
  model?: string;                   // 模型覆盖
  thinkingLevel?: string;           // 思考级别
  runTimeoutSeconds?: number;       // 运行超时（秒）

  // 工具和技能配置
  tools?: SubagentToolsConfig;      // 工具配置
  skills?: SubagentSkillsConfig;    // 技能配置

  // 时间信息
  createdAt: number;                // 创建时间
  startedAt?: number;               // 开始时间
  endedAt?: number;                 // 结束时间

  // 运行状态
  outcome?: SubagentRunOutcome;     // 运行结果
  archiveAtMs?: number;             // 归档时间
  cleanupCompletedAt?: number;      // 清理完成时间
  cleanupHandled?: boolean;         // 是否已处理

  // 元数据
  metadata?: Record<string, unknown>; // 扩展元数据
}

/**
 * Subagent 工具配置
 */
export interface SubagentToolsConfig {
  /** 明确允许的工具列表（覆盖默认拒绝列表） */
  allow?: string[];

  /** 明确拒绝的工具列表（追加到默认拒绝列表） */
  deny?: string[];

  /** 是否继承父 agent 的工具配置 */
  inheritTools?: boolean;

  /** 是否允许 subagent 再创建 subagent（防止无限递归） */
  allowNestedSubagents?: boolean;
}

/**
 * Subagent 技能配置
 */
export interface SubagentSkillsConfig {
  /** 是否继承父 agent 的技能配置 */
  inherit?: boolean;

  /** 额外的技能目录（subagent 专用） */
  extraSkillDirs?: string[];

  /** 技能白名单（只允许这些技能） */
  allowSkills?: string[];

  /** 技能黑名单（禁止这些技能） */
  denySkills?: string[];
}

/**
 * Subagent 配置
 */
export interface SubagentConfig {
  /** 是否启用 subagent 功能 */
  enabled?: boolean;

  /** 最大并发 subagent 运行数 */
  maxConcurrent?: number;

  /** 归档时间（分钟，完成后多少分钟归档） */
  archiveAfterMinutes?: number;

  /** 默认清理策略 */
  defaultCleanup?: "delete" | "keep";

  /** 允许的 agent ID 列表（"*" 表示全部） */
  allowedAgents?: string[];

  /** 默认模型（覆盖父 agent 模型） */
  defaultModel?: string;

  /** 工具配置 */
  tools?: SubagentToolsConfig;

  /** 技能配置 */
  skills?: SubagentSkillsConfig;
}

/**
 * 注册 Subagent 运行的参数
 */
export interface RegisterSubagentParams {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep";
  label?: string;
  agentId?: string;
  model?: string;
  thinkingLevel?: string;
  runTimeoutSeconds?: number;
  tools?: SubagentToolsConfig;
  skills?: SubagentSkillsConfig;
}

/**
 * 更新 Subagent 运行的参数
 */
export interface UpdateSubagentParams {
  runId: string;
  startedAt?: number;
  endedAt?: number;
  outcome?: SubagentRunOutcome;
  cleanupCompletedAt?: number;
  cleanupHandled?: boolean;
}

/**
 * Subagent 工具调用审计日志
 */
export interface SubagentToolCallLog {
  runId: string;
  toolName: string;
  calledAt: number;
  parameters: Record<string, unknown>;
  result: ToolResult;
  requesterSessionKey: string;
}

/**
 * 工具结果类型（从现有工具系统导入）
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  output?: string;
}

/**
 * 列表过滤器
 */
export interface SubagentListFilter {
  status?: SubagentRunStatus;
  requesterSessionKey?: string;
  agentId?: string;
  createdAfter?: number;
  createdBefore?: number;
  limit?: number;
  offset?: number;
}

/**
 * 默认配置常量
 */
export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  enabled: false,
  maxConcurrent: 5,
  archiveAfterMinutes: 60 * 24 * 7, // 7天
  defaultCleanup: "delete",
  allowedAgents: ["*"],
  defaultModel: undefined,
  tools: {
    inheritTools: true,
    allowNestedSubagents: false,
  },
  skills: {
    inherit: true,
  },
};

/**
 * 默认拒绝的工具列表（安全限制）
 */
export const DEFAULT_SUBAGENT_TOOL_DENY = [
  // 会话管理工具（防止会话混乱）
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "sessions_spawn",

  // 系统管理工具（防止权限提升）
  "gateway",
  "agents_list",
  "session_status",
  "cron",

  // 认证相关工具（防止认证信息泄露）
  "whatsapp_login",

  // 记忆系统工具（防止记忆污染）
  "memory_search",
  "memory_get",
  "memory_save",

  // 其他敏感工具
  "system_info",
  "file_system",
  "process_control",
];
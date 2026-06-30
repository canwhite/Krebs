/**
 * 类型定义
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

// ============ 核心类型 ============

// Agent 记录
export interface AgentRecord {
  id: string;
  session: AgentSession;
  type: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  result?: AgentMessage[];
  unsubscribe?: () => void;
}

// Agent 配置选项
export interface AgentOptions {
  type?: string;
  inheritContext?: boolean;
  extensions?: "inherit" | "minimal";
  maxContextMessages?: number;
  filterSensitive?: boolean;
  includeSummaries?: boolean;
  timeoutMs?: number;
  cwd?: string;
  model?: string;
}

// 默认 agent 类型配置
export const DEFAULT_AGENTS: Record<string, Omit<AgentOptions, "type" | "cwd" | "model">> = {
  "general-purpose": {
    inheritContext: false,
    extensions: "minimal",
    maxContextMessages: 0,
    includeSummaries: false,
    timeoutMs: 300_000,
  },
  "research": {
    inheritContext: true,
    extensions: "inherit",
    maxContextMessages: 20,
    filterSensitive: true,
    includeSummaries: false,
    timeoutMs: 600_000,
  },
};

export function getAgentConfig(type: string): Omit<AgentOptions, "type" | "cwd" | "model"> {
  return (DEFAULT_AGENTS[type] ?? DEFAULT_AGENTS["general-purpose"]) as Omit<AgentOptions, "type" | "cwd" | "model">;
}

// ============ 工具参数 ============

export interface AgentToolParams {
  name?: string;
  task: string;
  type?: string;
  background?: boolean;
  inheritContext?: boolean;
  maxContextMessages?: number;
}

export interface GetSubagentResultParams {
  agentId: string;
}

export interface GetSubagentResultResult {
  agentId: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  messages?: AgentMessage[];
  error?: string;
}

export interface SteerSubagentParams {
  agentId: string;
  message: string;
  streamingBehavior?: "steer" | "followUp";
}

export interface TaskCreateParams {
  name: string;
  description?: string;
}

export interface TaskListParams {
  // filter options
}

export interface TaskGetParams {
  taskId: string;
}

export interface TaskUpdateParams {
  taskId: string;
  status?: "pending" | "running" | "done" | "failed" | "cancelled";
}

export interface TaskExecuteParams {
  taskId: string;
  agentType?: "general-purpose" | "research";
}

export interface TaskExecuteResult {
  success: boolean;
  agentId?: string;
  status?: string;
  error?: string;
}

// ============ Scheduling ============

export interface ScheduledJob {
  id: string;
  agentId: string;
  cron?: string;
  intervalMs?: number;
  task: string;
  options?: AgentOptions;
  createdAt: number;
  nextRunAt?: Date;
}

// ============ Custom Agent ============

export interface AgentDefinition {
  name: string;
  description: string;
  displayName?: string;
  tools: string[];
  model?: string;
  thinking?: string;
  maxTurns?: number;
  systemPrompt: string;
}

// ============ Group Join ============

export interface AgentResult {
  agentId: string;
  status: string;
  messages?: AgentMessage[];
  error?: string;
}

export interface GroupJoinOptions {
  agentIds: string[];
  timeoutMs?: number;
  onComplete?: (results: Map<string, AgentResult>) => void;
}

// ============ Worktree ============

export interface WorktreeOptions {
  agentId: string;
  cwd: string;
  branch?: string;
}

// ============ SubagentEvent ============

export type SubagentEvent =
  | { type: "agent_start"; sessionId: string }
  | { type: "agent_end"; sessionId: string; messages: AgentMessage[] }
  | { type: "turn_end"; sessionId: string; message: AgentMessage }
  | { type: "tool_execution_start"; sessionId: string; toolName: string }
  | { type: "tool_execution_end"; sessionId: string; toolName: string }
  | { type: "error"; sessionId: string; error: Error };

// ============ Extension Cache ============

export interface CachedExtensions {
  data: Awaited<ReturnType<{ reload(): Promise<any> }["reload"]>>;
  timestamp: number;
}

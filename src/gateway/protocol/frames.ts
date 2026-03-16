/**
 * Gateway 协议定义
 * 参考 krebs-ds 的 gateway 协议设计
 */

export enum ErrorCode {
  Unknown = -1,
  Ok = 0,
  InvalidParams = 1,
  NotFound = 2,
  InternalError = 3,
}

export interface RequestFrame<T = unknown> {
  id: string;
  method: string;
  params?: T;
}

export interface ResponseFrame<T = unknown> {
  id: string;
  result?: T;
  error?: {
    code: ErrorCode;
    message: string;
  };
}

export interface EventFrame<T = unknown> {
  type: string;
  data?: T;
}

// ============ 协议方法定义 ============

export interface ChatSendParams {
  agentId: string;
  sessionId: string;
  message: string;
  stream?: boolean;
}

export interface ChatSendResult {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AgentCreateParams {
  id: string;
  name: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentListResult {
  agents: Array<{
    id: string;
    name: string;
    model?: string;
  }>;
}

export interface SessionListParams {
  agentId?: string;
}

export interface SessionListResult {
  sessions: Array<{
    sessionId: string;
    updatedAt: number;
    messageCount: number;
  }>;
}

export interface SessionCreateParams {
  agentId?: string;
  metadata?: Record<string, unknown>; // 使用通用类型，避免直接依赖SessionEntry
}

export interface SessionCreateResult {
  sessionId: string;
  createdAt: number;
  entry: Record<string, unknown>; // 使用通用类型
}

// ============ 事件类型定义 ============

export interface ChatChunkEvent {
  agentId: string;
  sessionId: string;
  chunk: string;
}

// ============ 工具调用事件定义 ============

/**
 * 工具调用事件类型
 */
export type ToolCallEventType = "start" | "status" | "result";

/**
 * 工具调用基础事件
 */
export interface ToolCallEventBase {
  agentId: string;
  sessionId: string;
  toolCallId: string;
}

/**
 * 工具调用开始事件
 * 当工具开始执行时发送
 */
export interface ToolCallStartEvent extends ToolCallEventBase {
  type: "start";
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * 工具调用状态事件
 * 当工具状态变化时发送
 */
export interface ToolCallStatusEvent extends ToolCallEventBase {
  type: "status";
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * 工具调用结果事件
 * 当工具执行完成时发送
 */
export interface ToolCallResultEvent extends ToolCallEventBase {
  type: "result";
  result: unknown;
}

/**
 * 工具调用事件联合类型
 */
export type ToolCallEvent =
  | ToolCallStartEvent
  | ToolCallStatusEvent
  | ToolCallResultEvent;

// ============ 思考过程事件定义 ============

/**
 * 思考过程块事件
 * 当模型返回思考内容时发送（如果支持）
 */
export interface ThinkingChunkEvent {
  agentId: string;
  sessionId: string;
  content: string;
}

export interface AgentEvent {
  type: "created" | "updated" | "deleted";
  agentId: string;
}

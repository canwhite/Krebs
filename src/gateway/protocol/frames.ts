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

// ============ 事件类型定义 ============

export interface ChatChunkEvent {
  agentId: string;
  sessionId: string;
  chunk: string;
}

export interface AgentEvent {
  type: "created" | "updated" | "deleted";
  agentId: string;
}

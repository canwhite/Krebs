/**
 * 工具系统类型定义
 *
 * 定义 Tool 的接口和相关类型
 * 用于支持 LLM 的 Tool Calling 功能
 */

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功执行 */
  success: boolean;

  /** 返回的数据（成功时） */
  data?: unknown;

  /** 错误信息（失败时） */
  error?: string;

  /** 输出文本（用于显示） */
  output?: string;
}

/**
 * 工具参数 Schema
 */
export interface ToolParameterSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  enum?: unknown[];
}

import type { ToolConfigChecker } from "./status.js";

/**
 * 工具定义
 */
export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;

  /** 工具描述（LLM 会看到这个描述） */
  description: string;

  /** 参数 Schema */
  inputSchema: ToolParameterSchema;

  /** 执行函数 */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;

  /** 是否需要 API Key */
  requiresApiKey?: boolean;

  /** API Key 名称（用于提示用户） */
  apiKeyName?: string;

  /** 配置检查函数（可选） */
  checkConfig?: ToolConfigChecker;
}

/**
 * Tool Call（LLM 请求调用工具）
 */
export interface ToolCall {
  /** 工具名称 */
  name: string;

  /** 工具参数 */
  arguments: Record<string, unknown>;

  /** 工具调用 ID（用于多轮对话） */
  id?: string;
}

/**
 * Tool Call 结果（用于反馈给 LLM）
 */
export interface ToolCallResult {
  /** 工具调用 ID */
  id: string;

  /** 工具名称 */
  name: string;

  /** 执行结果 */
  result: ToolResult;
}

/**
 * LLM 响应（可能包含 tool_calls）
 */
export interface LLMResponse {
  /** 响应内容（文本） */
  content?: string;

  /** 工具调用 */
  toolCalls?: ToolCall[];

  /** Token 使用情况 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 工具配置
 */
export interface ToolConfig {
  /** 是否启用工具 */
  enabled: boolean;

  /** 最大循环次数（防止无限循环） */
  maxIterations?: number;

  /** 超时时间（毫秒） */
  timeout?: number;
}

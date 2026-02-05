/**
 * krebs CN 核心类型定义
 */

// ============ Provider 类型 ============

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface ChatCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: any[]; // Tool[] from agent/tools - using any to avoid circular dependency
}

export interface ChatCompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

// ============ Agent 类型 ============

export interface AgentConfig {
  id: string;
  name: string;
  // 基础 system prompt（保持向后兼容）
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  skills?: string[];

  // 新增：System Prompt 机制配置
  systemPromptMode?: "full" | "minimal" | "none";
  workspaceDir?: string;
  timezone?: string;
  userIdentity?: string;
}

export interface AgentContext {
  sessionId: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

export interface AgentResult {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  success?: boolean;  // 用于技能执行结果
  data?: unknown;     // 用于技能返回额外数据
  error?: string;     // 用于错误信息
}

// ============ Tool 类型 ============

export interface Tool {
  name: string;
  description: string;
  parameters?: unknown;
  execute: (params: unknown) => Promise<unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============ Skill 类型 ============

export interface Skill {
  name: string;
  description: string;
  triggers?: string[];
  execute: (context: AgentContext) => Promise<string>;
}

// ============ Storage 类型 ============

export interface MarkdownFile {
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryChunk {
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============ Gateway 类型 ============

export interface GatewayRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface GatewayResponse {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface GatewayClient {
  id: string;
  send: (data: GatewayResponse) => void;
  onMessage: (handler: (data: GatewayRequest) => void) => void;
}

// ============ 配置类型 ============

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  agent: {
    name: string;
    maxConcurrent: number;
    defaultModel?: string;
  };
  storage: {
    dataDir: string;
    memoryDir: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
  providers: {
    anthropic?: {
      apiKey?: string;
      baseUrl?: string;
    };
    openai?: {
      apiKey?: string;
      baseUrl?: string;
    };
  };
}

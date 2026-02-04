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
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  skills?: string[];
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

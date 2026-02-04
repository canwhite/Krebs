/**
 * Agent 核心实现
 *
 * 职责：
 * - LLM 对话管理（调用 AI 模型）
 * - 历史记录存储
 * - 流式响应处理
 *
 * 设计原则：
 * - 单一职责：专注于 LLM 对话管理
 * - 技能调度已移至 Orchestrator 层
 * - 依赖注入：所有依赖通过构造函数注入
 */

import type {
  AgentConfig,
  AgentResult,
  Message,
} from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import { CommandLane, enqueueInLane } from "@/scheduler/lanes.js";

export interface AgentDeps {
  provider: LLMProvider;
  storage?: {
    saveSession: (
      sessionId: string,
      messages: Message[]
    ) => Promise<void>;
    loadSession: (
      sessionId: string
    ) => Promise<Message[] | null>;
  };
}

export class Agent {
  private readonly config: AgentConfig;
  private readonly deps: AgentDeps;

  constructor(config: AgentConfig, deps: AgentDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * 处理用户消息
   */
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 在 Agent lane 中执行
    return enqueueInLane(
      CommandLane.Agent,
      () => this.processInternal(userMessage, sessionId),
      { warnAfterMs: 5000 }
    );
  }

  private async processInternal(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 加载历史消息
    const history = await this.loadHistory(sessionId);

    // 构建上下文
    const messages: Message[] = [
      ...(this.config.systemPrompt
        ? [
            {
              role: "system" as const,
              content: this.config.systemPrompt,
              timestamp: Date.now(),
            },
          ]
        : []),
      ...history,
      {
        role: "user" as const,
        content: userMessage,
        timestamp: Date.now(),
      },
    ];

    // 使用 LLM 生成响应
    const response = await this.deps.provider.chat(messages, {
      model: this.config.model ?? "claude-3-5-sonnet-20241022",
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // 保存对话历史
    messages.push({
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
    });
    await this.saveHistory(sessionId, messages);

    return {
      response: response.content,
      usage: response.usage,
    };
  }

  /**
   * 流式处理
   */
  async processStream(
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    return enqueueInLane(
      CommandLane.Agent,
      () => this.processStreamInternal(userMessage, sessionId, onChunk),
      { warnAfterMs: 5000 }
    );
  }

  private async processStreamInternal(
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    // 加载历史消息
    const history = await this.loadHistory(sessionId);

    // 构建上下文
    const messages: Message[] = [
      ...(this.config.systemPrompt
        ? [
            {
              role: "system" as const,
              content: this.config.systemPrompt,
              timestamp: Date.now(),
            },
          ]
        : []),
      ...history,
      {
        role: "user" as const,
        content: userMessage,
        timestamp: Date.now(),
      },
    ];

    // 使用 LLM 流式生成响应
    const response = await this.deps.provider.chatStream(
      messages,
      {
        model: this.config.model ?? "claude-3-5-sonnet-20241022",
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      },
      onChunk
    );

    // 保存对话历史
    messages.push({
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
    });
    await this.saveHistory(sessionId, messages);

    return {
      response: response.content,
      usage: response.usage,
    };
  }

  private async loadHistory(sessionId: string): Promise<Message[]> {
    if (this.deps.storage) {
      return (await this.deps.storage.loadSession(sessionId)) ?? [];
    }
    return [];
  }

  private async saveHistory(
    sessionId: string,
    messages: Message[]
  ): Promise<void> {
    if (this.deps.storage) {
      await this.deps.storage.saveSession(sessionId, messages);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

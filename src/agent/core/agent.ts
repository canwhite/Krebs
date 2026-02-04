/**
 * Agent 核心实现
 *
 * 职责：
 * - LLM 对话管理（调用 AI 模型）
 * - 工具执行（Tool Calling 循环）
 * - 历史记录存储
 * - 流式响应处理
 *
 * 设计原则：
 * - 单一职责：专注于 LLM 对话管理和工具执行
 * - 工具调度通过 Tool Calling 机制实现
 * - 依赖注入：所有依赖通过构造函数注入
 */

import type {
  AgentConfig,
  AgentResult,
  Message,
} from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import { CommandLane, enqueueInLane } from "@/scheduler/lanes.js";
import type { Tool, ToolConfig } from "@/agent/tools/index.js";

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
  tools?: Tool[];
  toolConfig?: ToolConfig;
  skillsManager?: any; // SkillsManager 类型
}

export class Agent {
  private readonly config: AgentConfig;
  private readonly deps: AgentDeps;
  private readonly maxIterations: number;

  constructor(config: AgentConfig, deps: AgentDeps) {
    this.config = config;
    this.deps = deps;
    this.maxIterations = deps.toolConfig?.maxIterations ?? 10;
  }

  /**
   * 处理用户消息（支持 Tool Calling）
   */
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 在 Agent lane 中执行
    return enqueueInLane(
      CommandLane.Agent,
      () => this.processWithTools(userMessage, sessionId),
      { warnAfterMs: 5000 }
    );
  }


  /**
   * 处理用户消息（带 Tool Calling 循环）
   */
  private async processWithTools(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 加载历史消息
    const history = await this.loadHistory(sessionId);

    // 构建初始消息
    const messages: Message[] = [
      ...(this.config.systemPrompt
        ? [
            {
              role: "system" as const,
              content: this.buildSystemPrompt(),
              timestamp: Date.now(),
            },
          ]
        : []),
      ...history,
      {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      },
    ];

    // Tool Calling 循环
    let currentMessages = [...messages];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // 调用 LLM
      const response = await this.callLLM(currentMessages);

      // 检查是否有 tool_calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // 有工具调用，执行工具
        console.log(`[Agent] Iteration ${iteration}: Executing ${response.toolCalls.length} tool calls`);

        const toolResults = await this.executeToolCalls(response.toolCalls);

        // 将工具结果添加到消息中
        currentMessages.push({
          role: "assistant",
          content: "",  // tool_calls 时没有文本内容
          timestamp: Date.now(),
          toolCalls: response.toolCalls,
        } as any);

        // 添加每个工具的结果
        for (const toolResult of toolResults) {
          currentMessages.push({
            role: "user",
            content: JSON.stringify({
              toolCallId: toolResult.id,
              result: toolResult.result,
            }),
            timestamp: Date.now(),
          } as any);
        }

        // 继续循环，让 LLM 根据工具结果生成最终回复
        continue;
      }

      // 没有 tool_calls，这是最终回复
      const finalMessage = {
        role: "assistant" as const,
        content: response.content || "",
        timestamp: Date.now(),
      };

      // 保存完整对话历史
      const allMessages = [...currentMessages, finalMessage];
      await this.saveHistory(sessionId, allMessages);

      return {
        response: response.content || "",
        usage: response.usage,
      };
    }

    // 达到最大迭代次数
    throw new Error(`Max iterations (${this.maxIterations}) reached without completion`);
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

    // 构建 system prompt（包含 Skills）
    const systemPrompt = this.buildSystemPrompt();

    // 构建上下文
    const messages: Message[] = [
      ...(systemPrompt
        ? [
            {
              role: "system" as const,
              content: systemPrompt,
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

  /**
   * 调用 LLM
   */
  private async callLLM(messages: Message[]): Promise<any> {
    return await this.deps.provider.chat(messages, {
      model: this.config.model ?? "claude-3-5-sonnet-20241022",
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      tools: this.deps.tools,
    });
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      // 查找工具
      const tool = this.deps.tools?.find((t) => t.name === toolCall.name);

      if (!tool) {
        console.error(`[Agent] Tool not found: ${toolCall.name}`);
        results.push({
          id: toolCall.id,
          name: toolCall.name,
          result: {
            success: false,
            error: `Tool not found: ${toolCall.name}`,
          },
        });
        continue;
      }

      // 执行工具
      try {
        const result = await tool.execute(toolCall.arguments || {});
        results.push({
          id: toolCall.id,
          name: toolCall.name,
          result,
        });
      } catch (error) {
        console.error(`[Agent] Tool execution error: ${toolCall.name}`, error);
        results.push({
          id: toolCall.id,
          name: toolCall.name,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return results;
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
   * 构建完整的 System Prompt
   *
   * 组合基础 system prompt 和 skills prompt
   */
  private buildSystemPrompt(): string {
    const basePrompt = this.config.systemPrompt ?? "";

    // 如果有 SkillsManager，添加 skills prompt
    if (this.deps.skillsManager) {
      try {
        const skillsPrompt = this.deps.skillsManager.buildSkillsPrompt();
        if (skillsPrompt) {
          return `${basePrompt}\n\n${skillsPrompt}`;
        }
      } catch (error) {
        // 如果构建 skills prompt 失败，只返回基础 prompt
        console.error("Failed to build skills prompt:", error);
      }
    }

    return basePrompt;
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

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
import { buildPayloads } from "../payload/index.js";
import { runWithModelFallback, type ModelConfig } from "../model-fallback/index.js";
import type { LLMProvider } from "@/provider/index.js";
import { CommandLane, enqueueInLane } from "@/scheduler/lanes.js";
import type { Tool, ToolConfig } from "@/agent/tools/index.js";
import {
  buildAgentSystemPrompt,
  type SystemPromptConfig,
} from "./system-prompt.js";

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

    // 构建初始消息（用于发送给 LLM）
    const messagesForLLM: Message[] = [
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
    let currentMessages = [...messagesForLLM];
    let iteration = 0;
    const allMessages: Message[] = []; // 保存所有中间消息（用于最终保存）
    const allToolResults: any[] = []; // 收集所有工具结果（用于构建 Payload）

    // 添加用户消息到保存列表
    allMessages.push({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    });

    while (iteration < this.maxIterations) {
      iteration++;

      // 调用 LLM
      const response = await this.callLLM(currentMessages);

      // 检查是否有 tool_calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // 有工具调用，执行工具
        console.log(`[Agent] Iteration ${iteration}: Executing ${response.toolCalls.length} tool calls`);

        // 保存 assistant 的工具调用消息
        const assistantToolMessage: Message = {
          role: "assistant",
          content: response.content || "",  // 保存可能的文本内容
          timestamp: Date.now(),
          toolCalls: response.toolCalls,
        } as any;
        allMessages.push(assistantToolMessage);

        const toolResults = await this.executeToolCalls(response.toolCalls);

        // 收集工具结果
        allToolResults.push(...toolResults);

        // 将工具结果添加到消息中（用于 LLM 下一轮）
        currentMessages.push(assistantToolMessage);

        // 添加每个工具的结果到保存列表和当前消息
        for (const toolResult of toolResults) {
          const toolResultMessage: Message = {
            role: "user",
            content: JSON.stringify({
              toolCallId: toolResult.id,
              toolName: toolResult.name,
              result: toolResult.result,
            }),
            timestamp: Date.now(),
          } as any;
          allMessages.push(toolResultMessage);
          currentMessages.push(toolResultMessage);
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
      allMessages.push(finalMessage);

      // 保存对话历史（包含所有中间消息）
      const messagesToSave: Message[] = [
        ...history,
        ...allMessages,
      ];

      // 自动压缩上下文（如果需要）
      const compressedMessages = await this.compactIfNeeded(messagesToSave);
      await this.saveHistory(sessionId, compressedMessages);

      // 构建 Payload 列表
      const payloads = buildPayloads({
        content: response.content || "",
        toolResults: allToolResults,
        options: {
          toolResultFormat: "json",
          includeDirectives: true,
          filterSilent: true,
        },
      });

      return {
        response: response.content || "",
        payloads,
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

    // 构建上下文（用于发送给 LLM）
    const messagesForLLM: Message[] = [
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
      messagesForLLM,
      {
        model: this.config.model ?? "claude-3-5-sonnet-20241022",
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      },
      onChunk
    );

    // 保存对话历史（不包含系统提示词）
    const messagesToSave: Message[] = [
      ...history,
      {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: response.content,
        timestamp: Date.now(),
      },
    ];
    await this.saveHistory(sessionId, messagesToSave);

    return {
      response: response.content,
      usage: response.usage,
    };
  }

  /**
   * 调用 LLM（带 Model Fallback 支持）
   */
  private async callLLM(messages: Message[]): Promise<any> {
    // 提取 provider 名称（从模型名称推断）
    const defaultModel = this.config.model ?? "claude-3-5-sonnet-20241022";
    const providerName = this.inferProviderFromModel(defaultModel);

    // 主模型配置
    const primaryModel: ModelConfig = {
      provider: providerName,
      model: defaultModel,
    };

    // 备用模型配置
    const fallbackModels = (this.config.fallbackModels || []).map((fb) => ({
      provider: fb.provider,
      model: fb.model,
    }));

    // 如果启用 fallback 且有备用模型，使用 fallback 机制
    if (this.config.fallbackEnabled && fallbackModels.length > 0) {
      return await runWithModelFallback({
        primary: primaryModel,
        fallbacks: fallbackModels,
        run: async (modelConfig) => {
          // 注意：这里假设所有模型都使用同一个 provider
          // 在实际使用中，可能需要根据 modelConfig.provider 切换 provider 实例
          return await this.deps.provider.chat(messages, {
            model: modelConfig.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
            tools: this.deps.tools,
          });
        },
        options: {
          enabled: true,
          maxRetries: 2,
          retryDelay: 1000,
          onFallback: (from, to, error) => {
            console.warn(
              `[Agent] Model fallback: ${from.model} -> ${to.model} (reason: ${error.message})`
            );
          },
        },
      });
    }

    // 未启用 fallback，直接调用
    return await this.deps.provider.chat(messages, {
      model: defaultModel,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      tools: this.deps.tools,
    });
  }

  /**
   * 从模型名称推断 provider
   */
  private inferProviderFromModel(model: string): string {
    if (model.startsWith("claude") || model.startsWith("anthropic")) {
      return "anthropic";
    }
    if (model.startsWith("gpt") || model.startsWith("chatgpt")) {
      return "openai";
    }
    if (model.startsWith("deepseek")) {
      return "deepseek";
    }
    // 默认返回 anthropic
    return "anthropic";
  }

  /**
   * 执行工具调用（并行执行）
   */
  private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
    // 使用 Promise.allSettled 并行执行所有工具调用
    const toolPromises = toolCalls.map(async (toolCall) => {
      // 查找工具
      const tool = this.deps.tools?.find((t) => t.name === toolCall.name);

      if (!tool) {
        console.error(`[Agent] Tool not found: ${toolCall.name}`);
        return {
          id: toolCall.id,
          name: toolCall.name,
          result: {
            success: false,
            error: `Tool not found: ${toolCall.name}`,
          },
        };
      }

      // 执行工具
      try {
        const result = await tool.execute(toolCall.arguments || {});
        return {
          id: toolCall.id,
          name: toolCall.name,
          result,
        };
      } catch (error) {
        console.error(`[Agent] Tool execution error: ${toolCall.name}`, error);
        return {
          id: toolCall.id,
          name: toolCall.name,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });

    // 等待所有工具完成（即使某些失败）
    const settledResults = await Promise.allSettled(toolPromises);

    // 提取结果
    return settledResults.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        console.error("[Agent] Tool promise rejected:", result.reason);
        return {
          id: "unknown",
          name: "unknown",
          result: {
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
        };
      }
    });
  }

  /**
   * 上下文压缩（如果需要）
   *
   * 保留最近的消息，删除旧的消息以控制上下文长度
   */
  private async compactIfNeeded(messages: Message[]): Promise<Message[]> {
    const maxTokens = this.config.maxTokens || 4096;
    const estimatedTokens = this.estimateTokens(messages);

    // 如果未超过限制，直接返回
    if (estimatedTokens <= maxTokens * 0.8) {
      return messages;
    }

    console.log(`[Agent] Context length (${estimatedTokens} tokens) exceeds limit, compressing...`);

    // 策略1: 保留最近的消息（简单版）
    // TODO: 未来可以实现更智能的压缩（如语义总结）
    const recentMessages = messages.slice(-20); // 保留最近20条消息

    console.log(`[Agent] Compressed from ${messages.length} to ${recentMessages.length} messages`);

    return recentMessages;
  }

  /**
   * 估算消息的 token 数量
   *
   * 简单估算：英文约 4 chars/token，中文约 2 chars/token
   */
  private estimateTokens(messages: Message[]): number {
    let totalChars = 0;

    for (const message of messages) {
      // 消息内容
      totalChars += String(message.content || "").length;

      // 工具调用
      if (message.toolCalls) {
        totalChars += JSON.stringify(message.toolCalls).length;
      }
    }

    // 保守估算：平均 3 字符 = 1 token
    return Math.ceil(totalChars / 3);
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
   * 使用新的 system prompt 机制（参考 openclaw-cn-ds）
   * 支持动态构建工具、技能、工作区等上下文信息
   */
  private buildSystemPrompt(): string {
    // 获取 skills 信息
    let skills: Array<{ name: string; description: string; prompt?: string }> = [];
    if (this.deps.skillsManager) {
      try {
        // 尝试从 SkillsManager 获取 skills 列表
        if (typeof this.deps.skillsManager.getSkills === "function") {
          skills = this.deps.skillsManager.getSkills();
        } else if (typeof this.deps.skillsManager.buildSkillsPrompt === "function") {
          // 向后兼容：如果有 buildSkillsPrompt，解析它获取 skills
          const skillsPrompt = this.deps.skillsManager.buildSkillsPrompt();
          if (skillsPrompt) {
            // 简单的解析逻辑 - 假设格式为 "## Skill: name\ndescription"
            const skillBlocks = skillsPrompt.split(/\n##/).filter(Boolean);
            skills = skillBlocks.map((block: string) => {
              const lines = block.trim().split("\n");
              const name = lines[0]?.replace(/^(Skill:\s*)?/i, "").trim() || "unknown";
              const description = lines.slice(1).join("\n").trim() || "";
              return { name, description };
            });
          }
        }
      } catch (error) {
        console.warn("Failed to get skills info:", error);
      }
    }

    // 构建配置
    const sysPromptConfig: SystemPromptConfig = {
      promptMode: this.config.systemPromptMode || "full",
      basePrompt: this.config.systemPrompt,
      tools: this.deps.tools,
      toolConfig: this.deps.toolConfig,
      skills: skills.length > 0 ? skills : undefined,
      workspaceDir: this.config.workspaceDir,
      timezone: this.config.timezone,
      userIdentity: this.config.userIdentity,
      runtime: {
        environment: (process.env.NODE_ENV as any) || "development",
      },
    };

    // 使用新的构建函数
    return buildAgentSystemPrompt(sysPromptConfig);
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

/**
 * Agent 核心实现
 *
 * 职责：
 * - LLM 对话管理（调用 AI 模型）
 * - 工具执行（Tool Calling 循环）
 * - 历史记录存储
 * - 流式响应处理
 * - 上下文文件加载（SOUL.md）
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
import { loadContextFiles } from "./context-loader.js";
import { buildPayloads } from "../payload/index.js";
import { runWithModelFallback, type ModelConfig } from "../model-fallback/index.js";
import type { LLMProvider } from "@/provider/index.js";
import { CommandLane, enqueueInLane } from "@/scheduler/lanes.js";
import type { Tool, ToolConfig } from "@/agent/tools/index.js";
import {
  buildAgentSystemPrompt,
  type SystemPromptConfig,
} from "./system-prompt.js";
import {
  isContextOverflowError,
  ToolErrorKind,
  classifyToolError,
} from "../errors.js";
import { estimateMessagesTokens } from "@/utils/token-estimator.js";
import { compactMessages } from "@/utils/compaction.js";
import { getModelContextWindow } from "@/utils/model-context.js";

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
  memoryService?: any; // MemoryService 类型（可选）- 用于自动注入和保存记忆
}

export class Agent {
  private readonly config: AgentConfig;
  private readonly deps: AgentDeps;
  private readonly maxIterations: number;

  constructor(config: AgentConfig, deps: AgentDeps) {
    this.config = config;
    this.deps = deps;
    // 参考 openclaw-cn-ds：主要依赖超时控制，迭代限制作为兜底
    // 默认 1000 次迭代（由 AgentManager 配置），主要防止极端快速循环
    this.maxIterations = deps.toolConfig?.maxIterations ?? 1000;
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
    console.log(`[Agent] processWithTools called: sessionId="${sessionId}", userMessage="${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

    // 加载历史消息
    const history = await this.loadHistory(sessionId);
    console.log(`[Agent] Loaded ${history.length} messages from session "${sessionId}"`);

    // 调试：检查历史消息内容
    console.log(`[Agent] History messages details:`);
    history.forEach((msg, i) => {
      console.log(`  [${i}] role=${msg.role}, content="${msg.content?.substring(0, 50)}${msg.content && msg.content.length > 50 ? '...' : ''}"`);
    });

    // ========== 新增：自动注入相关记忆 ==========
    let messagesForLLM: Message[];

    if (this.deps.memoryService) {
      try {
        // 1. 提取最近的消息用于搜索查询
        const recentMessages = history.slice(-5); // 最近 5 条消息

        // 2. 自动注入相关记忆
        const enhanced = await this.deps.memoryService.injectRelevantMemories(
          [
            {
              role: "user",
              content: userMessage,
              timestamp: Date.now(),
            },
          ],
          recentMessages
        );

        // 3. 构建完整的消息列表（用于发送给 LLM）
        messagesForLLM = [
          ...(this.config.systemPrompt
            ? [
                {
                  role: "system" as const,
                  content: this.buildSystemPrompt(),
                  timestamp: Date.now(),
                },
              ]
            : []),
          ...enhanced, // 使用增强后的消息（包含记忆注入）
        ];
      } catch (error) {
        // 记忆注入失败，降级到普通流程
        console.warn("[Agent] Memory injection failed, falling back to normal flow:", error);
        messagesForLLM = [
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
      }
    } else {
      // 没有 MemoryService，使用普通流程
      messagesForLLM = [
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

      // 调试：检查构建的 messagesForLLM
      console.log(`[Agent] Built messagesForLLM (no memory service): ${messagesForLLM.length} messages`);
      console.log(`[Agent] System prompt included: ${this.config.systemPrompt ? 'yes' : 'no'}`);
      console.log(`[Agent] History messages count: ${history.length}`);
      console.log(`[Agent] User message: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

      // 详细显示 messagesForLLM 内容
      console.log(`[Agent] messagesForLLM details (first 3 messages):`);
      messagesForLLM.slice(0, 3).forEach((msg, i) => {
        console.log(`  [${i}] role=${msg.role}, content="${msg.content?.substring(0, 80)}${msg.content && msg.content.length > 80 ? '...' : ''}"`);
      });
      if (messagesForLLM.length > 3) {
        console.log(`  ... and ${messagesForLLM.length - 3} more messages`);
      }
    }

    // Tool Calling 循环
    let currentMessages = [...messagesForLLM];
    console.log(`[Agent] Starting Tool Calling loop with ${currentMessages.length} messages`);
    let iteration = 0;
    const allMessages: Message[] = []; // 保存所有中间消息（用于最终保存）
    const allToolResults: any[] = []; // 收集所有工具结果（用于构建 Payload）

    // 记录开始时间（用于超时控制）
    const startTime = Date.now();
    const timeoutMs = this.deps.toolConfig?.timeoutMs ?? 600000; // 默认10分钟

    // 自动压缩重试标记（参考 openclaw-cn-ds）
    let overflowCompactionAttempted = false;

    // 添加用户消息到保存列表
    allMessages.push({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    });

    while (iteration < this.maxIterations) {
      iteration++;

      // 检查超时（参考 openclaw-cn-ds 的设计）
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > timeoutMs) {
        throw new Error(
          `Tool calling timeout (${timeoutMs}ms) reached after ${iteration} iterations ` +
          `and ${Math.round(elapsedMs / 1000)}s. ` +
          `The task may be too complex or there may be an infinite loop.`
        );
      }

      // 调用 LLM（带自动压缩重试）
      let response;
      try {
        response = await this.callLLM(currentMessages);
      } catch (error: any) {
        const errorKind = classifyToolError(error);
        const errorMessage = error?.message || String(error);

        // 处理上下文溢出（参考 openclaw-cn-ds 的自动压缩重试机制）
        if (isContextOverflowError(errorMessage) && !overflowCompactionAttempted) {
          console.log(`[Agent] Context overflow detected, attempting auto-compaction...`);

          // 压缩当前消息
          const compressedMessages = await this.compactIfNeeded(currentMessages);
          currentMessages = compressedMessages;
          overflowCompactionAttempted = true;

          console.log(`[Agent] Auto-compaction succeeded, retrying...`);
          continue; // 重试
        }

        // 其他致命错误直接抛出
        if (errorKind === ToolErrorKind.FATAL) {
          throw error;
        }

        // 可重试错误（暂时直接抛出，未来可以添加重试逻辑）
        if (errorKind === ToolErrorKind.RETRYABLE) {
          console.warn(`[Agent] Retryable error occurred: ${errorMessage}`);
          throw error;
        }

        // 其他错误直接抛出
        throw error;
      }

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

      // 保存对话历史（只保存新的消息，不包含已存在的历史）
      // history 已经存在于存储中，我们只需要保存 allMessages（当前对话的新消息）
      const messagesToSave: Message[] = [...allMessages];

      console.log(`[Agent] Saving ${messagesToSave.length} new messages to session "${sessionId}" (history has ${history.length} existing messages)`);
      console.log(`[Agent] New messages to save:`);
      allMessages.forEach((msg, i) => {
        console.log(`  [${i}] role=${msg.role}, content="${msg.content?.substring(0, 50)}${msg.content && msg.content.length > 50 ? '...' : ''}"`);
      });

      // 自动压缩上下文（如果需要）
      const compressedMessages = await this.compactIfNeeded(messagesToSave);
      console.log(`[Agent] After compression: ${compressedMessages.length} messages`);
      await this.saveHistory(sessionId, compressedMessages);

      // ========== 新增：自动保存对话到记忆系统 ==========
      if (this.deps.memoryService) {
        try {
          // 异步保存对话到每日日志（不阻塞响应）
          setImmediate(async () => {
            try {
              await this.deps.memoryService!.saveConversationMemory(messagesToSave);
              console.log("[Agent] Conversation saved to memory");
            } catch (error) {
              console.error("[Agent] Failed to save conversation to memory:", error);
            }
          });

          // 检查是否需要触发记忆刷新（在接近上下文限制时）
          const estimatedTokens = this.estimateTokens(messagesToSave);
          const maxTokens = this.config.maxTokens || 200000;

          setImmediate(async () => {
            try {
              await this.deps.memoryService!.maybeFlushMemory(
                estimatedTokens,
                maxTokens
              );
            } catch (error) {
              console.error("[Agent] Failed to flush memory:", error);
            }
          });
        } catch (error) {
          console.warn("[Agent] Memory save/flush failed:", error);
        }
      }

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

    // 保存对话历史（只保存新的消息，不包含已存在的历史）
    const messagesToSave: Message[] = [
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
    console.log(`[Agent] Saving ${messagesToSave.length} new messages via stream to session "${sessionId}"`);
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
   * 使用智能压缩策略：历史修剪 + 摘要生成
   */
  private async compactIfNeeded(messages: Message[]): Promise<Message[]> {
    // 获取模型的实际上下文窗口
    const modelName = this.config.model || "claude-3-5-sonnet-20241022";
    const modelContextWindow = getModelContextWindow(modelName);

    // 使用配置的 maxTokens 和模型上下文窗口的较小值
    const maxTokens = Math.min(
      this.config.maxTokens || modelContextWindow,
      modelContextWindow
    );

    // 使用新的智能压缩工具
    const result = compactMessages(messages, {
      maxTokens,
      maxHistoryShare: 0.8, // 历史消息最多占 80%
      keepRecentCount: 20, // 保留最近 20 条消息
      enableSummarization: true, // 启用摘要
    });

    // 如果压缩了，记录日志
    if (result.droppedMessages > 0) {
      console.log(
        `[Agent] Context compressed: ${result.tokensBefore} → ${result.tokensAfter} tokens, ` +
        `dropped ${result.droppedMessages} messages`
      );
    }

    return result.messages;
  }

  /**
   * 估算消息的 token 数量
   *
   * 使用改进的估算算法（区分中英文）
   */
  private estimateTokens(messages: Message[]): number {
    return estimateMessagesTokens(messages, {
      safetyMargin: 1.2, // 20% buffer
    });
  }

  private async loadHistory(sessionId: string): Promise<Message[]> {
    if (this.deps.storage) {
      const history = await this.deps.storage.loadSession(sessionId);
      console.log(`[Agent] loadHistory called: sessionId="${sessionId}", returned ${history?.length || 0} messages`);

      // 添加详细调试信息
      if (history && history.length > 0) {
        console.log(`[Agent] First message in history: role="${history[0].role}", content="${history[0].content?.substring(0, 50)}..."`);
        console.log(`[Agent] Last message in history: role="${history[history.length-1].role}", content="${history[history.length-1].content?.substring(0, 50)}..."`);
      } else if (history === null) {
        console.log(`[Agent] loadSession returned null for sessionId="${sessionId}"`);
      } else {
        console.log(`[Agent] loadSession returned empty array for sessionId="${sessionId}"`);
      }

      return history ?? [];
    }
    console.log(`[Agent] loadHistory: no storage available for sessionId="${sessionId}"`);
    return [];
  }

  private async saveHistory(
    sessionId: string,
    messages: Message[]
  ): Promise<void> {
    if (this.deps.storage) {
      // 添加调试日志
      console.log(`[Agent] saveHistory called: sessionId="${sessionId}", messages=${messages.length}`);
      if (messages.length > 0) {
        console.log(`[Agent] First message: role=${messages[0].role}, content=${messages[0].content?.substring(0, 50)}...`);
        console.log(`[Agent] Last message: role=${messages[messages.length-1].role}, content=${messages[messages.length-1].content?.substring(0, 50)}...`);
      }
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

    // 加载上下文文件（新增）
    let contextFiles = undefined;
    if (this.config.workspaceDir) {
      try {
        contextFiles = loadContextFiles(this.config.workspaceDir);
      } catch (error) {
        console.warn("Failed to load context files:", error);
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
      contextFiles, // 新增：上下文文件
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

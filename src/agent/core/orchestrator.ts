/**
 * Agent Orchestrator - 智能编排器
 *
 * 职责：
 * 1. 检查技能触发
 * 2. 调度技能执行
 * 3. 委托 Agent 处理 LLM 调用
 *
 * 设计原则：
 * - 单一职责：专注于技能调度和编排
 * - 依赖注入：所有依赖通过构造函数注入
 * - 可测试性：易于 Mock 和单元测试
 */

import type {
  AgentContext,
  AgentResult,
} from "@/types/index.js";
import type { Agent } from "./agent.js";
import type { Skill, SkillRegistry } from "../skills/index.js";

/**
 * Orchestrator 配置
 */
export interface OrchestratorConfig {
  /**
   * 是否启用技能调度
   */
  enableSkills: boolean;

  /**
   * 技能执行超时时间（毫秒）
   */
  skillTimeout?: number;

  /**
   * 是否在日志中显示技能触发信息
   */
  logSkillTriggers?: boolean;
}

/**
 * Orchestrator 依赖
 */
export interface OrchestratorDeps {
  /**
   * Agent 实例（用于 LLM 处理）
   */
  agent: Agent;

  /**
   * 技能注册表
   */
  skillRegistry: SkillRegistry;
}

/**
 * Agent Orchestrator
 *
 * 负责技能调度和编排，决定使用技能还是委托给 Agent
 */
export class AgentOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly deps: OrchestratorDeps;

  constructor(config: OrchestratorConfig, deps: OrchestratorDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * 处理用户消息
   *
   * 流程：
   * 1. 如果启用技能，检查是否有技能被触发
   * 2. 如果有技能，执行技能并返回结果
   * 3. 如果没有技能或技能执行失败，委托给 Agent 处理
   */
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 如果启用技能调度，先检查技能
    if (this.config.enableSkills) {
      const skillResult = await this.tryExecuteSkills(
        userMessage,
        sessionId
      );

      // 如果技能成功执行，返回结果
      if (skillResult) {
        return skillResult;
      }
    }

    // 没有技能匹配或技能执行失败，委托给 Agent
    return this.deps.agent.process(userMessage, sessionId);
  }

  /**
   * 流式处理用户消息
   *
   * 注意：流式处理通常不走技能系统，直接委托给 Agent
   */
  async processStream(
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    // 流式处理直接委托给 Agent（技能不支持流式）
    return this.deps.agent.processStream(userMessage, sessionId, onChunk);
  }

  /**
   * 尝试执行技能
   *
   * @returns 如果技能成功执行，返回结果；否则返回 null
   */
  private async tryExecuteSkills(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult | null> {
    // 1. 查找触发的技能
    const triggeredSkills = this.deps.skillRegistry.findByTrigger(
      userMessage
    );

    if (triggeredSkills.length === 0) {
      return null;  // 没有技能被触发
    }

    // 2. 记录日志
    if (this.config.logSkillTriggers !== false) {
      console.log(
        `[Orchestrator] Triggered skills: ${triggeredSkills
          .map((s: Skill) => s.name)
          .join(", ")}`
      );
    }

    // 3. 按顺序执行技能，直到有一个成功
    for (const skill of triggeredSkills) {
      try {
        const result = await this.executeSkillWithTimeout(
          skill,
          userMessage,
          sessionId
        );

        if (result.success && result.response) {
          if (this.config.logSkillTriggers !== false) {
            console.log(
              `[Orchestrator] Skill "${skill.name}" executed successfully`
            );
          }

          return {
            response: result.response,
            success: result.success,
            data: result.data,
          };
        }
      } catch (error) {
        // 技能执行失败，继续尝试下一个技能
        console.error(
          `[Orchestrator] Skill "${skill.name}" failed:`,
          error
        );
        continue;
      }
    }

    // 所有技能都失败了
    return null;
  }

  /**
   * 执行技能（带超时）
   */
  private async executeSkillWithTimeout(
    skill: Skill,
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    const timeout = this.config.skillTimeout ?? 5000;

    // 创建技能上下文
    const context = await this.createSkillContext(
      userMessage,
      sessionId
    );

    // 执行技能（带超时）
    const skillResult = await this.withTimeout(
      skill.execute(context),
      timeout,
      `Skill "${skill.name}" execution timeout`
    );

    // 转换 SkillResult 为 AgentResult
    return {
      response: skillResult.response ?? "",
      success: skillResult.success,
      data: skillResult.data,
      error: skillResult.error,
    };
  }

  /**
   * 创建技能上下文
   *
   * 注意：这里传递的是精简的上下文，不是完整的历史记录
   */
  private async createSkillContext(
    userMessage: string,
    sessionId: string
  ): Promise<AgentContext> {
    // 获取 Agent 的配置
    const agentConfig = this.deps.agent.getConfig();

    // 构建精简的上下文（只包含当前消息）
    const context: AgentContext = {
      sessionId,
      messages: [
        {
          role: "user",
          content: userMessage,
          timestamp: Date.now(),
        },
      ],
      metadata: agentConfig as unknown as Record<string, unknown>,
    };

    return context;
  }

  /**
   * 包装 Promise，添加超时
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * 获取配置
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * 获取 Agent
   */
  getAgent(): Agent {
    return this.deps.agent;
  }

  /**
   * 获取技能注册表
   */
  getSkillRegistry(): SkillRegistry {
    return this.deps.skillRegistry;
  }
}

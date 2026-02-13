/**
 * Agent Orchestrator - 智能编排器
 *
 * 职责：
 * - 委托 Agent 处理 LLM 调用
 * - 作为 Agent 层的统一入口
 *
 * 设计原则：
 * - 单一职责：专注于 Agent 调用和编排
 * - 依赖注入：所有依赖通过构造函数注入
 * - 可测试性：易于 Mock 和单元测试
 *
 * 注意：旧的 Skills 系统（基于 trigger）已移除
 * 新的 Skills 系统（pi-coding-agent）通过 SkillsManager 注入到 Agent
 */

import type {
  AgentResult,
} from "@/types/index.js";
import type { Agent } from "./agent.js";
import type { SkillsManager } from "../skills/index.js";

/**
 * Orchestrator 配置
 */
export interface OrchestratorConfig {
  /**
   * Orchestrator 标签（用于日志和调试）
   */
  label?: string;
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
   * Skills Manager（新的系统，基于 pi-coding-agent）
   * 注意：SkillsManager 被注入到 Agent 中，Orchestrator 不直接使用
   */
  skillsManager?: SkillsManager;
}

/**
 * Agent Orchestrator
 *
 * 负责将请求委托给 Agent 处理
 * 作为 Agent 层的统一入口，便于扩展和测试
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
   * 1. 直接委托给 Agent 处理
   * 2. Agent 会使用 SkillsManager 构建的技能 Prompt
   * 3. Agent 会使用 Tool Calling 系统执行工具
   */
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 直接委托给 Agent
    // Agent 会使用 SkillsManager 构建的技能 Prompt（通过 system prompt）
    // Agent 会使用 Tool Calling 系统执行工具
    return this.deps.agent.process(userMessage, sessionId);
  }

  /**
   * 流式处理用户消息
   */
  async processStream(
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    // 流式处理直接委托给 Agent
    return this.deps.agent.processStream(userMessage, sessionId, onChunk);
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
}

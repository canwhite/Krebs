/**
 * Agent 管理器
 *
 * 职责：
 * - 管理 Agent 实例的生命周期
 * - 管理 SkillRegistry 实例（替代全局单例）
 * - 创建 Orchestrator 来编排 Agent 和 Skills
 * - 提供依赖注入支持
 *
 * 设计改进：
 * - 移除硬编码的 Storage 依赖
 * - 接受 StorageInterface 作为参数
 * - 管理 SkillRegistry（不再使用全局单例）
 * - 集成 Orchestrator 层
 */

import type { AgentConfig } from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import type { AgentDeps, Agent } from "./agent.js";
import type { SkillRegistry } from "../skills/index.js";
import { Agent as AgentClass } from "./agent.js";
import { AgentOrchestrator, OrchestratorConfig } from "./orchestrator.js";
// 直接导入 SkillRegistry 以避免循环依赖
import { SkillRegistry as SkillRegistryClass } from "../skills/base.js";

/**
 * AgentManager 配置
 */
export interface AgentManagerConfig {
  /**
   * 存储目录（向后兼容）
   * @deprecated 建议使用 storage 参数
   */
  storageDir?: string;

  /**
   * 是否启用技能调度
   */
  enableSkills?: boolean;

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
 * AgentManager 依赖
 */
export interface AgentManagerDeps {
  /**
   * LLM Provider
   */
  provider: LLMProvider;

  /**
   * 存储接口（可选）
   */
  storage?: {
    saveSession: (
      sessionId: string,
      messages: any[]
    ) => Promise<void>;
    loadSession: (
      sessionId: string
    ) => Promise<any | null>;
  };

  /**
   * 技能注册表（可选，如果不提供则创建新的）
   */
  skillRegistry?: SkillRegistry;
}

export class AgentManager {
  private agents = new Map<string, Agent>();
  private orchestrators = new Map<string, AgentOrchestrator>();
  private deps: AgentDeps;
  private skillRegistry: SkillRegistry;
  private config: AgentManagerConfig;

  constructor(config: AgentManagerConfig, deps: AgentManagerDeps) {
    this.config = config;

    // 创建 AgentDeps
    this.deps = {
      provider: deps.provider,
      storage: deps.storage,
    };

    // 管理 SkillRegistry（替代全局单例）
    this.skillRegistry = deps.skillRegistry || this.createDefaultSkillRegistry();
  }

  /**
   * 创建 Agent
   */
  createAgent(agentConfig: AgentConfig): Agent {
    const agent = new AgentClass(agentConfig, this.deps);
    this.agents.set(agentConfig.id, agent);

    // 为每个 Agent 创建对应的 Orchestrator
    const orchestratorConfig: OrchestratorConfig = {
      enableSkills: this.config.enableSkills ?? true,
      skillTimeout: this.config.skillTimeout,
      logSkillTriggers: this.config.logSkillTriggers,
    };

    const orchestrator = new AgentOrchestrator(orchestratorConfig, {
      agent,
      skillRegistry: this.skillRegistry,
    });

    this.orchestrators.set(agentConfig.id, orchestrator);

    return agent;
  }

  /**
   * 获取 Agent
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * 获取 Orchestrator
   *
   * 推荐使用 Orchestrator 而不是直接使用 Agent
   */
  getOrchestrator(id: string): AgentOrchestrator | undefined {
    return this.orchestrators.get(id);
  }

  /**
   * 删除 Agent
   */
  deleteAgent(id: string): void {
    this.agents.delete(id);
    this.orchestrators.delete(id);
  }

  /**
   * 列出所有 Agent
   */
  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map((agent) =>
      agent.getConfig()
    );
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * 获取技能注册表
   */
  getSkillRegistry(): SkillRegistry {
    return this.skillRegistry;
  }

  /**
   * 注册技能
   */
  registerSkill(skill: any): void {
    this.skillRegistry.register(skill);
  }

  /**
   * 创建默认的技能注册表
   *
   * 注意：这里不使用全局单例，而是创建独立的实例
   */
  private createDefaultSkillRegistry(): SkillRegistry {
    // 直接使用导入的 SkillRegistry 类
    return new SkillRegistryClass();
  }
}

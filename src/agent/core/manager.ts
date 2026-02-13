/**
 * Agent 管理器
 *
 * 职责：
 * - 管理 Agent 实例的生命周期
 * - 管理 ToolRegistry 实例
 * - 管理 SkillsManager 实例
 * - 创建 Orchestrator 作为统一入口
 * - 提供依赖注入支持
 *
 * 设计改进：
 * - 移除硬编码的 Storage 依赖
 * - 接受 StorageInterface 作为参数
 * - 管理 ToolRegistry（工具系统）
 * - 管理 SkillsManager（基于 pi-coding-agent）
 * - 集成 Orchestrator 层
 */

import type { AgentConfig } from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import type { AgentDeps, Agent } from "./agent.js";
import type { Tool, ToolConfig } from "../tools/index.js";
import type { SkillsManager } from "../skills/index.js";
import type { ToolRegistry } from "../tools/index.js";
import { Agent as AgentClass } from "./agent.js";
import { AgentOrchestrator, OrchestratorConfig } from "./orchestrator.js";
import { createToolRegistry } from "../tools/index.js";
// Memory Service 导入（可选）
import { MemoryService } from "@/storage/memory/index.js";

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
   * 数据目录（用于 MemoryService）
   */
  dataDir?: string;

  /**
   * 是否启用记忆系统
   */
  enableMemory?: boolean;

  /**
   * 工具配置
   */
  toolConfig?: ToolConfig;
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
    saveSession: (sessionId: string, messages: any[]) => Promise<void>;
    loadSession: (sessionId: string) => Promise<any | null>;
  };

  /**
   * 技能管理器（新系统，可选）
   */
  skillsManager?: SkillsManager;

  /**
   * 工具列表（可选）
   */
  tools?: Tool[];
}

export class AgentManager {
  private agents = new Map<string, Agent>();
  private orchestrators = new Map<string, AgentOrchestrator>();
  private deps: AgentDeps;
  private skillsManager?: SkillsManager;
  private tools: Tool[] = [];
  private toolConfig: ToolConfig = { enabled: true, maxIterations: 10 };
  private toolRegistry: ToolRegistry;
  private memoryService?: MemoryService;

  constructor(config: AgentManagerConfig, deps: AgentManagerDeps) {
    // 创建 AgentDeps
    this.deps = {
      provider: deps.provider,
      storage: deps.storage,
    };

    // 管理 SkillsManager（新系统）
    this.skillsManager = deps.skillsManager;

    // 创建 MemoryService（如果启用）
    if (config.enableMemory !== false) {
      this.memoryService = new MemoryService({
        dataDir: config.dataDir ?? "./data",
        searchEnabled: true,
        autoSaveEnabled: true,
      });
    }

    // 管理工具注册表
    this.toolRegistry = createToolRegistry();

    // 管理工具
    this.tools = deps.tools || [];
    if (this.tools.length > 0) {
      this.toolRegistry.registerAll(this.tools);
    }
    if (config.toolConfig) {
      this.toolConfig = { ...this.toolConfig, ...config.toolConfig };
    }
  }

  /**
   * 注册工具
   */
  registerTools(tools: Tool[]): void {
    this.tools = [...this.tools, ...tools];
    // 同时注册到工具注册表
    this.toolRegistry.registerAll(tools);
    console.log(
      `[AgentManager] Registered ${tools.length} tools (total: ${this.tools.length})`,
    );
  }

  /**
   * 获取工具列表
   */
  getTools(): Tool[] {
    return this.tools;
  }

  /**
   * 设置工具配置
   */
  setToolConfig(config: Partial<ToolConfig>): void {
    this.toolConfig = { ...this.toolConfig, ...config };
  }

  /**
   * 获取工具配置
   */
  getToolConfig(): ToolConfig {
    return this.toolConfig;
  }
  createAgent(agentConfig: AgentConfig): Agent {
    // 创建 AgentDeps，包含工具和 SkillsManager
    const agentDeps: AgentDeps = {
      ...this.deps,
      tools: this.tools,
      toolConfig: this.toolConfig,
      skillsManager: this.skillsManager, // 传递 SkillsManager
      memoryService: this.memoryService, // 传递 MemoryService
    };

    const agent = new AgentClass(agentConfig, agentDeps);
    this.agents.set(agentConfig.id, agent);

    // 为每个 Agent 创建对应的 Orchestrator
    const orchestratorConfig: OrchestratorConfig = {
      label: agentConfig.name,
    };

    const orchestrator = new AgentOrchestrator(orchestratorConfig, {
      agent,
      skillsManager: this.skillsManager, // 传递 SkillsManager
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
    return Array.from(this.agents.values()).map((agent) => agent.getConfig());
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * 获取工具注册表
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取技能管理器（新系统）
   */
  getSkillsManager(): SkillsManager | undefined {
    return this.skillsManager;
  }

  /**
   * 设置技能管理器（新系统）
   */
  setSkillsManager(skillsManager: SkillsManager): void {
    this.skillsManager = skillsManager;
  }

  /**
   * 启动管理器（启动 MemoryService）
   */
  async start(): Promise<void> {
    if (this.memoryService) {
      await this.memoryService.start();
    }
  }

  /**
   * 停止管理器（停止 MemoryService）
   */
  async stop(): Promise<void> {
    if (this.memoryService) {
      await this.memoryService.stop();
    }
  }

  /**
   * 获取 MemoryService（用于测试和外部访问）
   */
  getMemoryService(): MemoryService | undefined {
    return this.memoryService;
  }
}

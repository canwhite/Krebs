/**
 * Agent 管理器
 */

import type { AgentConfig } from "@/types/index.js";
import type { LLMProvider } from "@/provider/index.js";
import type { AgentDeps, Agent } from "./agent.js";
import { SessionStore } from "@/storage/index.js";
import { Agent as AgentClass } from "./agent.js";

export class AgentManager {
  private agents = new Map<string, Agent>();
  private deps: AgentDeps;

  constructor(provider: LLMProvider, storageDir: string) {
    this.deps = {
      provider,
      storage: {
        async saveSession(sessionId, messages) {
          const store = new SessionStore(storageDir);
          await store.saveSession(sessionId, messages as any);
        },
        async loadSession(sessionId) {
          const store = new SessionStore(storageDir);
          const session = await store.loadSession(sessionId);
          return session?.messages as any || null;
        },
      },
    };
  }

  /**
   * 创建 Agent
   */
  createAgent(config: AgentConfig): Agent {
    const agent = new AgentClass(config, this.deps);
    this.agents.set(config.id, agent);
    return agent;
  }

  /**
   * 获取 Agent
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * 删除 Agent
   */
  deleteAgent(id: string): void {
    this.agents.delete(id);
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
}

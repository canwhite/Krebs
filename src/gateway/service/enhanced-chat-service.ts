/**
 * 增强版 Chat Service
 *
 * 在标准 IChatService 基础上，添加会话管理功能
 */

import type { AgentResult } from "@/types/index.js";
import type { IChatService } from "./chat-service.js";
import type { AgentManager } from "@/agent/core/index.js";
import type { IEnhancedSessionStorage } from "@/storage/interface.js";
import type { SessionEntry } from "@/storage/session/index.js";
import crypto from "node:crypto";

/**
 * 增强版 Chat Service
 *
 * 扩展 IChatService，添加会话管理功能
 */
export class EnhancedChatService implements IChatService {
  constructor(
    private agentManager: AgentManager,
    private sessionStorage: IEnhancedSessionStorage
  ) {}

  /**
   * 处理聊天消息
   */
  async process(
    agentId: string,
    message: string,
    sessionId: string
  ): Promise<AgentResult> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.process(message, sessionId);
  }

  /**
   * 流式处理聊天消息
   */
  async processStream(
    agentId: string,
    message: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.processStream(message, sessionId, onChunk);
  }

  /**
   * 获取所有 Skills 列表
   */
  async getSkillsList(agentId: string): Promise<unknown[]> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const skillsManager = (orchestrator as any).deps?.skillsManager;

    if (!skillsManager) {
      return [];
    }

    return skillsManager.getAllSkills();
  }

  /**
   * 获取单个 Skill 详情
   */
  async getSkillDetails(agentId: string, skillName: string): Promise<unknown | null> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const skillsManager = (orchestrator as any).deps?.skillsManager;

    if (!skillsManager) {
      return null;
    }

    return skillsManager.getSkillByName(skillName) || null;
  }

  /**
   * 获取 Skills 统计信息
   */
  async getSkillsStats(agentId: string): Promise<unknown | null> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const skillsManager = (orchestrator as any).deps?.skillsManager;

    if (!skillsManager) {
      return null;
    }

    return skillsManager.getStats();
  }

  // ==================== 会话管理功能（新增）====================

  /**
   * 列出所有会话
   */
  async listSessions(filters?: {
    agentId?: string;
    limit?: number;
  }): Promise<Array<{ sessionId: string; entry: SessionEntry }>> {
    const store = this.sessionStorage.getStore();
    const sessions = await store.listSessions();

    let filtered = sessions;

    if (filters?.agentId) {
      filtered = sessions.filter((s: any) => s.entry.agentId === filters.agentId);
    }

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * 获取会话详情（包含元数据和消息）
   */
  async getSessionDetail(
    sessionId: string
  ): Promise<{ entry: SessionEntry; messages: any[] } | null> {
    return await this.sessionStorage.loadSessionWithMetadata(sessionId);
  }

  /**
   * 获取会话元数据
   */
  async getSessionMetadata(sessionId: string): Promise<SessionEntry | null> {
    const session = await this.sessionStorage.loadSessionWithMetadata(sessionId);
    return session?.entry ?? null;
  }

  /**
   * 更新会话元数据
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionEntry>
  ): Promise<SessionEntry | null> {
    return await this.sessionStorage.updateSessionMetadata(sessionId, metadata);
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.sessionStorage.deleteSession) {
      await this.sessionStorage.deleteSession(sessionId);
    }
  }

  /**
   * 重置会话（保留元数据，清空消息）
   */
  async resetSession(sessionId: string): Promise<void> {
    const session = await this.sessionStorage.loadSessionWithMetadata(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const store = this.sessionStorage.getStore();

    // 保存空消息列表
    await store.saveSession(sessionId, [], {
      ...session.entry,
      sessionId: crypto.randomUUID(),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      systemSent: false,
      abortedLastRun: false,
    });
  }

  /**
   * 获取会话统计
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalTokens: number;
  }> {
    const store = this.sessionStorage.getStore();
    const sessions = await store.listSessions();

    let totalMessages = 0;
    let totalTokens = 0;

    for (const session of sessions) {
      const fullSession = await store.loadSession(session.sessionKey);
      if (fullSession) {
        totalMessages += fullSession.messages.length;
        totalTokens += session.entry.totalTokens || 0;
      }
    }

    return {
      totalSessions: sessions.length,
      totalMessages,
      totalTokens,
    };
  }
}

/**
 * 创建增强版 Chat Service
 */
export function createEnhancedChatService(
  agentManager: AgentManager,
  sessionStorage: IEnhancedSessionStorage
): IChatService {
  return new EnhancedChatService(agentManager, sessionStorage);
}

/**
 * Chat Service 接口层
 *
 * 目的：
 * - 解耦 Gateway 和 Agent 层
 * - 提供统一的服务接口
 * - 便于测试和替换实现
 *
 * 设计原则：
 * - 接口隔离：Gateway 只依赖接口
 * - 依赖注入：通过构造函数注入实现
 * - 单一职责：专注于聊天服务
 */

import type { AgentResult } from "@/types/index.js";

/**
 * 聊天服务接口
 *
 * 定义聊天服务的基本操作
 */
export interface IChatService {
  /**
   * 处理聊天消息
   *
   * @param agentId - Agent ID
   * @param message - 用户消息
   * @param sessionId - 会话 ID
   * @returns 处理结果
   */
  process(
    agentId: string,
    message: string,
    sessionId: string
  ): Promise<AgentResult>;

  /**
   * 流式处理聊天消息
   *
   * @param agentId - Agent ID
   * @param message - 用户消息
   * @param sessionId - 会话 ID
   * @param onChunk - 流式回调
   * @returns 处理结果
   */
  processStream(
    agentId: string,
    message: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult>;
}

/**
 * Agent 聊天服务实现
 *
 * 基于 AgentManager 和 Orchestrator 实现
 */
import type { AgentManager } from "@/agent/core/index.js";

export class AgentChatService implements IChatService {
  constructor(private agentManager: AgentManager) {}

  async process(
    agentId: string,
    message: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 获取 Orchestrator（推荐使用）
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.process(message, sessionId);
  }

  async processStream(
    agentId: string,
    message: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    // 获取 Orchestrator（推荐使用）
    const orchestrator = this.agentManager.getOrchestrator(agentId);

    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.processStream(message, sessionId, onChunk);
  }
}

/**
 * 创建聊天服务的工厂函数
 *
 * @param agentManager - AgentManager 实例
 * @returns ChatService 实例
 */
export function createChatService(
  agentManager: AgentManager
): IChatService {
  return new AgentChatService(agentManager);
}

/**
 * Subagent Announce (通知机制)
 *
 * 职责：
 * - 管理 subagent 结果通知
 * - 支持多种通知模式（steer, followup, collect, silent）
 * - 格式化通知消息
 * - 处理通知队列
 */

import { createLogger } from "@/shared/logger.js";
import type { SubagentRunRecord, AnnounceMode } from "./types.js";

const log = createLogger("SubagentAnnounce");

export interface AnnounceMessage {
  sessionKey: string;
  content: string;
  mode: AnnounceMode;
  priority?: "high" | "normal" | "low";
}

export type NotificationHandler = (message: AnnounceMessage) => Promise<void>;

export class SubagentAnnounce {
  private handler?: NotificationHandler;
  private queue: Map<string, AnnounceMessage[]> = new Map();

  /**
   * 设置通知处理器
   */
  setNotificationHandler(handler: NotificationHandler): void {
    this.handler = handler;
    log.info("Notification handler registered");
  }

  /**
   * 格式化并发送通知
   */
  async announce(record: SubagentRunRecord): Promise<void> {
    const mode = (record.metadata?.announceMode as AnnounceMode) || "followup";
    const message = this.formatNotification(record, mode);

    if (mode === "silent") {
      log.debug(`Silent mode, skipping notification for ${record.runId}`);
      return;
    }

    if (this.handler) {
      await this.handler({
        sessionKey: record.requesterSessionKey,
        content: message,
        mode,
        priority: mode === "steer" ? "high" : "normal",
      });
      log.info(`Notification sent for ${record.runId} (mode: ${mode})`);
    } else {
      log.warn(`No notification handler set, queuing message for ${record.runId}`);
      this.queueMessage(record.requesterSessionKey, {
        sessionKey: record.requesterSessionKey,
        content: message,
        mode,
      });
    }
  }

  /**
   * 格式化通知消息
   */
  private formatNotification(record: SubagentRunRecord, mode: AnnounceMode): string {
    const label = record.label || `Subagent ${record.runId.slice(0, 8)}`;
    const status = record.outcome?.status || "running";

    let message = "";

    switch (mode) {
      case "steer":
        message = `📢 **${label}**\n\n`;
        message += `**任务**: ${record.task}\n\n`;
        if (status === "completed") {
          message += `✅ **完成**: ${this.formatResult(record)}\n`;
        } else if (status === "failed") {
          message += `❌ **失败**: ${record.outcome?.error || "未知错误"}\n`;
        } else if (status === "timeout") {
          message += `⏱️ **超时**: 任务执行超过 ${record.runTimeoutSeconds} 秒\n`;
        }
        break;

      case "followup":
        message = `**${label}**: `;
        if (status === "completed") {
          message += `${this.formatResult(record)}\n`;
        } else if (status === "failed") {
          message += `失败 - ${record.outcome?.error || "未知错误"}\n`;
        } else if (status === "timeout") {
          message += `超时\n`;
        }
        break;

      case "collect":
        message = `📋 **${label}**\n`;
        message += `- 任务: ${record.task}\n`;
        message += `- 状态: ${this.getStatusEmoji(status)} ${status}\n`;
        if (status === "completed" && record.outcome?.result) {
          message += `- 结果: ${this.formatResult(record)}\n`;
        }
        break;

      case "silent":
        // 不发送通知
        break;
    }

    // 添加元数据
    if (record.agentId) {
      message += `\n_Agent: ${record.agentId}_`;
    }
    if (record.model) {
      message += ` _Model: ${record.model}_`;
    }

    return message;
  }

  /**
   * 格式化结果
   */
  private formatResult(record: SubagentRunRecord): string {
    const result = record.outcome?.result;
    if (!result) return "无结果";

    if (typeof result === "string") {
      return result;
    } else if (typeof result === "object") {
      return JSON.stringify(result, null, 2);
    } else {
      return String(result);
    }
  }

  /**
   * 获取状态表情符号
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      case "timeout":
        return "⏱️";
      case "cancelled":
        return "🚫";
      default:
        return "⏳";
    }
  }

  /**
   * 将消息加入队列
   */
  private queueMessage(sessionKey: string, message: AnnounceMessage): void {
    const messages = this.queue.get(sessionKey) || [];
    messages.push(message);
    this.queue.set(sessionKey, messages);
  }

  /**
   * 处理队列中的消息（当处理器设置后）
   */
  async processQueue(sessionKey?: string): Promise<void> {
    if (!this.handler) {
      return;
    }

    const keys = sessionKey ? [sessionKey] : Array.from(this.queue.keys());

    for (const key of keys) {
      const messages = this.queue.get(key) || [];
      for (const message of messages) {
        await this.handler(message);
      }
      this.queue.delete(key);
    }

    log.info(`Processed ${keys.length} queued notifications`);
  }

  /**
   * 获取队列中的消息数量
   */
  getQueueCount(sessionKey?: string): number {
    if (sessionKey) {
      return (this.queue.get(sessionKey) || []).length;
    }
    return Array.from(this.queue.values()).reduce((sum, msgs) => sum + msgs.length, 0);
  }

  /**
   * 清空队列
   */
  clearQueue(sessionKey?: string): void {
    if (sessionKey) {
      this.queue.delete(sessionKey);
    } else {
      this.queue.clear();
    }
  }
}

// 全局单例
export const globalSubagentAnnounce = new SubagentAnnounce();

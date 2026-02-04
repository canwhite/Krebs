/**
 * Transcript 管理器
 *
 * 集成 @mariozechner/pi-coding-agent 的 SessionManager
 * 用于消息内容的格式化和验证
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { CURRENT_SESSION_VERSION } from "@mariozechner/pi-coding-agent";

import type { Message } from "@/types/index.js";

/**
 * Transcript 管理器选项
 */
export interface TranscriptManagerOptions {
  /** Transcript 文件目录 */
  transcriptDir: string;
}

/**
 * Transcript 管理器类
 *
 * 注意：SessionManager API 可能需要根据实际库版本调整
 * 当前实现提供基础框架
 */
export class TranscriptManager {
  private readonly transcriptDir: string;

  constructor(options: TranscriptManagerOptions) {
    this.transcriptDir = path.resolve(options.transcriptDir);
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 解析 transcript 文件路径
   */
  private resolveTranscriptPath(sessionId: string): string {
    return path.join(this.transcriptDir, `${sessionId}.jsonl`);
  }

  /**
   * 确保 transcript 文件存在（包含 header）
   */
  private async ensureTranscriptFile(sessionId: string): Promise<string> {
    await this.ensureDir(this.transcriptDir);

    const filePath = this.resolveTranscriptPath(sessionId);
    if (!existsSync(filePath)) {
      const header = {
        type: "session",
        version: CURRENT_SESSION_VERSION,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: process.cwd(),
      };
      await fs.writeFile(filePath, `${JSON.stringify(header)}\n`, "utf-8");
    }

    return filePath;
  }

  /**
   * 从消息列表构建 transcript
   *
   * 将简单的 Message 列表转换为 JSONL 格式
   */
  async buildTranscript(
    sessionId: string,
    messages: Message[],
  ): Promise<string> {
    const filePath = await this.ensureTranscriptFile(sessionId);

    // 追加消息到文件
    for (const message of messages) {
      await this.appendMessageToFile(filePath, message);
    }

    return filePath;
  }

  /**
   * 追加消息到 transcript
   */
  async appendMessage(
    sessionId: string,
    message: Message,
  ): Promise<void> {
    const filePath = await this.ensureTranscriptFile(sessionId);
    await this.appendMessageToFile(filePath, message);
  }

  /**
   * 追加消息到文件
   */
  private async appendMessageToFile(
    filePath: string,
    message: Message,
  ): Promise<void> {
    const messageRecord = {
      role: message.role,
      content: [{ type: "text", text: message.content }],
      timestamp: Date.now(),
    };

    await fs.appendFile(filePath, `${JSON.stringify(messageRecord)}\n`, "utf-8");
  }

  /**
   * 从 transcript 读取消息
   */
  async readTranscript(sessionId: string): Promise<Message[]> {
    const filePath = this.resolveTranscriptPath(sessionId);
    if (!existsSync(filePath)) {
      return [];
    }

    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    // 跳过 header 行
    const messages: Message[] = [];
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        // 跳过 header
        if (record.type === "session") continue;

        if (record.role && record.content) {
          messages.push({
            role: record.role,
            content: record.content
              .filter((c: { type: string }) => c.type === "text")
              .map((c: { text: string }) => c.text)
              .join("\n"),
          });
        }
      } catch {
        // 忽略无效行
      }
    }

    return messages;
  }

  /**
   * 删除 transcript
   */
  async deleteTranscript(sessionId: string): Promise<void> {
    const filePath = this.resolveTranscriptPath(sessionId);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  /**
   * 获取 transcript 统计信息
   */
  async getTranscriptStats(sessionId: string): Promise<{
    messageCount: number;
    filePath: string;
    exists: boolean;
  }> {
    const filePath = this.resolveTranscriptPath(sessionId);
    const exists = existsSync(filePath);

    if (!exists) {
      return {
        messageCount: 0,
        filePath,
        exists: false,
      };
    }

    const messages = await this.readTranscript(sessionId);
    return {
      messageCount: messages.length,
      filePath,
      exists: true,
    };
  }
}

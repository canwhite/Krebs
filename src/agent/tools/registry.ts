/**
 * 工具注册表
 *
 * 管理所有可用工具，提供注册、查找、执行功能
 */

import { createLogger } from "@/shared/logger.js";
import type { Tool, ToolCall, ToolResult } from "./types.js";

const logger = createLogger("ToolRegistry");

/**
 * 工具注册表类
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool already registered: ${tool.name}, overwriting...`);
    }

    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具名称列表
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 执行工具调用
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.get(toolCall.name);

    if (!tool) {
      logger.error(`Tool not found: ${toolCall.name}`);
      return {
        success: false,
        error: `Tool not found: ${toolCall.name}`,
      };
    }

    try {
      logger.debug(`Executing tool: ${toolCall.name}`, {
        args: toolCall.arguments,
      });

      const result = await tool.execute(toolCall.arguments);

      logger.debug(`Tool executed: ${toolCall.name}`, {
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error(`Tool execution error: ${toolCall.name}`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall);
      results.push(result);
    }

    return results;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    logger.debug("Tool registry cleared");
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }
}

/**
 * 创建工具注册表
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * 全局工具注册表（单例）
 *
 * @deprecated 推荐使用 createToolRegistry() 创建独立实例
 */
export const globalToolRegistry = createToolRegistry();
